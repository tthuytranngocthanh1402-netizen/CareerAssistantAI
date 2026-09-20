<?php
/**
 * Tải kết quả Holland ẩn danh dưới dạng CSV. Yêu cầu đăng nhập:
 *   Tên đăng nhập: admin
 *   Mật khẩu: giá trị 'admin_password' trong api/config.php
 */
declare(strict_types=1);

$config = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$password = is_array($config) ? (string)($config['admin_password'] ?? '') : '';
if ($password === '' || $password === 'DAT_MAT_KHAU_QUAN_TRI') {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Chua cau hinh admin_password trong api/config.php');
}

$user = $_SERVER['PHP_AUTH_USER'] ?? '';
$pass = $_SERVER['PHP_AUTH_PW'] ?? '';
// Một số hosting chuyển tiếp tiêu đề Authorization qua biến môi trường thay vì PHP_AUTH_*
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($user === '' && stripos($auth, 'basic ') === 0) {
    $decoded = base64_decode(substr($auth, 6), true);
    if ($decoded !== false && strpos($decoded, ':') !== false) {
        [$user, $pass] = explode(':', $decoded, 2);
    }
}
if ($user !== 'admin' || !hash_equals($password, (string)$pass)) {
    header('WWW-Authenticate: Basic realm="Holland export", charset="UTF-8"');
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Can dang nhap');
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="holland-' . gmdate('Ymd') . '.csv"');
header('Cache-Control: no-store');

$out = fopen('php://output', 'w');
fputcsv($out, ['date', 'grade', 'gender', 'R', 'I', 'A', 'S', 'E', 'C', 'code', 'version']);
$file = __DIR__ . '/storage/holland.jsonl';
if (is_file($file)) {
    $letters = ['R', 'I', 'A', 'S', 'E', 'C'];
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $r = json_decode($line, true);
        if (!is_array($r) || !isset($r['r']) || count($r['r']) !== 6) {
            continue;
        }
        $pairs = [];
        foreach ($r['r'] as $i => $s) {
            $pairs[] = ['i' => $i, 's' => (int)$s];
        }
        usort($pairs, static fn($a, $b) => ($b['s'] <=> $a['s']) ?: ($a['i'] <=> $b['i']));
        $code = '';
        foreach (array_slice($pairs, 0, 3) as $p) {
            $code .= $letters[$p['i']];
        }
        fputcsv($out, array_merge([$r['d'] ?? '', $r['g'] ?? '', $r['s'] ?? ''], $r['r'], [$code, $r['v'] ?? '']));
    }
}
fclose($out);
