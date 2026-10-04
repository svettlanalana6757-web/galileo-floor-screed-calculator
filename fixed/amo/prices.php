<?php
/**
 * prices.php — отдаёт виджету список прайсов в формате {default, prices:[...]}.
 *
 * Данные берутся из файла ../prices_data.js, который генерирует build_prices.py
 * (window.GALILEO_PRICES = {...};). Здесь из него вырезается JS-обёртка и
 * возвращается чистый JSON. Если файла нет — возвращается пустой массив.
 */

$jsFile = __DIR__ . '/../prices_data.js';
$data = ['default' => null, 'prices' => [], 'error' => 'prices_data.js не найден'];

if (file_exists($jsFile)) {
    $js = file_get_contents($jsFile);
    // Убираем "window.GALILEO_PRICES = " в начале и ";" в конце
    $js = preg_replace('/^[\s\S]*?\=\s*/', '', $js);
    $js = preg_replace('/;\s*$/', '', $js);
    $decoded = json_decode($js, true);
    if (is_array($decoded)) {
        $data = $decoded;
    } else {
        $data['error'] = 'Не удалось разобрать prices_data.js';
    }
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode($data, JSON_UNESCAPED_UNICODE);
