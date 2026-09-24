<?php
/**
 * Kết quả trắc nghiệm Holland đã lưu của người dùng đã đăng nhập (mọi lần làm bài), để xem lại sau.
 * Tách biệt với việc "gửi ẩn danh cho nghiên cứu" (api/holland.php): dữ liệu ở đây gắn với tài khoản và chỉ chủ tài khoản xem được.
 *   GET                                          -> {results:[{t:<unix>, m:"short"|"full", s:[6 điểm]}]}   (cũ -> mới)
 *   POST {action:"add", mode, scores:[6 điểm]}   -> lưu một lần làm bài
 *   POST {action:"delete", t:<unix>}             -> xóa một lần làm bài
 *   POST {action:"clear"}                        -> xóa tất cả
 * Mỗi tài khoản một file trong api/storage/users/, tối đa RESULTS_MAX lần làm gần nhất.
 */
declare(strict_types=1);

require __DIR__ . '/_auth.php';

const RESULTS_MAX = 50;

$user = ca_current_user();
if ($user === null) {
    ca_respond(401, ['error' => 'not_logged_in']);
}

$dir = ca_storage_dir() . '/users';
if (!is_dir($dir) && !(is_dir(ca_storage_dir()) && is_writable(ca_storage_dir()) && @mkdir($dir, 0700))) {
    ca_respond(503, ['error' => 'storage_unavailable']);
}
$file = ca_results_file($user['sub']);

/** Đọc-sửa-ghi có khóa để hai yêu cầu cùng lúc không làm mất dữ liệu. */
function results_update(string $file, callable $change): void
{
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        ca_respond(503, ['error' => 'storage_unavailable']);
    }
    $data = json_decode((string)stream_get_contents($handle), true);
    $results = is_array($data) && is_array($data['results'] ?? null) ? $data['results'] : [];
    $results = array_values($change($results));
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode(['results' => $results]));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $results = [];
    if (is_file($file)) {
        $data = json_decode((string)file_get_contents($file), true);
        if (is_array($data) && is_array($data['results'] ?? null)) {
            $results = $data['results'];
        }
    }
    ca_respond(200, ['results' => $results]);
}

$in = ca_require_post_json();
$action = (string)($in['action'] ?? '');

if ($action === 'clear') {
    if (is_file($file)) {
        @unlink($file);
    }
    ca_respond(200, ['ok' => true]);
}

if ($action === 'delete') {
    $t = $in['t'] ?? null;
    if (!is_int($t) || !is_file($file)) {
        ca_respond(400, ['error' => 'bad_request']);
    }
    results_update($file, static fn(array $results): array => array_filter(
        $results,
        static fn($r) => !is_array($r) || (int)($r['t'] ?? 0) !== $t
    ));
    ca_respond(200, ['ok' => true]);
}

if ($action !== 'add') {
    ca_respond(400, ['error' => 'bad_action']);
}

// Bản 36 câu: mỗi nhóm 6–30 điểm; bản 60 câu: mỗi nhóm 10–50 điểm
$mode = (string)($in['mode'] ?? '');
$perType = ['short' => 6, 'full' => 10][$mode] ?? null;
$scores = $in['scores'] ?? null;
if ($perType === null || !is_array($scores) || count($scores) !== 6) {
    ca_respond(400, ['error' => 'bad_request']);
}
$clean = [];
foreach ($scores as $v) {
    if (!is_int($v) || $v < $perType || $v > $perType * 5) {
        ca_respond(400, ['error' => 'bad_scores']);
    }
    $clean[] = $v;
}

// Tối đa 30 lượt lưu / 10 phút cho mỗi tài khoản
if (!ca_rate_limit('results|' . $user['sub'], 30, 600)) {
    ca_respond(429, ['error' => 'rate_limited']);
}

$now = time();
results_update($file, static function (array $results) use ($now, $mode, $clean): array {
    $results[] = ['t' => $now, 'm' => $mode, 's' => $clean];
    return array_slice($results, -RESULTS_MAX);
});
ca_respond(200, ['ok' => true, 't' => $now]);
