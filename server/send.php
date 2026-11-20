<?php
/**
 * Обработчик заявок с лендинга.
 * Отправляет заявку в Telegram (бот → чат/группа менеджеров), на email и/или в CRM по вебхуку.
 * Настройки — в send.config.php (образец: send.config.example.php). Требуется PHP 7.4+.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$configFile = __DIR__ . '/send.config.php';
if (!is_file($configFile)) {
    respond(500, ['ok' => false, 'error' => 'not_configured']);
}
$cfg = require $configFile;

/* --- проверка источника запроса --- */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($cfg['allowed_origins']) && $origin !== '' && !in_array($origin, $cfg['allowed_origins'], true)) {
    respond(403, ['ok' => false, 'error' => 'forbidden']);
}

function field(string $key, int $max = 300): string
{
    $v = $_POST[$key] ?? '';
    $v = is_string($v) ? trim(preg_replace('/\s+/u', ' ', $v)) : '';
    return mb_substr($v, 0, $max);
}

/* --- антиспам: honeypot и слишком быстрое заполнение (тихо «принимаем», но не отправляем) --- */
if (field('website') !== '') {
    respond(200, ['ok' => true]);
}
if ((int) field('ts', 10) < (int) ($cfg['min_fill_seconds'] ?? 2)) {
    respond(200, ['ok' => true]);
}

/* --- ограничение частоты по IP --- */
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rateDir = rtrim(sys_get_temp_dir(), '/\\') . '/lead_rate';
if (!is_dir($rateDir)) {
    @mkdir($rateDir, 0700, true);
}
$rateFile = $rateDir . '/' . sha1($ip . ($cfg['salt'] ?? ''));
$limit = (int) ($cfg['rate_limit_seconds'] ?? 60);
if (is_file($rateFile) && (time() - (int) @filemtime($rateFile)) < $limit) {
    respond(429, ['ok' => false, 'error' => 'too_many_requests']);
}

/* --- валидация --- */
$name = field('name', 60);
$phoneDigits = preg_replace('/\D/', '', field('phone', 30));
if (strlen($phoneDigits) === 11 && $phoneDigits[0] === '8') {
    $phoneDigits = '7' . substr($phoneDigits, 1);
}
$telegram = field('telegram', 33);
$consent = field('consent', 2);

$errors = [];
if (mb_strlen($name) < 2) $errors[] = 'name';
if (!preg_match('/^7\d{10}$/', $phoneDigits)) $errors[] = 'phone';
if ($telegram !== '' && !preg_match('/^@?[A-Za-z0-9_]{5,32}$/', $telegram)) $errors[] = 'telegram';
if ($consent !== '1') $errors[] = 'consent';
if ($errors) {
    respond(422, ['ok' => false, 'error' => 'validation', 'fields' => $errors]);
}

$phone = sprintf('+7 (%s) %s-%s-%s', substr($phoneDigits, 1, 3), substr($phoneDigits, 4, 3), substr($phoneDigits, 7, 2), substr($phoneDigits, 9, 2));
$lead = [
    'Имя'         => $name,
    'Телефон'     => $phone,
    'Telegram'    => $telegram,
    'Цель'        => field('goal_label', 80) ?: field('goal', 30),
    'Программа'   => field('program', 80),
    'Комментарий' => field('comment', 300),
    'Калькулятор' => field('calc', 200),
    'utm_source'  => field('utm_source', 200),
    'utm_medium'  => field('utm_medium', 200),
    'utm_campaign'=> field('utm_campaign', 200),
    'utm_content' => field('utm_content', 200),
    'utm_term'    => field('utm_term', 200),
    'Страница'    => field('page', 500),
    'Время'       => date('d.m.Y H:i'),
];

/* --- отправка --- */
function http_post(string $url, string $body, string $contentType): bool
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: ' . $contentType],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code >= 200 && $code < 300;
    }
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => 'Content-Type: ' . $contentType, 'content' => $body, 'timeout' => 10, 'ignore_errors' => true,
    ]]);
    $res = @file_get_contents($url, false, $ctx);
    return $res !== false && isset($http_response_header[0]) && preg_match('/\s2\d\d\s/', $http_response_header[0]);
}

$sent = 0;

// 1) Telegram
if (!empty($cfg['telegram_bot_token']) && !empty($cfg['telegram_chat_id'])) {
    $lines = ['<b>🆕 Заявка с сайта</b>'];
    foreach ($lead as $k => $v) {
        if ($v !== '') $lines[] = '<b>' . htmlspecialchars($k) . ':</b> ' . htmlspecialchars($v);
    }
    $payload = [
        'chat_id' => $cfg['telegram_chat_id'],
        'text' => implode("\n", $lines),
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
    ];
    if (!empty($cfg['telegram_thread_id'])) $payload['message_thread_id'] = $cfg['telegram_thread_id'];
    $url = 'https://api.telegram.org/bot' . $cfg['telegram_bot_token'] . '/sendMessage';
    if (http_post($url, json_encode($payload, JSON_UNESCAPED_UNICODE), 'application/json')) $sent++;
}

// 2) Email
if (!empty($cfg['email_to'])) {
    $body = '';
    foreach ($lead as $k => $v) {
        if ($v !== '') $body .= "$k: $v\n";
    }
    $from = $cfg['email_from'] ?? ('no-reply@' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
    $headers = "From: {$from}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    $subject = '=?UTF-8?B?' . base64_encode('Заявка с сайта: ' . $name) . '?=';
    if (@mail($cfg['email_to'], $subject, $body, $headers)) $sent++;
}

// 3) CRM / вебхук (amoCRM, Bitrix24, Make, n8n и т. п.)
if (!empty($cfg['webhook_url'])) {
    if (http_post($cfg['webhook_url'], json_encode($lead, JSON_UNESCAPED_UNICODE), 'application/json')) $sent++;
}

// 4) Резервная копия заявок в CSV (папка должна быть вне публичного доступа)
if (!empty($cfg['backup_csv'])) {
    $fh = @fopen($cfg['backup_csv'], 'ab');
    if ($fh) {
        fputcsv($fh, array_values($lead), ';');
        fclose($fh);
        $sent++;
    }
}

if ($sent === 0) {
    respond(502, ['ok' => false, 'error' => 'delivery_failed']);
}

@touch($rateFile);
respond(200, ['ok' => true]);
