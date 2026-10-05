<?php
/**
 * Authenticated access to shared employee lists.
 * GET requires a logged-in calculator session; POST also requires CSRF.
 */

require_once __DIR__ . '/session_bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');

$defaults = array(
    'driver' => array('Тертычный Роман', 'Силаков Владислав', 'Эгамбердиев Отабек', 'Шапошников Сергей', 'Тейтеков Темиркул'),
    'foreman' => array('Холмирзоев Насрулло', 'Холов Восе', 'Ахмедов Саймомин', 'Джумагелдиев Руслан', 'Нуруллозода Фарух'),
    'manager' => array(),
    'autogrout' => array('ГалиЛео 1 - Ford', 'ГалиЛео 2 - Renault', 'ГалиЛео 3 - Shacman', 'ГалиЛео 4 - МАЗ', 'ГалиЛео 5 - Howo', 'ГалиЛео 6 - МАЗ', 'ГалиЛео 7 - Dongfeng', 'ГалиЛео 8 - FAW')
);

function respondJson($data, $status = 200)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function isLoggedIn()
{
    return isset($_SESSION['calc_login_ok']) && $_SESSION['calc_login_ok'] === 1;
}

function readLists($defaults, $dataFile)
{
    $lists = $defaults;
    if (!is_file($dataFile) || !is_readable($dataFile)) {
        return $lists;
    }

    $saved = json_decode(file_get_contents($dataFile), true);
    if (!is_array($saved)) {
        return $lists;
    }

    foreach ($defaults as $key => $defaultList) {
        if (isset($saved[$key]) && is_array($saved[$key]) && count($saved[$key])) {
            $lists[$key] = array_values(array_filter($saved[$key], 'is_string'));
        }
        foreach ($defaultList as $name) {
            if (!in_array($name, $lists[$key], true)) {
                $lists[$key][] = $name;
            }
        }
    }

    return $lists;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    respondJson(array('ok' => false, 'error' => 'Метод не поддерживается'), 405);
}

if (!isLoggedIn()) {
    respondJson(array('ok' => false, 'error' => 'Требуется авторизация'), 401);
}

// This path is local to this file: the staged copy cannot modify the original data file.
$dataFile = __DIR__ . '/staff_data.json';

if ($method === 'GET') {
    respondJson(array('ok' => true, 'lists' => readLists($defaults, $dataFile)));
}

$csrfToken = isset($_SERVER['HTTP_X_CSRF_TOKEN'])
    ? (string)$_SERVER['HTTP_X_CSRF_TOKEN']
    : (isset($_POST['csrf_token']) ? (string)$_POST['csrf_token'] : '');
if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || $csrfToken === '' || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
    respondJson(array('ok' => false, 'error' => 'Недействительный CSRF-токен'), 403);
}

$input = $_POST;
$contentType = isset($_SERVER['CONTENT_TYPE']) ? strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'])[0])) : '';
if ($contentType === 'application/json') {
    $jsonInput = json_decode(file_get_contents('php://input'), true);
    if (!is_array($jsonInput)) {
        respondJson(array('ok' => false, 'error' => 'Некорректный JSON'), 400);
    }
    $input = $jsonInput;
}

$key = isset($input['key']) && is_string($input['key']) ? $input['key'] : '';
$action = isset($input['action']) && is_string($input['action']) ? $input['action'] : '';
$name = isset($input['name']) && is_string($input['name']) ? trim($input['name']) : '';

if (!array_key_exists($key, $defaults) || !in_array($action, array('add', 'remove'), true) || $name === '' || strlen($name) > 400 || preg_match('//u', $name) !== 1) {
    respondJson(array('ok' => false, 'error' => 'Некорректные параметры'), 400);
}

$lists = readLists($defaults, $dataFile);
if ($action === 'add') {
    if (!in_array($name, $lists[$key], true)) {
        $lists[$key][] = $name;
    }
} else {
    $lists[$key] = array_values(array_filter($lists[$key], function ($existingName) use ($name) {
        return $existingName !== $name;
    }));
}

$encoded = json_encode($lists, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($encoded === false || file_put_contents($dataFile, $encoded, LOCK_EX) === false) {
    respondJson(array('ok' => false, 'error' => 'Не удалось сохранить списки'), 500);
}

respondJson(array('ok' => true, 'lists' => $lists));
