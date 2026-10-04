<?php
/**
 * Вход по паролю для внешней страницы калькулятора (calc-2).
 * После успешного входа отдаётся index.html (сам калькулятор).
 *
 * Пароль берётся из переменной окружения CALC_PASSWORD.
 * Выход из аккаунта: https://widgets.pvzakharov.ru/calc-2/?logout
 */

session_start();

$calcPasswordEnv = getenv('CALC_PASSWORD');
if ($calcPasswordEnv === false || $calcPasswordEnv === '') {
    $calcPasswordEnv = '';
}
define('CALC_PASSWORD', $calcPasswordEnv);

function verifyLoginAttempt($password)
{
    $maxAttempts = 5;
    $windowSeconds = 900;
    $now = time();
    $clientIp = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    $rateFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'calc-2-login-' . hash('sha256', __DIR__ . '|' . $clientIp) . '.json';
    $handle = @fopen($rateFile, 'c+');

    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        return array('status' => 'unavailable');
    }

    @chmod($rateFile, 0600);
    $stored = json_decode(stream_get_contents($handle), true);
    if (!is_array($stored)) {
        $stored = array();
    }

    $blockedUntil = isset($stored['blocked_until']) ? (int)$stored['blocked_until'] : 0;
    if ($blockedUntil > $now) {
        flock($handle, LOCK_UN);
        fclose($handle);
        return array('status' => 'blocked', 'retry_after' => $blockedUntil - $now);
    }

    $windowStart = isset($stored['window_start']) ? (int)$stored['window_start'] : $now;
    $attempts = isset($stored['attempts']) ? (int)$stored['attempts'] : 0;
    if ($windowStart + $windowSeconds <= $now) {
        $windowStart = $now;
        $attempts = 0;
    }

    $validPassword = CALC_PASSWORD !== '' && hash_equals(CALC_PASSWORD, (string)$password);
    if ($validPassword) {
        $state = array('attempts' => 0, 'window_start' => $now, 'blocked_until' => 0);
    } else {
        $attempts++;
        $blockedUntil = $attempts >= $maxAttempts ? $now + $windowSeconds : 0;
        $state = array('attempts' => $attempts, 'window_start' => $windowStart, 'blocked_until' => $blockedUntil);
    }

    rewind($handle);
    $encoded = json_encode($state);
    $written = $encoded !== false && ftruncate($handle, 0) && fwrite($handle, $encoded) === strlen($encoded) && fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    if (!$written) {
        return array('status' => 'unavailable');
    }
    if ($validPassword) {
        return array('status' => 'success');
    }
    if ($blockedUntil > $now) {
        return array('status' => 'blocked', 'retry_after' => $blockedUntil - $now);
    }
    return array('status' => 'invalid');
}

