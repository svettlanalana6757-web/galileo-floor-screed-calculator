<?php
/**
 * Библиотека работы с OAuth 2.0 и REST API v4 amoCRM.
 * Подключается остальными файлами бэкенда.
 */

require_once __DIR__ . '/amo_config.php';

/** Простой JSON-ответ с корректным HTTP-статусом. */
function amo_json($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Читает токены из файла (по поддомену). Возвращает массив или null. */
function amo_read_tokens($subdomain) {
    if (!file_exists(AMO_TOKEN_FILE)) return null;
    $raw = file_get_contents(AMO_TOKEN_FILE);
    $all = json_decode($raw, true);
    if (!is_array($all)) return null;
    if (isset($all[$subdomain]) && is_array($all[$subdomain])) {
        return $all[$subdomain];
    }
    // Если точного ключа нет, а в файле всего один аккаунт — используем его.
    if (count($all) === 1) {
        $only = reset($all);
        if (is_array($only)) return $only;
    }
    return null;
}

/** Записывает токены в файл (по поддомену). */
function amo_write_tokens($subdomain, $tokens) {
    $all = [];
    if (file_exists(AMO_TOKEN_FILE)) {
        $raw = file_get_contents(AMO_TOKEN_FILE);
        $all = json_decode($raw, true);
        if (!is_array($all)) $all = [];
    }
    $tokens['updated_at'] = time();
    $all[$subdomain] = $tokens;
    file_put_contents(AMO_TOKEN_FILE, json_encode($all, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    @chmod(AMO_TOKEN_FILE, 0600);
}

/**
 * Выполняет запрос к OAuth-серверу amoCRM (обмен кода / обновление токена).
 * Возвращает массив с access_token/refresh_token/expires_in или null.
 * Включает диагностику: последний ответ от amoCRM кладётся в глобальную $amo_last_error.
 */
function amo_oauth_request($body) {
    // Basic-заголовок: base64(client_id:client_secret) — стандарт OAuth 2.0.
    $basic = base64_encode(AMO_INTEGRATION_ID . ':' . AMO_SECRET_KEY);
    $ch = curl_init(AMO_OAUTH_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($body),
        CURLOPT_HTTPHEADER => [
            'Authorization: Basic ' . $basic,
            'Content-Type: application/x-www-form-urlencoded',
        ],
        CURLOPT_TIMEOUT => 30,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode((string)$res, true);
    // Сохраняем диагностику для вывода при ошибке.
    $GLOBALS['amo_last_error'] = ['http' => $code, 'body' => $data ?: $res];
    if ($code >= 400 || !isset($data['access_token'])) return null;
    return $data;
}

/**
 * Возвращает актуальный access_token для поддомена, при необходимости
 * автоматически обновляя истёкший/протухший refresh-токен.
 * Результат кэшируется в глобальной переменной на время запроса.
 */
function amo_get_access_token($subdomain) {
    static $cache = [];
    if (isset($cache[$subdomain])) return $cache[$subdomain];

    $tokens = amo_read_tokens($subdomain);
    if (!$tokens || empty($tokens['access_token'])) {
        return null; // интеграция не авторизована в этом аккаунте
    }

    // 24-часовое окно безопасности до expiry
    $expired = (isset($tokens['expires_at']) && $tokens['expires_at'] - time() < 3600);

    if ($expired) {
        $ref = isset($tokens['refresh_token']) ? $tokens['refresh_token'] : null;
        if (!$ref) return null;
        $body = [
            'client_id' => AMO_INTEGRATION_ID,
            'client_secret' => AMO_SECRET_KEY,
            'grant_type' => 'refresh_token',
            'refresh_token' => $ref,
        ];
        $new = amo_oauth_request($body);
        if (!$new) return null;
        $tokens['access_token'] = $new['access_token'];
        $tokens['refresh_token'] = $new['refresh_token'];
        $tokens['expires_at'] = time() + (int)$new['expires_in'];
        amo_write_tokens($subdomain, $tokens);
    }

    $cache[$subdomain] = $tokens['access_token'];
    return $tokens['access_token'];
}

/**
 * Отправляет запрос к REST API v4 amoCRM (GET/POST/PATCH...).
 * $path — например '/leads/123/notes' или '/leads/123'.
 * Возвращает [status, body(array)].
 */
function amo_api($subdomain, $method, $path, $payload = null) {
    $token = amo_get_access_token($subdomain);
    if (!$token) return [401, ['error' => 'no_token']];

    $url = AMO_API_BASE . $path;
    $ch = curl_init($url);
    $headers = [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ];
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    } elseif ($method === 'PATCH') {
        $opts[CURLOPT_CUSTOMREQUEST] = 'PATCH';
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    } elseif ($method === 'GET') {
        $opts[CURLOPT_HTTPGET] = true;
    }
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $body = json_decode((string)$res, true);
    if (!is_array($body)) $body = ['raw' => $res];
    return [$status, $body];
}
