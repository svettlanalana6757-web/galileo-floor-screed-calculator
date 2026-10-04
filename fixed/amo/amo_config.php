<?php
/**
 * Конфигурация интеграции с amoCRM (REST API v4).
 * Секреты интеграции передаются через переменные окружения.
 *
 * Файл хранится в папке /amo/ на вашем хостинге. Токены (OAuth) сохраняются в
 * отдельном файле tokens.json рядом с правами доступа только владельцу PHP-процесса.
 */

$amoEnv = static function ($name) {
    $value = getenv($name);
    return $value === false ? '' : trim($value);
};

define('AMO_INTEGRATION_ID', $amoEnv('AMO_INTEGRATION_ID'));
define('AMO_SECRET_KEY', $amoEnv('AMO_SECRET_KEY'));
define('AMO_REDIRECT_URI', $amoEnv('AMO_REDIRECT_URI'));

// ----- путь к файлу с токенами (создаётся автоматически при первом обмене) -----
define('AMO_TOKEN_FILE', __DIR__ . '/tokens.json');

// ----- базовый URL для OAuth и API -----
// ВАЖНО: OAuth-запрос идёт на домен ВАШЕГО аккаунта (поддомен.amocrm.ru),
// а не на www.amocrm.ru. Иначе amoCRM отвечает "Send request to account".
$apiBase = rtrim($amoEnv('AMO_API_BASE'), '/');
if ($apiBase === '') {
    $apiBase = 'https://sz6757.amocrm.ru/api/v4';
}
$apiHost = parse_url($apiBase, PHP_URL_HOST);
if (parse_url($apiBase, PHP_URL_SCHEME) !== 'https' || !$apiHost) {
    $apiBase = '';
    $oauthUrl = '';
} else {
    $oauthUrl = 'https://' . $apiHost . '/oauth2/access_token';
}
define('AMO_OAUTH_URL', $oauthUrl);
define('AMO_API_BASE', $apiBase);
