<?php
/**
 * Đăng nhập bằng tài khoản Google (Gmail).
 *   GET                    -> {enabled, client_id, user}   (trình duyệt dùng để hiện nút đăng nhập / thông tin tài khoản)
 *   POST {action:"login", credential:"<Google ID token>"}  -> kiểm tra token, đặt cookie phiên, trả về {user}
 *   POST {action:"logout"}                                 -> xóa cookie phiên
 * Cần khai báo 'google_client_id' trong api/config.php (xem README).
 */
declare(strict_types=1);

require __DIR__ . '/_auth.php';

$clientId = ca_client_id();
$storageOk = is_dir(ca_storage_dir()) && is_writable(ca_storage_dir());

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $user = $clientId !== '' ? ca_current_user() : null;
    ca_respond(200, [
        'enabled' => $clientId !== '' && $storageOk,
        'client_id' => $clientId,
        'user' => $user ? ca_public_user($user) : null,
    ]);
}

$in = ca_require_post_json();
$action = (string)($in['action'] ?? '');

if ($action === 'logout') {
    ca_clear_session();
    ca_respond(200, ['ok' => true]);
}

if ($action !== 'login') {
    ca_respond(400, ['error' => 'bad_action']);
}
if ($clientId === '' || !$storageOk) {
    ca_respond(503, ['error' => 'not_configured']);
}

// Tối đa 10 lần đăng nhập / 10 phút cho mỗi IP
if (!ca_rate_limit('login|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 600)) {
    ca_respond(429, ['error' => 'rate_limited']);
}

$credential = $in['credential'] ?? '';
if (!is_string($credential) || $credential === '' || strlen($credential) > 4000) {
    ca_respond(400, ['error' => 'bad_credential']);
}

$user = ca_verify_google_token($credential, $clientId);
if ($user === null) {
    ca_respond(401, ['error' => 'invalid_token']);
}

$secret = ca_secret(true);
if ($secret === null) {
    ca_respond(503, ['error' => 'not_configured']);
}
ca_issue_session($user, $secret);
ca_respond(200, ['user' => ca_public_user($user)]);
