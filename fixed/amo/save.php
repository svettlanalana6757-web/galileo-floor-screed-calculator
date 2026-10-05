<?php
/** Validated endpoint for adding a calculation note to an existing CRM entity. */

$amoLib = __DIR__ . '/amo_lib.php';
if (!is_file($amoLib)) {
    $amoLib = dirname(__DIR__, 2) . '/amo/amo_lib.php';
}
require_once $amoLib;
require_once __DIR__ . '/request_validation.php';

calc_require_authenticated_session();
$data = calc_read_request();
$text = calc_string_field($data, 'text', 12000, true);
$entity = calc_string_field($data, 'entity', 20);
$entityId = calc_integer_field($data, 'entity_id', 0, 1, 2147483647);
$subdomain = calc_subdomain_field($data);

if ($entity === '') {
    $entity = 'leads';
}
if (!in_array($entity, array('leads', 'contacts'), true)) {
    calc_bad_request('Недопустимый тип сущности');
}

$payload = array(array(
    'entity_id' => array('id' => $entityId),
    'note_type' => 'common',
    'params' => array('text' => $text),
));

list($status, $body) = amo_api($subdomain, 'POST', "/{$entity}/{$entityId}/notes", $payload);

if ($status >= 200 && $status < 300) {
    $noteId = isset($body[0]['id']) ? $body[0]['id'] : null;
    amo_json(array('ok' => true, 'subdomain' => $subdomain, 'entity' => $entity, 'entity_id' => $entityId, 'note_id' => $noteId), 200);
}

amo_json(array('error' => 'api_error', 'status' => $status), 502);
