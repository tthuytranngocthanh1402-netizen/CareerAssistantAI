<?php
/**
 * Nhận kết quả trắc nghiệm Holland ẩn danh (chỉ khi học sinh đồng ý) và ghi vào api/storage/holland.jsonl.
 * Không lưu họ tên, địa chỉ IP hay user-agent. Thư mục storage bị chặn truy cập trực tiếp bằng .htaccess.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$dir = __DIR__ . '/storage';
$file = $dir . '/holland.jsonl';
$writable = is_dir($dir) && is_writable($dir);

// Kiểm tra trạng thái (client dùng để quyết định có hiện ô gửi kết quả hay không)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, ['ok' => $writable]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'method_not_allowed']);
}
if (!$writable) {
    respond(503, ['error' => 'storage_unavailable']);
}

// Chỉ chấp nhận yêu cầu từ cùng domain
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = parse_url($origin, PHP_URL_HOST);
    $selfHost = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
    if (!$originHost || strcasecmp($originHost, (string)$selfHost) !== 0) {
        respond(403, ['error' => 'forbidden_origin']);
    }
}

// Giới hạn 5 lần gửi / giờ cho mỗi IP (chỉ lưu dấu băm tạm trong thư mục tạm, không lưu cùng dữ liệu)
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/careerassistant_holland_' . hash('sha256', $ip);
$now = time();
$hits = [];
if (is_file($rateFile)) {
    $decoded = json_decode((string)file_get_contents($rateFile), true);
    if (is_array($decoded)) {
        $hits = array_values(array_filter($decoded, static fn($t) => is_int($t) && $t > $now - 3600));
    }
}
if (count($hits) >= 5) {
    respond(429, ['error' => 'rate_limited']);
}

$raw = file_get_contents('php://input', false, null, 0, 2000);
$in = json_decode((string)$raw, true);
if (!is_array($in) || ($in['consent'] ?? null) !== true) {
    respond(400, ['error' => 'consent_required']);
}

$scores = $in['scores'] ?? null;
if (!is_array($scores) || count($scores) !== 6) {
    respond(400, ['error' => 'bad_scores']);
}
// Chế độ: 'short' (36 câu, mỗi nhóm 6–30 điểm) hoặc 'full' (60 câu, mỗi nhóm 10–50 điểm). Thiếu thì coi là 'short'.
$mode = (string)($in['mode'] ?? 'short');
$perType = ['short' => 6, 'full' => 10][$mode] ?? null;
if ($perType === null) {
    respond(400, ['error' => 'bad_mode']);
}
$clean = [];
foreach ($scores as $v) {
    if (!is_int($v) || $v < $perType || $v > $perType * 5) {
        respond(400, ['error' => 'bad_scores']);
    }
    $clean[] = $v;
}

$grade = (string)($in['grade'] ?? '');
$gender = (string)($in['gender'] ?? '');
if (!in_array($grade, ['', '10', '11', '12'], true) || !in_array($gender, ['', 'nam', 'nu'], true)) {
    respond(400, ['error' => 'bad_fields']);
}
$version = preg_replace('/[^0-9A-Za-z._-]/', '', substr((string)($in['v'] ?? ''), 0, 10));

$row = ['d' => gmdate('Y-m-d'), 'g' => $grade, 's' => $gender, 'm' => $mode, 'r' => $clean, 'v' => $version];
$ok = @file_put_contents($file, json_encode($row) . "\n", FILE_APPEND | LOCK_EX);
if ($ok === false) {
    respond(500, ['error' => 'write_failed']);
}

$hits[] = $now;
@file_put_contents($rateFile, json_encode($hits), LOCK_EX);
respond(200, ['ok' => true]);
