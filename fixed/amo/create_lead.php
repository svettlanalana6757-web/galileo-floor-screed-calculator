<?php
/** Validated endpoint for creating/finding a lead and attaching a calculation note. */

$amoLib = __DIR__ . '/amo_lib.php';
if (!is_file($amoLib)) {
    $amoLib = dirname(__DIR__, 2) . '/amo/amo_lib.php';
}
require_once $amoLib;
require_once __DIR__ . '/request_validation.php';

$data = calc_read_request();
$text = calc_string_field($data, 'text', 12000, true);
$price = calc_price_field($data, 'price', 100000000);
$label = calc_string_field($data, 'label', 100);
$kind = calc_string_field($data, 'kind', 20);
$variantNo = calc_integer_field($data, 'variant_no', 0, 0, 100000);
$order = calc_string_field($data, 'order', 100);
$name = calc_string_field($data, 'name', 200);
$contacts = calc_string_field($data, 'contacts', 500);
$address = calc_string_field($data, 'address', 1000);
$entityId = calc_integer_field($data, 'entity_id', 0, 0, 2147483647);
$entity = calc_string_field($data, 'entity', 20);
$subdomain = calc_subdomain_field($data);

if ($kind !== '' && !in_array($kind, array('variant', 'logist'), true)) {
    calc_bad_request('Недопустимый kind');
}
if ($entity !== '' && $entity !== 'leads') {
    calc_bad_request('Недопустимый тип сущности');
}
if ($label !== '' && $kind === '') {
    $text = '[' . $label . '] ' . $text;
    if (strlen($text) > 12000) {
        calc_bad_request('Слишком длинный текст расчёта');
    }
}

$mode = 'new';
$leadId = null;
$foundByOrder = null;

if ($entityId > 0) {
    $leadId = $entityId;
    $mode = 'widget';
} elseif ($order !== '') {
    $queries = array($order);
    if ($name !== '') {
        $queries[] = $name;
    }
    foreach ($queries as $query) {
        list($status, $body) = amo_api($subdomain, 'GET', '/leads?query=' . urlencode($query) . '&limit=5');
        if ($status >= 200 && $status < 300) {
            $found = isset($body['_embedded']['leads']) && is_array($body['_embedded']['leads'])
                ? $body['_embedded']['leads']
                : (isset($body[0]) ? $body : array());
            foreach ($found as $lead) {
                $id = isset($lead['id']) ? (int)$lead['id'] : 0;
                if ($id > 0) {
                    $leadId = $id;
                    $foundByOrder = $order;
                    break 2;
                }
            }
        }
    }
}

if (!$leadId) {
    if ($name === '') {
        $name = 'Расчёт стяжки пола' . ($order !== '' ? ' (Заказ № ' . $order . ')' : '');
    }
    list($status, $body) = amo_api($subdomain, 'POST', '/leads', array(array(
        'name' => $name,
        'price' => $price,
    )));
    if ($status < 200 || $status >= 300) {
        amo_json(array('error' => 'lead_create_failed', 'status' => $status), 502);
    }
    if (isset($body['_embedded']['leads'][0]['id'])) {
        $leadId = (int)$body['_embedded']['leads'][0]['id'];
    } elseif (isset($body[0]['id'])) {
        $leadId = (int)$body[0]['id'];
    }
    if (!$leadId) {
        amo_json(array('error' => 'no_lead_id'), 502);
    }
}

$variantLine = '';
$outVariant = 0;
if ($kind === 'variant' || $kind === 'logist') {
    $number = ($kind === 'logist' && $variantNo > 0) ? $variantNo : 0;
    if ($number < 1) {
        $maxNumber = 0;
        list($status, $body) = amo_api($subdomain, 'GET', '/leads/' . $leadId . '/notes?limit=100&order=desc');
        if ($status >= 200 && $status < 300) {
            $notes = isset($body['_embedded']['notes']) && is_array($body['_embedded']['notes'])
                ? $body['_embedded']['notes']
                : (isset($body[0]) ? $body : array());
            foreach ($notes as $note) {
                $noteText = isset($note['params']['text']) ? $note['params']['text']
                    : (isset($note['text']) ? $note['text'] : '');
                if (preg_match('/^Вариант\s+(\d+)/iu', (string)$noteText, $matches)) {
                    $maxNumber = max($maxNumber, (int)$matches[1]);
                }
            }
        }
        $number = $maxNumber + 1;
    }
    $outVariant = $number;
    $variantLine = 'ВАРИАНТ ' . $number . ($kind === 'logist' ? ' · ЛОГИСТ' : '') . "\n";
}

$noteText = $variantLine . $text;
list($status, $body) = amo_api($subdomain, 'POST', "/leads/{$leadId}/notes", array(array(
    'entity_id' => array('id' => $leadId),
    'note_type' => 'common',
    'params' => array('text' => $noteText),
)));
if ($status < 200 || $status >= 300) {
    amo_json(array('error' => 'note_failed', 'status' => $status), 502);
}

amo_json(array(
    'ok' => true,
    'lead_id' => $leadId,
    'variant_no' => $outVariant,
    'mode' => $mode,
    'found_by_order' => $foundByOrder,
    'url' => 'https://' . $subdomain . '.amocrm.ru/leads/detail/' . $leadId,
), 200);
