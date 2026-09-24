<?php
/**
 * Tài khoản bằng tên đăng nhập + mật khẩu do người dùng tự đặt (không cần dịch vụ bên ngoài).
 *   GET                                                   -> {enabled, user}
 *   POST {action:"register", username, password}          -> tạo tài khoản và đăng nhập luôn
 *   POST {action:"login",    username, password}          -> đăng nhập
 *   POST {action:"logout"}                                -> xóa cookie phiên
 * Mật khẩu chỉ được lưu dưới dạng băm bcrypt (password_hash) trong api/storage/accounts/, không lưu bản gốc.
 * Mỗi tài khoản là một file; tên file là dấu băm của tên đăng nhập (không phân biệt hoa/thường).
 */
declare(strict_types=1);

require __DIR__ . '/_auth.php';

const USERNAME_PATTERN = '/^[A-Za-z0-9._-]{3,30}$/';
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt chỉ dùng 72 byte đầu của mật khẩu

$storageOk = is_dir(ca_storage_dir()) && is_writable(ca_storage_dir());

function account_file(string $username): string
{
    return ca_storage_dir() . '/accounts/' . hash('sha256', 'ca-user|' . strtolower($username)) . '.json';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $user = ca_current_user();
    ca_respond(200, ['enabled' => $storageOk, 'user' => $user ? ca_public_user($user) : null]);
}

$in = ca_require_post_json();
$action = (string)($in['action'] ?? '');

if ($action === 'logout') {
    ca_clear_session();
    ca_respond(200, ['ok' => true]);
}
if ($action !== 'register' && $action !== 'login') {
    ca_respond(400, ['error' => 'bad_action']);
}
if (!$storageOk) {
    ca_respond(503, ['error' => 'not_configured']);
}

$username = trim((string)($in['username'] ?? ''));
$password = is_string($in['password'] ?? null) ? $in['password'] : '';
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$dir = ca_storage_dir() . '/accounts';
if (!is_dir($dir) && !@mkdir($dir, 0700)) {
    ca_respond(503, ['error' => 'storage_unavailable']);
}

if ($action === 'register') {
    // Tối đa 5 tài khoản mới / giờ cho mỗi IP
    if (!ca_rate_limit('register|' . $ip, 5, 3600)) {
        ca_respond(429, ['error' => 'rate_limited']);
    }
    if (!preg_match(USERNAME_PATTERN, $username)) {
        ca_respond(400, ['error' => 'bad_username']);
    }
    if (strlen($password) < PASSWORD_MIN || strlen($password) > PASSWORD_MAX || strcasecmp($password, $username) === 0) {
        ca_respond(400, ['error' => 'bad_password']);
    }
    $secret = ca_secret(true);
    if ($secret === null) {
        ca_respond(503, ['error' => 'not_configured']);
    }

    $file = account_file($username);
    $handle = @fopen($file, 'x'); // 'x': thất bại nếu tên đã tồn tại, nên hai người đăng ký cùng lúc không ghi đè nhau
    if ($handle === false) {
        ca_respond(is_file($file) ? 409 : 503, ['error' => is_file($file) ? 'username_taken' : 'storage_unavailable']);
    }
    $id = bin2hex(random_bytes(16));
    fwrite($handle, json_encode([
        'id' => $id,
        'u' => $username,
        'h' => password_hash($password, PASSWORD_DEFAULT),
        'c' => gmdate('Y-m-d'),
    ], JSON_UNESCAPED_UNICODE));
    fclose($handle);
    @chmod($file, 0600);

    $user = ['sub' => $id, 'name' => $username];
    ca_issue_session($user, $secret);
    ca_respond(200, ['user' => ca_public_user($user)]);
}

// ---- Đăng nhập ----
// Tối đa 10 lần thử / 10 phút cho mỗi IP, và 6 lần / 10 phút cho mỗi cặp IP + tên đăng nhập
if (!ca_rate_limit('login|' . $ip, 10, 600) || !ca_rate_limit('login|' . $ip . '|' . strtolower($username), 6, 600)) {
    ca_respond(429, ['error' => 'rate_limited']);
}

$account = null;
if (preg_match(USERNAME_PATTERN, $username) && strlen($password) <= PASSWORD_MAX && is_file(account_file($username))) {
    $data = json_decode((string)file_get_contents(account_file($username)), true);
    if (is_array($data) && isset($data['id'], $data['u'], $data['h'])) {
        $account = $data;
    }
}
if ($account !== null) {
    $valid = password_verify($password, (string)$account['h']);
} else {
    password_hash($password, PASSWORD_DEFAULT); // tốn thời gian tương đương, để không lộ tên đăng nhập nào tồn tại
    $valid = false;
}
if (!$valid) {
    ca_respond(401, ['error' => 'invalid_credentials']);
}

$secret = ca_secret(true);
if ($secret === null) {
    ca_respond(503, ['error' => 'not_configured']);
}
$user = ['sub' => (string)$account['id'], 'name' => (string)$account['u']];
ca_issue_session($user, $secret);
ca_respond(200, ['user' => ca_public_user($user)]);
