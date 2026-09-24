<?php
/**
 * Lịch sử trò chuyện với trợ lý AI của người dùng đã đăng nhập (mỗi tài khoản một file trong api/storage/users/).
 *   GET                                  -> {messages:[{r:"user"|"assistant", c:"...", t:<unix>}]}
 *   POST {action:"add", q:"...", a:"..."} -> thêm một cặp hỏi – đáp
 *   POST {action:"clear"}                 -> xóa toàn bộ lịch sử của tài khoản
 * File chỉ chứa nội dung trò chuyện, không lưu tên đăng nhập; tên file là dấu băm của mã tài khoản nội bộ.
 */
declare(strict_types=1);

require __DIR__ . '/_auth.php';

const HISTORY_MAX_MESSAGES = 200;
const HISTORY_MAX_CHARS = 2000;

$user = ca_current_user();
if ($user === null) {
    ca_respond(401, ['error' => 'not_logged_in']);
}

$dir = ca_storage_dir() . '/users';
if (!is_dir($dir) && !(is_dir(ca_storage_dir()) && is_writable(ca_storage_dir()) && @mkdir($dir, 0700))) {
    ca_respond(503, ['error' => 'storage_unavailable']);
}
$file = ca_history_file($user['sub']);

/** Đọc-sửa-ghi file lịch sử có khóa, để hai yêu cầu cùng lúc không làm mất dữ liệu. */
function history_update(string $file, callable $change): array
{
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        ca_respond(503, ['error' => 'storage_unavailable']);
    }
    $data = json_decode((string)stream_get_contents($handle), true);
    $messages = is_array($data) && is_array($data['messages'] ?? null) ? $data['messages'] : [];
    $messages = $change($messages);
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode(['messages' => $messages], JSON_UNESCAPED_UNICODE));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $messages;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $messages = [];
    if (is_file($file)) {
        $data = json_decode((string)file_get_contents($file), true);
        if (is_array($data) && is_array($data['messages'] ?? null)) {
            $messages = $data['messages'];
        }
    }
    ca_respond(200, ['messages' => $messages]);
}

$in = ca_require_post_json();
$action = (string)($in['action'] ?? '');

if ($action === 'clear') {
    if (is_file($file)) {
        @unlink($file);
    }
    ca_respond(200, ['ok' => true]);
}

if ($action !== 'add') {
    ca_respond(400, ['error' => 'bad_action']);
}

// Tối đa 60 lượt lưu / 10 phút cho mỗi tài khoản
if (!ca_rate_limit('history|' . $user['sub'], 60, 600)) {
    ca_respond(429, ['error' => 'rate_limited']);
}

$q = $in['q'] ?? '';
$a = $in['a'] ?? '';
if (!is_string($q) || !is_string($a)) {
    ca_respond(400, ['error' => 'bad_request']);
}
$q = trim(mb_substr($q, 0, HISTORY_MAX_CHARS));
$a = trim(mb_substr($a, 0, HISTORY_MAX_CHARS));
if ($q === '' || $a === '') {
    ca_respond(400, ['error' => 'bad_request']);
}

$now = time();
history_update($file, static function (array $messages) use ($q, $a, $now): array {
    $messages[] = ['r' => 'user', 'c' => $q, 't' => $now];
    $messages[] = ['r' => 'assistant', 'c' => $a, 't' => $now];
    return array_slice($messages, -HISTORY_MAX_MESSAGES);
});
ca_respond(200, ['ok' => true]);
