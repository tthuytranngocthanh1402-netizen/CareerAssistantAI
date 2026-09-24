<?php
/**
 * Trang quản trị tài khoản người dùng (chỉ dành cho nhóm nghiên cứu).
 * Đăng nhập: tên "admin", mật khẩu là 'admin_password' trong api/config.php (giống trang tải CSV Holland).
 *
 * Xem được: tên đăng nhập, ngày tạo, số tin nhắn và thời điểm trò chuyện gần nhất.
 * KHÔNG xem được: mật khẩu (chỉ lưu bản băm) và nội dung trò chuyện (trang này không hiển thị).
 * Thao tác: đặt lại mật khẩu (tạo mật khẩu tạm mới, hiện một lần) và xóa tài khoản (kèm lịch sử trò chuyện).
 * Cả hai thao tác có hiệu lực ngay: phiên đăng nhập cũ của tài khoản đó không còn dùng được.
 */
declare(strict_types=1);

require __DIR__ . '/_auth.php';

date_default_timezone_set('Asia/Ho_Chi_Minh');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

function admin_text(int $status, string $text): void
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    exit($text);
}

// ---- Xác thực quản trị (HTTP Basic) ----
$config = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$adminPassword = is_array($config) ? (string)($config['admin_password'] ?? '') : '';
if ($adminPassword === '' || $adminPassword === 'DAT_MAT_KHAU_QUAN_TRI') {
    admin_text(503, 'Chua cau hinh admin_password trong api/config.php');
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
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if ($user !== 'admin' || !hash_equals($adminPassword, (string)$pass)) {
    // Chống dò mật khẩu quản trị: tối đa 10 lần sai / 10 phút cho mỗi IP
    if ($user !== '' && !ca_rate_limit('adminfail|' . $ip, 10, 600)) {
        admin_text(429, 'Thu sai qua nhieu lan, vui long doi it phut');
    }
    header('WWW-Authenticate: Basic realm="Quan tri tai khoan", charset="UTF-8"');
    admin_text(401, 'Can dang nhap');
}

$dir = ca_storage_dir();
$accountsDir = $dir . '/accounts';
if (!is_dir($dir) || !is_writable($dir)) {
    admin_text(503, 'Thu muc api/storage khong ghi duoc');
}
$secret = ca_secret(true);
if ($secret === null) {
    admin_text(503, 'Khong tao duoc khoa phien');
}
// Mã chống giả mạo yêu cầu (Basic auth được trình duyệt tự gửi kèm, nên cần thêm mã này cho các thao tác POST)
$csrf = hash_hmac('sha256', 'admin-csrf', $secret);

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function read_json(string $file): ?array
{
    $data = json_decode((string)@file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

// ---- Thao tác (POST) ----
$notice = '';
$noticeClass = 'ok';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $selfHost = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
        if (!$originHost || strcasecmp($originHost, (string)$selfHost) !== 0) {
            admin_text(403, 'Nguon yeu cau khong hop le');
        }
    }
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) {
        admin_text(403, 'Ma bao ve khong hop le, hay tai lai trang');
    }
    $action = (string)($_POST['action'] ?? '');
    $target = (string)($_POST['username'] ?? '');
    $file = ca_account_file($target);
    $account = preg_match('/^[A-Za-z0-9._-]{3,30}$/', $target) && is_file($file) ? read_json($file) : null;

    if ($account === null || !isset($account['id'], $account['u'])) {
        $notice = 'Không tìm thấy tài khoản này.';
        $noticeClass = 'err';
    } elseif ($action === 'delete') {
        @unlink(ca_history_file((string)$account['id']));
        @unlink($file);
        $notice = 'Đã xóa tài khoản "' . $account['u'] . '" cùng lịch sử trò chuyện của tài khoản này.';
    } elseif ($action === 'reset') {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // bỏ các ký tự dễ nhầm: i, l, o, 0, 1
        $temp = '';
        for ($i = 0; $i < 10; $i++) {
            $temp .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $account['h'] = password_hash($temp, PASSWORD_DEFAULT);
        $account['v'] = bin2hex(random_bytes(4)); // đổi phiên bản: mọi phiên đăng nhập cũ của tài khoản này hết hiệu lực
        if (@file_put_contents($file, json_encode($account, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
            $notice = 'Không ghi được dữ liệu, vui lòng thử lại.';
            $noticeClass = 'err';
        } else {
            $notice = 'Đã đặt lại mật khẩu cho "' . $account['u'] . '". Mật khẩu tạm (chỉ hiện một lần, hãy gửi cho người dùng và nhắc họ đăng nhập lại): ' . $temp;
        }
    } else {
        $notice = 'Thao tác không hợp lệ.';
        $noticeClass = 'err';
    }
}

// ---- Danh sách tài khoản ----
$rows = [];
foreach ((array)glob($accountsDir . '/*.json') as $path) {
    $a = read_json($path);
    if ($a === null || !isset($a['id'], $a['u'])) {
        continue;
    }
    $count = 0;
    $last = 0;
    $historyFile = ca_history_file((string)$a['id']);
    if (is_file($historyFile)) {
        $hist = read_json($historyFile);
        foreach ((array)($hist['messages'] ?? []) as $m) {
            $count++;
            $last = max($last, (int)($m['t'] ?? 0));
        }
    }
    $rows[] = ['u' => (string)$a['u'], 'c' => (string)($a['c'] ?? ''), 'n' => $count, 'last' => $last];
}
// Mới tạo lên trước; cùng ngày thì xếp theo tên
usort($rows, static fn($x, $y) => strcmp($y['c'], $x['c']) ?: strcasecmp($x['u'], $y['u']));
$totalMessages = array_sum(array_column($rows, 'n'));
$withChat = count(array_filter($rows, static fn($r) => $r['n'] > 0));

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Quản lý tài khoản – CareerAssistantAI</title>
  <link rel="stylesheet" href="admin.css">
</head>
<body>
<main>
  <h1>Quản lý tài khoản</h1>
  <p class="muted">Trang này chỉ hiển thị thống kê. Mật khẩu và nội dung trò chuyện của người dùng không được hiển thị.</p>

  <?php if ($notice !== ''): ?>
    <p class="notice <?= h($noticeClass) ?>" role="status"><?= h($notice) ?></p>
  <?php endif; ?>

  <ul class="stats">
    <li><b><?= count($rows) ?></b> tài khoản</li>
    <li><b><?= $withChat ?></b> tài khoản đã trò chuyện</li>
    <li><b><?= $totalMessages ?></b> tin nhắn đã lưu</li>
  </ul>

  <?php if (!$rows): ?>
    <p>Chưa có tài khoản nào.</p>
  <?php else: ?>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Tên đăng nhập</th><th>Ngày tạo</th><th class="num">Số tin nhắn</th><th>Trò chuyện gần nhất</th><th>Thao tác</th></tr>
      </thead>
      <tbody>
      <?php foreach ($rows as $r): ?>
        <tr>
          <td><?= h($r['u']) ?></td>
          <td><?= h($r['c'] !== '' ? date('d/m/Y', (int)strtotime($r['c'] . ' 12:00:00 UTC')) : '–') ?></td>
          <td class="num"><?= $r['n'] ?></td>
          <td><?= $r['last'] > 0 ? h(date('d/m/Y H:i', $r['last'])) : '–' ?></td>
          <td class="actions">
            <form method="post" onsubmit="return confirm('Đặt lại mật khẩu cho &quot;<?= h($r['u']) ?>&quot;? Mật khẩu cũ sẽ không dùng được nữa và mọi phiên đăng nhập của tài khoản này sẽ bị thoát.');">
              <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
              <input type="hidden" name="username" value="<?= h($r['u']) ?>">
              <button name="action" value="reset" type="submit">Đặt lại mật khẩu</button>
            </form>
            <form method="post" onsubmit="return confirm('Xóa tài khoản &quot;<?= h($r['u']) ?>&quot; và toàn bộ lịch sử trò chuyện? Không thể hoàn tác.');">
              <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
              <input type="hidden" name="username" value="<?= h($r['u']) ?>">
              <button name="action" value="delete" type="submit" class="danger">Xóa</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</main>
</body>
</html>
