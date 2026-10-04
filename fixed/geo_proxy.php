<?php
/**
 * Прокси для Яндекс.Геокодера.
 * Ключ берётся из переменной окружения YANDEX_GEOCODER_KEY.
 * Не передаёт ключ на фронтенд.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

$apiKey = getenv('YANDEX_GEOCODER_KEY');
if ($apiKey === false || $apiKey === '') {
    http_response_code(500);
    echo json_encode(array('error' => 'Geocoder key not configured'), JSON_UNESCAPED_UNICODE);
    exit;
}

$geocode = isset($_GET['geocode']) ? trim((string)$_GET['geocode']) : '';
$results = isset($_GET['results']) ? (int)$_GET['results'] : 1;
$lang = isset($_GET['lang']) ? trim((string)$_GET['lang']) : 'ru_RU';
$format = isset($_GET['format']) ? trim((string)$_GET['format']) : 'json';

if ($geocode === '') {
    http_response_code(400);
    echo json_encode(array('error' => 'geocode parameter required'), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($results < 1) {
    $results = 1;
}
if ($results > 10) {
    $results = 10;
}

$url = 'https://geocode-maps.yandex.ru/1.x/?' . http_build_query(array(
    'format' => $format === 'xml' ? 'xml' : 'json',
    'apikey' => $apiKey,
    'geocode' => $geocode,
    'results' => $results,
    'lang' => $lang
), '', '&', PHP_QUERY_RFC3986);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'calc-2-geo-proxy');
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_errno($ch);
curl_close($ch);

if ($curlErr !== 0) {
    http_response_code(502);
    echo json_encode(array('error' => 'Geocoder request failed'), JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($httpCode);
echo $response;
exit;
