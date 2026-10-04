<?php
/**
 * redirect.php — точка, на которую amoCRM отправляет authorization code
 * после установки виджета (Redirect URI). Обменивает code на токены.
 *
 * Быстрый ручной сценарий:
 *   1) Через AmoFinance/браузер вызвать:
 *      https://www.amocrm.ru/oauth?client_id={CLIENT_ID}&state={STATE}&mode=post_message&redirect_uri={REDIRECT_URI}
 *   2) amoCRM переведёт на {REDIRECT_URI}?code=XXXX...
 *   3) Здесь код меняется на access_token/refresh_token и сохраняется по поддомену.
 */

require_once __DIR__ . '/amo_lib.php';

if (AMO_INTEGRATION_ID === '' || AMO_SECRET_KEY === '' || AMO_REDIRECT_URI === '' || AMO_API_BASE === '') {
    amo_json(['error' => 'config_not_ready', 'message' => 'Не заданы переменные окружения интеграции amoCRM'], 500);
}

$code = isset($_GET['code']) ? trim($_GET['code']) : '';
$referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';

// amoCRM передаёт поддомен в referer вида https://{subdomain}.amocrm.ru/...
$subdomain = '';
if (preg_match('#https?://([a-z0-9\-]+)\.amocrm\.#i', $referer, $m)) {
    $subdomain = strtolower($m[1]);
}
if (!$subdomain) $subdomain = 'sz6757'; // фолбэк для тестового аккаунта

if ($code === '') {
    amo_json(['error' => 'no_code', 'referer' => $referer], 400);
}

$body = [
    'client_id' => AMO_INTEGRATION_ID,
    'client_secret' => AMO_SECRET_KEY,
    'grant_type' => 'authorization_code',
    'code' => $code,
    'redirect_uri' => AMO_REDIRECT_URI,
];

$res = amo_oauth_request($body);
if (!$res) {
    $err = isset($GLOBALS['amo_last_error']) ? $GLOBALS['amo_last_error'] : null;
    amo_json([
        'error' => 'oauth_failed',
        'detail' => 'Не удалось обменять code на токен.',
        'hint' => 'Проверьте client_id/secret/redirect_uri и доступы (scopes) интеграции.',
        'last_error' => $err,
    ], 500);
}

$tokens = [
    'access_token'  => $res['access_token'],
    'refresh_token' => $res['refresh_token'],
    'expires_at'    => time() + (int)$res['expires_in'],
    'subdomain'     => $subdomain,
];

// amoCRM возвращает реальный домен аккаунта (base_domain) — используем его
// как источник истины для поддомена, чтобы не было рассинхрона с ключом в tokens.json.
if (!empty($res['base_domain'])) {
    $base = strtolower(trim((string)$res['base_domain']));
    $base = preg_replace('/\.amocrm\..*$/', '', $base); // "sz6757.amocrm.ru" -> "sz6757"
    if (preg_match('/^[a-z0-9\-]+$/', $base)) {
        $subdomain = $base;
        $tokens['subdomain'] = $subdomain;
    }
}
amo_write_tokens($subdomain, $tokens);

// Уведомление, что интеграция авторизована (можно убрать).
file_put_contents(__DIR__ . '/auth_log.txt',
    date('Y-m-d H:i:s') . " subdomain={$subdomain}\n", FILE_APPEND | LOCK_EX);

amo_json(['ok' => true, 'subdomain' => $subdomain, 'message' => 'Интеграция авторизована. Можете закрыть эту вкладку и вернуться в amoCRM.']);
