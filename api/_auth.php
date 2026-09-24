<?php
/**
 * Hàm dùng chung cho đăng nhập Google và lịch sử trò chuyện (auth.php, history.php).
 * File này chỉ khai báo hàm, không được gọi trực tiếp từ web (bị chặn trong api/.htaccess).
 *
 * Phiên đăng nhập là một cookie đã ký HMAC (không cần cơ sở dữ liệu). Khóa ký được tạo tự động
 * trong api/storage/session.key ở lần đăng nhập đầu tiên; thư mục storage bị chặn truy cập từ web.
 */
declare(strict_types=1);

const CA_COOKIE = 'ca_session';
const CA_SESSION_DAYS = 30;

function ca_respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function ca_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        $loaded = is_file($file) ? require $file : null;
        $config = is_array($loaded) ? $loaded : [];
    }
    return $config;
}

/** Google OAuth Client ID; chuỗi rỗng nghĩa là tính năng đăng nhập chưa được bật. */
function ca_client_id(): string
{
    $id = trim((string)(ca_config()['google_client_id'] ?? ''));
    if ($id === '' || strpos($id, 'DAN_') === 0) {
        return '';
    }
    return $id;
}

function ca_storage_dir(): string
{
    return __DIR__ . '/storage';
}

function ca_b64u(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function ca_b64u_decode(string $text): string
{
    $decoded = base64_decode(strtr($text, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

/** Khóa ký cookie. $create = true chỉ dùng khi đăng nhập: tạo khóa mới nếu chưa có. */
function ca_secret(bool $create = false): ?string
{
    $file = ca_storage_dir() . '/session.key';
    $read = static function () use ($file): ?string {
        $v = is_file($file) ? trim((string)@file_get_contents($file)) : '';
        return strlen($v) >= 32 ? $v : null;
    };
    $existing = $read();
    if ($existing !== null || !$create) {
        return $existing;
    }
    $dir = ca_storage_dir();
    if (!is_dir($dir) || !is_writable($dir)) {
        return null;
    }
    $handle = @fopen($file, 'x'); // 'x': chỉ tạo nếu chưa tồn tại, tránh hai yêu cầu cùng ghi đè khóa
    if ($handle !== false) {
        fwrite($handle, bin2hex(random_bytes(32)));
        fclose($handle);
        @chmod($file, 0600);
    }
    return $read();
}

function ca_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function ca_set_cookie(string $value, int $expires): void
{
    setcookie(CA_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => ca_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function ca_issue_session(array $user, string $secret): void
{
    $expires = time() + CA_SESSION_DAYS * 86400;
    $payload = ca_b64u(json_encode([
        'sub' => $user['sub'],
        'name' => $user['name'],
        'email' => $user['email'],
        'picture' => $user['picture'],
        'exp' => $expires,
    ], JSON_UNESCAPED_UNICODE));
    $sig = ca_b64u(hash_hmac('sha256', $payload, $secret, true));
    ca_set_cookie($payload . '.' . $sig, $expires);
}

function ca_clear_session(): void
{
    ca_set_cookie('', time() - 3600);
}

/** Người dùng đang đăng nhập (đọc từ cookie đã ký) hoặc null. */
function ca_current_user(): ?array
{
    $raw = $_COOKIE[CA_COOKIE] ?? '';
    if (!is_string($raw) || strpos($raw, '.') === false || strlen($raw) > 4000) {
        return null;
    }
    [$payload, $sig] = explode('.', $raw, 2);
    $secret = ca_secret();
    if ($secret === null) {
        return null;
    }
    if (!hash_equals(ca_b64u(hash_hmac('sha256', $payload, $secret, true)), $sig)) {
        return null;
    }
    $data = json_decode(ca_b64u_decode($payload), true);
    if (!is_array($data) || !isset($data['sub'], $data['exp']) || (int)$data['exp'] < time() || (string)$data['sub'] === '') {
        return null;
    }
    return [
        'sub' => (string)$data['sub'],
        'name' => (string)($data['name'] ?? ''),
        'email' => (string)($data['email'] ?? ''),
        'picture' => (string)($data['picture'] ?? ''),
    ];
}

/** Phần thông tin được gửi về trình duyệt (không có mã định danh nội bộ). */
function ca_public_user(array $user): array
{
    return ['name' => $user['name'], 'email' => $user['email'], 'picture' => $user['picture']];
}

/** Yêu cầu ghi dữ liệu (POST): cùng domain và là JSON, để chống giả mạo yêu cầu từ trang khác. */
function ca_require_post_json(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        ca_respond(405, ['error' => 'method_not_allowed']);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $selfHost = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
        if (!$originHost || strcasecmp($originHost, (string)$selfHost) !== 0) {
            ca_respond(403, ['error' => 'forbidden_origin']);
        }
    }
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if ($site !== '' && $site !== 'same-origin' && $site !== 'none') {
        ca_respond(403, ['error' => 'forbidden_origin']);
    }
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) {
        ca_respond(415, ['error' => 'json_required']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 12000);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        ca_respond(400, ['error' => 'bad_request']);
    }
    return $data;
}

/** Giới hạn $limit lần / $window giây cho mỗi khóa. Trả về false nếu đã vượt giới hạn. */
function ca_rate_limit(string $key, int $limit, int $window): bool
{
    $file = sys_get_temp_dir() . '/careerassistant_' . hash('sha256', $key);
    $now = time();
    $hits = [];
    if (is_file($file)) {
        $decoded = json_decode((string)file_get_contents($file), true);
        if (is_array($decoded)) {
            $hits = array_values(array_filter($decoded, static fn($t) => is_int($t) && $t > $now - $window));
        }
    }
    if (count($hits) >= $limit) {
        return false;
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return true;
}

/** Kiểm tra mã ID token của Google (qua tokeninfo) và trả về thông tin người dùng, hoặc null nếu không hợp lệ. */
function ca_verify_google_token(string $idToken, string $clientId): ?array
{
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false || $status !== 200) {
        return null;
    }
    $d = json_decode((string)$response, true);
    if (!is_array($d)) {
        return null;
    }
    if (($d['aud'] ?? '') !== $clientId
        || !in_array($d['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
        || (int)($d['exp'] ?? 0) < time()
        || !in_array($d['email_verified'] ?? '', ['true', true], true)
        || empty($d['sub']) || empty($d['email'])) {
        return null;
    }
    $email = mb_substr((string)$d['email'], 0, 120);
    $name = trim((string)($d['name'] ?? ''));
    if ($name === '') {
        $name = strstr($email, '@', true) ?: $email;
    }
    $picture = (string)($d['picture'] ?? '');
    if (strpos($picture, 'https://') !== 0 || strlen($picture) > 400) {
        $picture = '';
    }
    return [
        'sub' => mb_substr((string)$d['sub'], 0, 64),
        'name' => mb_substr($name, 0, 80),
        'email' => $email,
        'picture' => $picture,
    ];
}
