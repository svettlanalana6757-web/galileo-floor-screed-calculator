<?php
/** Shared input validation for public calculator-to-CRM endpoints. */

function calc_bad_request($message)
{
    amo_json(array('error' => 'bad_request', 'message' => $message), 400);
}

function calc_read_request($maxBytes = 32768)
{
    if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST');
        amo_json(array('error' => 'method_not_allowed'), 405);
    }

    if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > $maxBytes) {
        amo_json(array('error' => 'payload_too_large'), 413);
    }

    $contentType = isset($_SERVER['CONTENT_TYPE'])
        ? strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'])[0]))
        : '';

    if ($contentType === 'application/json') {
        $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        if ($raw === false || strlen($raw) > $maxBytes) {
            amo_json(array('error' => 'payload_too_large'), 413);
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            calc_bad_request('Некорректный JSON');
        }
        return $data;
    }

    if ($contentType === 'application/x-www-form-urlencoded' || $contentType === '') {
        if (strlen(http_build_query($_POST)) > $maxBytes) {
            amo_json(array('error' => 'payload_too_large'), 413);
        }
        return $_POST;
    }

    amo_json(array('error' => 'unsupported_media_type'), 415);
}

function calc_string_field($data, $field, $maxBytes, $required = false)
{
    if (!array_key_exists($field, $data)) {
        if ($required) {
            calc_bad_request('Не передано поле ' . $field);
        }
        return '';
    }
    if (!is_string($data[$field])) {
        calc_bad_request('Поле ' . $field . ' должно быть строкой');
    }

    $value = trim($data[$field]);
    if (($required && $value === '') || strlen($value) > $maxBytes || preg_match('//u', $value) !== 1) {
        calc_bad_request('Некорректное поле ' . $field);
    }
    if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
        calc_bad_request('Недопустимые управляющие символы в поле ' . $field);
    }
    return $value;
}

function calc_integer_field($data, $field, $default, $min, $max)
{
    if (!array_key_exists($field, $data)) {
        return $default;
    }
    $value = $data[$field];
    if (is_int($value)) {
        $integer = $value;
    } elseif (is_string($value) && preg_match('/^(0|[1-9][0-9]*)$/', $value)) {
        $integer = filter_var($value, FILTER_VALIDATE_INT);
        if ($integer === false) {
            calc_bad_request('Некорректное целое поле ' . $field);
        }
    } else {
        calc_bad_request('Поле ' . $field . ' должно быть целым числом');
    }

    if ($integer < $min || $integer > $max) {
        calc_bad_request('Поле ' . $field . ' вне допустимого диапазона');
    }
    return $integer;
}

function calc_price_field($data, $field, $max)
{
    if (!array_key_exists($field, $data)) {
        calc_bad_request('Не передано поле ' . $field);
    }
    $value = $data[$field];
    if ((!is_int($value) && !is_float($value) && !is_string($value)) || !is_numeric($value)) {
        calc_bad_request('Поле ' . $field . ' должно быть числом');
    }

    $number = (float)$value;
    if (!is_finite($number) || $number < 0 || $number > $max || floor($number) !== $number) {
        calc_bad_request('Поле ' . $field . ' вне допустимого диапазона');
    }
    return (int)$number;
}

function calc_configured_subdomain()
{
    $host = parse_url(AMO_API_BASE, PHP_URL_HOST);
    if (!is_string($host) || $host === '') {
        amo_json(array('error' => 'server_configuration_error'), 500);
    }
    return strtolower(explode('.', $host)[0]);
}

function calc_subdomain_field($data)
{
    $configured = calc_configured_subdomain();
    $requested = calc_string_field($data, 'subdomain', 63);
    if ($requested !== '' && (!preg_match('/^[a-z0-9-]+$/', $requested) || strtolower($requested) !== $configured)) {
        calc_bad_request('Недопустимый subdomain');
    }
    return $configured;
}