$error = '';
if (isset($_GET['logout'])) {
    unset($_SESSION['calc_login_ok']);
    unset($_SESSION['csrf_token']);
    session_destroy();
}
if (isset($_POST['calc_pass'])) {
    $inputPass = (string)$_POST['calc_pass'];
    $loginResult = verifyLoginAttempt($inputPass);
    if ($loginResult['status'] === 'success') {
        $_SESSION['calc_login_ok'] = 1;
        if (!isset($_SESSION['csrf_token']) || empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
    } elseif ($loginResult['status'] === 'blocked') {
        http_response_code(429);
        header('Retry-After: ' . (int)$loginResult['retry_after']);
        $error = 'Слишком много неудачных попыток. Повторите через ' . (int)$loginResult['retry_after'] . ' сек.';
    } elseif ($loginResult['status'] === 'unavailable') {
        http_response_code(503);
        $error = 'Проверка входа временно недоступна. Попробуйте позже.';
    } else {
        $error = 'Неверный пароль.';
    }
}

if (empty($_SESSION['calc_login_ok'])) {
    header('Content-Type: text/html; charset=utf-8');
    ?><!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вход — Калькулятор стяжки Галилео</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; min-height:100vh; color:#1f2d3d; }
  .card { background:#fff; border:1px solid #e3e8ee; border-radius:10px; padding:28px 30px; width:340px; max-width:94vw; box-shadow:0 2px 10px rgba(0,0,0,.07); }
  .card h1 { font-size:17px; margin:0 0 16px; color:#2a8cff; }
  .card label { display:block; font-size:13px; margin:0 0 6px; color:#445; }
  .card input { width:100%; height:38px; border:1px solid #cfd8e3; border-radius:6px; padding:0 10px; font-size:14px; }
  .card button { margin-top:14px; width:100%; height:40px; border:0; border-radius:6px; background:#2a8cff; color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
  .card button:hover { background:#1f7af0; }
  .err { margin-top:10px; color:#b33434; font-size:13px; }
  .hint { margin-top:12px; font-size:12px; color:#8593a0; }
</style>
</head>
<body>
<form class="card" method="post" autocomplete="off">
  <h1>Калькулятор стяжки Галилео</h1>
  <label>Пароль</label>
  <input type="password" name="calc_pass" autofocus>
  <button type="submit">Войти</button>
  <?php if ($error !== ''): ?><div class="err"><?php echo htmlspecialchars($error); ?></div><?php endif; ?>
  <div class="hint">Вход только для сотрудников компании.</div>
</form>
</body>
</html><?php
    exit;
}

if (!isset($_SESSION['csrf_token']) || empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$csrfToken = $_SESSION['csrf_token'];
?><!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="csrf-token" content="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
    <title>Калькулятор стяжки пола — рабочая версия</title>
    <link rel="stylesheet" href="bootstrap-grid.min.css">
    <link rel="stylesheet" href="style.css">
    <style>
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; background:#f0f2f5; margin:0; padding:24px; color:#1f2d3d; }
        .card { width:1100px; max-width:96vw; background:#fff; border:1px solid #e3e8ee; border-radius:10px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,.06); }
        .card__title { display:flex; align-items:center; min-height:52px; margin-bottom:12px; }
        .card__title img { max-height:52px; max-width:100%; object-fit:contain; }
        .widget { border-top:1px solid #eef1f4; padding-top:12px; margin-top:12px; }
        .widget__header { font-weight:600; font-size:20px; color:#2a8cff; margin-bottom:8px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="card__title"><img src="galileo-logo.jpg" alt="GALI-LEO"></div>
        <div id="widget-mount"></div>
    </div>

    <script>
        function sanitizeWidgetBody(html) {
            var allowedTags = { div: true, label: true, select: true, option: true, input: true, textarea: true, button: true, span: true };
            var allowedAttributes = { id: true, class: true, type: true, value: true, min: true, max: true, step: true, placeholder: true, rows: true, title: true, checked: true, selected: true, style: true };
            var template = document.createElement('template');
            template.innerHTML = String(html || '');

            function copySafe(node) {
                if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
                if (node.nodeType !== Node.ELEMENT_NODE) return null;

                var tag = node.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'svg' || tag === 'math') return null;
                if (!allowedTags[tag]) {
                    var unwrapped = document.createDocumentFragment();
                    Array.prototype.forEach.call(node.childNodes, function (child) {
                        var safeChild = copySafe(child);
                        if (safeChild) unwrapped.appendChild(safeChild);
                    });
                    return unwrapped;
                }

                var clean = document.createElement(tag);
                Array.prototype.forEach.call(node.attributes, function (attribute) {
                    var name = attribute.name.toLowerCase();
                    var value = attribute.value;
                    if (!allowedAttributes[name]) return;
                    if (name === 'id' && !/^[a-z][a-z0-9_-]*$/i.test(value)) return;
                    if (name === 'class' && !/^[a-z0-9 _-]*$/i.test(value)) return;
                    if (name === 'type' && !/^(text|date|time|number|checkbox)$/i.test(value)) return;
                    if (name === 'style') {
                        if (/^\s*display\s*:\s*none\s*;?\s*$/i.test(value)) clean.style.display = 'none';
                        return;
                    }
                    if (name === 'checked' && tag === 'input') clean.checked = true;
                    else if (name === 'selected' && tag === 'option') clean.selected = true;
                    else clean.setAttribute(name, value);
                });

                Array.prototype.forEach.call(node.childNodes, function (child) {
                    var safeChild = copySafe(child);
                    if (safeChild) clean.appendChild(safeChild);
                });
                return clean;
            }

            var result = document.createDocumentFragment();
            Array.prototype.forEach.call(template.content.childNodes, function (child) {
                var safeChild = copySafe(child);
                if (safeChild) result.appendChild(safeChild);
            });
            return result;
        }
    </script>
    <script src="jquery.min.js"></script>
    <script src="prices_data.js"></script>
    <script>
        window.CSRF_TOKEN = <?php echo json_encode($csrfToken, JSON_UNESCAPED_UNICODE); ?>;
    </script>
    <script src="script.js"></script>
    <script>
        (function () {
            var w = new AMO.widgets.galileo_full_calc();

            w.render_template = function (params, callback) {
                var $mount = jQuery('#widget-mount');
                var $el = jQuery('<div class="widget"></div>');
                var caption = String(params.caption || '');
                var resetMarkup = '<button id="fp_reset" class="fp-btn-reset" type="button">Очистить данные</button>';
                var hasResetButton = caption.indexOf(resetMarkup) !== -1;
                caption = caption.split(resetMarkup).join('');
                if (caption || hasResetButton) {
                    var $header = jQuery('<div class="widget__header"></div>').text(caption);
                    if (hasResetButton) {
                        $header.append(' ').append(jQuery('<button></button>').attr({ id: 'fp_reset', type: 'button' }).addClass('fp-btn-reset').text('Очистить данные'));
                    }
                    $el.append($header);
                }
                var $body = jQuery('<div class="widget__body"></div>').append(sanitizeWidgetBody(params.body));
                $el.append($body);
                $mount.append($el);
                w.$el = $el;
                if (typeof callback === 'function') callback();
            };

            w.system = null;
            w.init();
            w.render();
        })();
    </script>
</body>
</html>
