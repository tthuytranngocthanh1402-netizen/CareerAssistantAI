<?php
/**
 * Proxy chatbot: trình duyệt -> file này -> Claude API.
 * API key chỉ nằm trong api/config.php trên server, không bao giờ gửi ra client.
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

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
$apiKey = is_array($config) ? trim((string)($config['api_key'] ?? '')) : '';
$configured = $apiKey !== '' && $apiKey !== 'DAN_API_KEY_CUA_BAN_VAO_DAY';

// Kiểm tra trạng thái (client dùng để chọn chế độ FAQ/AI)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, ['ai' => $configured]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'method_not_allowed']);
}

if (!$configured) {
    respond(503, ['error' => 'not_configured']);
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

// Rate limit theo IP: tối đa N yêu cầu / cửa sổ thời gian
$limit = (int)($config['rate_limit_requests'] ?? 20);
$window = (int)($config['rate_limit_window'] ?? 600);
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/careerassistant_rl_' . hash('sha256', $ip);
$now = time();
$hits = [];
if (is_file($rateFile)) {
    $decoded = json_decode((string)file_get_contents($rateFile), true);
    if (is_array($decoded)) {
        $hits = array_values(array_filter($decoded, static fn($t) => is_int($t) && $t > $now - $window));
    }
}
if (count($hits) >= $limit) {
    header('Retry-After: ' . $window);
    respond(429, ['error' => 'rate_limited']);
}
$hits[] = $now;
@file_put_contents($rateFile, json_encode($hits), LOCK_EX);

// Đọc và kiểm tra dữ liệu vào
$raw = file_get_contents('php://input', false, null, 0, 20000);
$input = json_decode((string)$raw, true);
if (!is_array($input) || !isset($input['messages']) || !is_array($input['messages'])) {
    respond(400, ['error' => 'bad_request']);
}

$messages = [];
foreach (array_slice($input['messages'], -10) as $m) {
    if (!is_array($m)) {
        continue;
    }
    $role = $m['role'] ?? '';
    $content = $m['content'] ?? '';
    if (($role !== 'user' && $role !== 'assistant') || !is_string($content)) {
        continue;
    }
    $content = trim(mb_substr($content, 0, 1000));
    if ($content === '') {
        continue;
    }
    $messages[] = ['role' => $role, 'content' => $content];
}

// Claude yêu cầu tin nhắn đầu tiên là "user" và các vai trò xen kẽ
while ($messages && $messages[0]['role'] !== 'user') {
    array_shift($messages);
}
$clean = [];
foreach ($messages as $m) {
    if ($clean && end($clean)['role'] === $m['role']) {
        $clean[count($clean) - 1]['content'] .= "\n" . $m['content'];
    } else {
        $clean[] = $m;
    }
}
if (!$clean || end($clean)['role'] !== 'user') {
    respond(400, ['error' => 'bad_request']);
}

// Kết quả trắc nghiệm Holland (tùy chọn): chỉ nhận đúng 6 số nguyên, không nhận văn bản tự do.
// holland_n = số câu mỗi nhóm: 6 (bản 36 câu, điểm 6–30) hoặc 10 (bản 60 câu, điểm 10–50); mặc định 6.
$maxTokens = (int)($config['max_tokens'] ?? 500);
$hollandBlock = '';
$hollandN = isset($input['holland_n']) && $input['holland_n'] === 10 ? 10 : 6;
if (isset($input['holland']) && is_array($input['holland']) && count($input['holland']) === 6) {
    $scores = [];
    foreach ($input['holland'] as $v) {
        if (!is_int($v) && !is_float($v)) {
            $scores = [];
            break;
        }
        $v = (int)round($v);
        if ($v < $hollandN || $v > $hollandN * 5) {
            $scores = [];
            break;
        }
        $scores[] = $v;
    }
    if (count($scores) === 6) {
        $letters = ['R', 'I', 'A', 'S', 'E', 'C'];
        $names = ['Kỹ thuật (Realistic)', 'Nghiên cứu (Investigative)', 'Nghệ thuật (Artistic)',
                  'Xã hội (Social)', 'Quản lý – Kinh doanh (Enterprising)', 'Nghiệp vụ (Conventional)'];
        $pairs = [];
        foreach ($scores as $i => $s) {
            $pairs[] = ['i' => $i, 's' => $s];
        }
        usort($pairs, static fn($a, $b) => ($b['s'] <=> $a['s']) ?: ($a['i'] <=> $b['i']));
        $code = '';
        foreach (array_slice($pairs, 0, 3) as $p) {
            $code .= $letters[$p['i']];
        }
        $lines = [];
        foreach ($scores as $i => $s) {
            $lines[] = $letters[$i] . ' – ' . $names[$i] . ': ' . $s . '/' . ($hollandN * 5);
        }
        $hollandBlock = "\n\nHọc sinh vừa làm trắc nghiệm sở thích nghề nghiệp Holland (RIASEC, " . ($hollandN * 6) . " câu, mỗi nhóm từ "
            . $hollandN . " đến " . ($hollandN * 5) . " điểm).\n"
            . "Điểm từng nhóm:\n" . implode("\n", $lines) . "\nMã Holland (3 nhóm cao nhất): " . $code . "\n"
            . "Khi trả lời: giải thích ngắn gọn ý nghĩa mã Holland này, gợi ý 2–3 nhóm ngành (chọn trong: Kinh tế – Kinh doanh; Y tế – Sức khỏe; "
            . "Công nghệ thông tin – AI; Kỹ thuật – Công nghệ; Khoa học tự nhiên – Môi trường – Nông nghiệp; Giáo dục; Du lịch – Dịch vụ – Logistics; "
            . "Truyền thông – Nghệ thuật – Thiết kế; Khoa học xã hội – Luật – Nhân văn; An ninh – Quốc phòng) và vài nghề ví dụ. "
            . "Nhấn mạnh đây là công cụ khám phá sở thích để tham khảo, không phải kết luận cuối cùng; khuyến khích trao đổi thêm với thầy cô hoặc cố vấn hướng nghiệp.";
        $maxTokens = max($maxTokens, 700);
    }
}

$payload = [
    'model' => (string)($config['model'] ?? 'claude-haiku-4-5-20251001'),
    'max_tokens' => $maxTokens,
    'system' => (string)($config['system_prompt'] ?? '') . $hollandBlock,
    'messages' => $clean,
];

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);
$response = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $status < 200 || $status >= 300) {
    error_log('chat.php upstream error, HTTP ' . $status);
    respond(502, ['error' => 'upstream_error']);
}

$data = json_decode((string)$response, true);
$reply = '';
foreach (($data['content'] ?? []) as $block) {
    if (($block['type'] ?? '') === 'text') {
        $reply .= $block['text'];
    }
}
$reply = trim($reply);
if ($reply === '') {
    respond(502, ['error' => 'empty_reply']);
}

respond(200, ['reply' => $reply]);
