(function () {
    window.AMO = window.AMO || {};
    if (!AMO.widgets) AMO.widgets = {};

    /* Endpoints follow this script, keeping local and deployed copies isolated. */
    var APP_BASE_URL = new URL('.', document.currentScript.src).href;
    var PRICES_URL = APP_BASE_URL + 'amo/prices.php';
    var API_URL = APP_BASE_URL + 'amo/save.php';
    var CREATE_URL = APP_BASE_URL + 'amo/create_lead.php';
    var SUBDOMAIN = 'sz6757';
    var STAFF_URL = APP_BASE_URL + 'staff.php';
    var GEO_PROXY_URL = APP_BASE_URL + 'geo_proxy.php';

    AMO.widgets.galileo_full_calc = function () {
        var self = this;
        this.name = 'galileo_full_calc';
        this.version = '1.0.0';

        /* ---------- ОБЩИЕ ПРАВИЛА ПРАЙСА (одинаковы для всех марок) ---------- */
        var PER_CM_ABOVE_15 = 75;   // цена за 1 см толщины свыше 15 см

        function minCalloutFor(grade) {
            var m = { 'М150': 75000, 'М200': 80000, 'М250': 85000, 'М300': 90000 };
            return m[grade] || 75000;
        }

        var NOISE = {
            none: null,
            izokom: { label: 'Шумоизоляция Изоком 5мм (п.12)', m: 130, w: 100 },
            eps: { label: 'Шумоизоляция ЭПП 20мм (п.13)', m: 600, w: 200 },
            combi: { label: 'Шумоизоляция Шуманет комби 5мм (п.14)', m: 750, w: 450 },
            hydro: { label: 'Шумоизоляция Шуманет гидро 5мм (п.15)', m: 850, w: 550 }
        };

        /* ---------- СОСТОЯНИЕ ---------- */
        var PRICES = null;     // {default, prices:[...]}
        var currentId = null;  // id выбранного прайса/марки
        var $root = null;

        function num(id) { var v = parseFloat($root.find('#' + id).val()); return isNaN(v) ? 0 : v; }
        function checked(id) { return $root.find('#' + id).is(':checked'); }
        function val(id) { return $root.find('#' + id).val(); }

        function getCsrfToken() {
            if (window.CSRF_TOKEN) return window.CSRF_TOKEN;
            var meta = document.querySelector('meta[name="csrf-token"]');
            return meta ? (meta.getAttribute('content') || '') : '';
        }

        var DEFAULT_DRIVERS = ['Тертычный Роман', 'Силаков Владислав', 'Эгамбердиев Отабек', 'Шапошников Сергей', 'Тейтеков Темиркул'];
        var DEFAULT_FOREMEN = ['Холмирзоев Насрулло', 'Холов Восе', 'Ахмедов Саймомин', 'Джумагелдиев Руслан', 'Нуруллозода Фарух'];
        var DEFAULT_MANAGERS = [];
        var DEFAULT_AUTOGROUTS = ['ГалиЛео 1 - Ford', 'ГалиЛео 2 - Renault', 'ГалиЛео 3 - Shacman', 'ГалиЛео 4 - МАЗ', 'ГалиЛео 5 - Howo', 'ГалиЛео 6 - МАЗ', 'ГалиЛео 7 - Dongfeng', 'ГалиЛео 8 - FAW'];

        function createListManager(key, defaults) {
            var _server = null;   // список с сервера (источник истины), если он получен
            function getList() {
                if (_server) return _server.slice();
                var list = null;
                try { var s = localStorage.getItem('fp_' + key + '_list'); if (s) { var a = JSON.parse(s); if (Array.isArray(a) && a.length) list = a; } } catch (e) {}
                if (!list) list = defaults.slice();
                for (var i = 0; i < defaults.length; i++) {
                    if (list.indexOf(defaults[i]) < 0) list.push(defaults[i]);
                }
                return list;
            }
            function saveList(arr) { try { localStorage.setItem('fp_' + key + '_list', JSON.stringify(arr)); } catch (e) {} }
            function setServer(list) { _server = list; saveList(list); }
            function renderSelect(selected) {
                var list = getList(), $sel = $root.find('#fp_' + key);
                $sel.empty().append(jQuery('<option></option>').val('').text('— не выбран —'));
                for (var i = 0; i < list.length; i++) {
                    $sel.append(jQuery('<option></option>').text(String(list[i])));
                }
                if (selected && list.indexOf(selected) >= 0) $sel.val(selected);
            }
            function pushToServer(action, name) {
                if (!STAFF_URL || STAFF_URL.indexOf('http') !== 0) return;
                jQuery.ajax({
                    url: STAFF_URL, method: 'POST',
                    data: { csrf_token: getCsrfToken(), key: key, action: action, name: name },
                    headers: { 'X-CSRF-Token': getCsrfToken() },
                    success: function (d) {
                        if (d && d.ok && d.lists && Array.isArray(d.lists[key])) {
                            setServer(d.lists[key]);
                            renderSelect($root.find('#fp_' + key).val());
                        } else if (d && d.error) {
                            console.warn('staff.php:', d.error);
                        }
                    },
                    error: function () { console.warn('staff.php: сервер недоступен'); }
                });
            }
            function add(name) {
                name = name.trim(); if (!name) return;
                var list = getList();
                for (var i = 0; i < list.length; i++) { if (list[i] === name) return; }
                list.push(name); saveList(list); renderSelect(name);
                pushToServer('add', name);
            }
            function remove(name) {
                var list = getList(), idx = list.indexOf(name);
                if (idx < 0) return; list.splice(idx, 1); saveList(list); renderSelect('');
                pushToServer('remove', name);
            }
            return { getList: getList, renderSelect: renderSelect, add: add, remove: remove, setServer: setServer };
        }

        function applyServerLists(d, selected) {
            ['driver', 'foreman', 'manager', 'autogrout'].forEach(function (key) {
                var lst = d && d.lists && d.lists[key];
                if (lst && Array.isArray(lst)) {
                    var mgr = listManagers[key];
                    mgr.setServer(lst);
                    mgr.renderSelect((selected && selected[key]) || '');
                }
            });
        }

        function loadListsFromServer() {
            if (!STAFF_URL || STAFF_URL.indexOf('http') !== 0) return;
            var selected = {
                driver: $root.find('#fp_driver').val(),
                foreman: $root.find('#fp_foreman').val(),
                manager: $root.find('#fp_manager').val(),
                autogrout: $root.find('#fp_autogrout').val()
            };
            jQuery.getJSON(STAFF_URL, { t: Date.now() })
                .done(function (d) { applyServerLists(d, selected); })
                .fail(function () { console.warn('staff.php: сервер недоступен, используем локальные списки'); });
        }

        var listManagers = {
            driver: createListManager('driver', DEFAULT_DRIVERS),
            foreman: createListManager('foreman', DEFAULT_FOREMEN),
            manager: createListManager('manager', DEFAULT_MANAGERS),
            autogrout: createListManager('autogrout', DEFAULT_AUTOGROUTS)
        };

        function currentPrice() {
            if (!PRICES) return null;
            for (var i = 0; i < PRICES.prices.length; i++) {
                if (PRICES.prices[i].id === currentId) return PRICES.prices[i];
            }
            return PRICES.prices[0] || null;
        }

        function rangeFor(area) {
            var R = [
                { min: 0, max: 39, label: '0-39' }, { min: 40, max: 49, label: '40-49' },
                { min: 50, max: 69, label: '50-69' }, { min: 70, max: 79, label: '70-79' },
                { min: 80, max: 99, label: '80-99' }, { min: 100, max: 119, label: '100-119' },
                { min: 120, max: 139, label: '120-139' }, { min: 140, max: 999999, label: '>140' }
            ];
            var c = R[0];
            for (var i = 0; i < R.length; i++) if (area >= R[i].min) c = R[i];
            return c;
        }

        function baseRate(base, thickness, area) {
            if (thickness < 5) thickness = 5;
            var R = rangeFor(area);
            var idx = [
                { min: 0 }, { min: 40 }, { min: 50 }, { min: 70 }, { min: 80 },
                { min: 100 }, { min: 120 }, { min: 140 }
            ].findIndex(function (x) { return x.min === R.min; });
            var key = String(thickness);
            if (base[key]) return base[key][idx];
            if (thickness > 15) return base['15'][idx] + (thickness - 15) * PER_CM_ABOVE_15;
            return null;
        }

        function floorSurcharge(floor) {
            if (floor < 10) return 0;
            if (floor <= 14) return (floor - 9) * 20;
            return 100 + (floor - 14) * 30;
        }

        function money(v) {
            try { return Math.round(v).toLocaleString('ru-RU') + ' ₽'; }
            catch (e) { return Math.round(v) + ' ₽'; }
        }

        /* ---------- ЗАГРУЗКА ПРАЙСОВ ---------- */
        function loadPrices(cb) {
            if (PRICES_URL && PRICES_URL.indexOf('http') === 0) {
                jQuery.getJSON(PRICES_URL).done(function (d) {
                    PRICES = d; cb();
                }).fail(function () {
                    PRICES = window.GALILEO_PRICES || null; cb();
                });
            } else {
                PRICES = window.GALILEO_PRICES || null; cb();
            }
        }

        /* ---------- ВЫБОР ПРАЙСА / МАРКИ ---------- */
        function buildPraisSelect() {
            var groups = {};
            PRICES.prices.forEach(function (p) {
                var key = p.prais + '|' + p.date;
                if (!groups[key]) groups[key] = { label: p.prais + (p.date ? ' (' + p.date + ')' : ''), grades: [] };
                groups[key].grades.push(p);
            });
            var $p = $root.find('#fp_prais');
            $p.empty();
            Object.keys(groups).forEach(function (key) {
                $p.append('<option value="' + key + '">' + groups[key].label + '</option>');
            });
            $p.off('change').on('change', function () { fillGrades($p.val()); currentId = $root.find('#fp_grade').val(); update(); });
        }

        function fillGrades(praisKey) {
            var $g = $root.find('#fp_grade');
            $g.empty();
            PRICES.prices.forEach(function (p) {
                if ((p.prais + '|' + p.date) === praisKey) {
                    $g.append('<option value="' + p.id + '">' + p.grade + '</option>');
                }
            });
            $g.off('change').on('change', function () { currentId = $g.val(); update(); });
        }

        function applyDefault() {
            var def = null;
            try { def = localStorage.getItem('galileo_default'); } catch (e) {}
            if (!def && PRICES.default) def = PRICES.default;
            // найти группу для def
            var price = null;
            PRICES.prices.forEach(function (p) { if (p.id === def) price = p; });
            if (!price && PRICES.prices.length) price = PRICES.prices[0];
            currentId = price.id;
            var praisKey = price.prais + '|' + price.date;
            $root.find('#fp_prais').val(praisKey);
            fillGrades(praisKey);
            $root.find('#fp_grade').val(price.id);
        }

        /* ---------- РАСЧЁТ ---------- */
        function compute() {
            var price = currentPrice();
            if (!price) return { errors: ['Нет данных прайса'] };
            var base = price.base;

            var area = num('fp_area');
            var thickness = num('fp_thickness');
            var floor = num('fp_floor') || 1;
            var items = [];
            var matTotal = 0, workTotal = 0;
            var errors = [];

            if (area <= 0) errors.push('Укажите площадь > 0');
            if (thickness < 3) errors.push('Толщина должна быть ≥ 3 см');
            if (errors.length) return { errors: errors };

            function pushItem(label, amount, note, m, w) {
                m = m || 0; w = (typeof w === 'number') ? w : amount;
                items.push({ label: label, amount: amount, note: note, material: m, work: w });
                matTotal += m; workTotal += w;
            }
            function perM2(label, per, note, split) {
                if (per > 0) {
                    var m = split ? area * split.m : 0;
                    var w = split ? area * split.w : area * per;
                    pushItem(label, area * per, note, m, w);
                }
            }

            var range = rangeFor(area);
            var rate = baseRate(base, thickness, area);
            pushItem('Базовая стяжка ' + thickness + ' см, ' + price.grade + ' (диапазон ' + range.label + ' м²)',
                area * rate, 'Цена за 1 м²: ' + money(rate));

            if (checked('fp_plastic')) perM2('Пластификатор для тёплого пола (п.1)', 10 * thickness, '10 ₽/см × ' + thickness + ' см');
            if (checked('fp_frost')) perM2('Противоморозная добавка (п.5)', 10 * thickness, '10 ₽/см × ' + thickness + ' см (t ≤ -5°C)');
            if (checked('fp_film')) perM2('Плёнка в 2 слоя (п.6)', 40, '40 ₽/м²');
            if (checked('fp_sandtamp')) perM2('Песок (трамбовка) (п.8)', 200, '200 ₽/м²');
            if (checked('fp_iron')) perM2('Железнение (п.9)', 500, '500 ₽/м²');

            var hose = num('fp_hose');
            if (hose > 100) {
                var hoseBlocks = Math.ceil((hose - 100) / 20);
                var hosePerBlock = Math.max(60 * area, 12000);
                pushItem('Наценка за шланги >100 п.м (п.2)', hoseBlocks * hosePerBlock,
                    'за каждые 20 п.м: ' + money(hosePerBlock) + ' (60 ₽/м² × ' + area + ' м², мин. 12 000 ₽) × ' + hoseBlocks + ' (шланг ' + hose + ' п.м)');
            }

            var fs = floorSurcharge(floor);
            if (fs > 0) perM2('Наценка за этаж (п.3/п.4)', fs, (floor <= 14 ? 'п.3' : 'п.4') + ': ' + fs + ' ₽/м²');

            if (checked('fp_mesh')) {
                var meshW = checked('fp_mesh_work');
                perM2('Металлическая сетка 100×100×3мм (п.11)', meshW ? 120 : 300, meshW ? 'только работа: 120 ₽/м²' : '180+120 ₽/м²', meshW ? { m: 0, w: 120 } : { m: 180, w: 120 });
            }
            var noise = NOISE[val('fp_noise')];
            if (noise) {
                var nW = checked('fp_noise_work');
                perM2(noise.label, nW ? noise.w : noise.m + noise.w, nW ? 'только работа: ' + noise.w + ' ₽/м²' : noise.m + '+' + noise.w + ' ₽/м²', nW ? { m: 0, w: noise.w } : { m: noise.m, w: noise.w });
            }

            if (checked('fp_sandlayer_on')) {
                var scm = num('fp_sandlayer_cm');
                if (scm > 0) {
                    var sW = checked('fp_sandlayer_work');
                    perM2('Подсыпка песком ' + scm + ' см (п.10)', sW ? 20 * scm : 60 * scm, sW ? 'только работа: 20 ₽/м² на см × ' + scm + ' см' : '60 ₽/м² на см × ' + scm + ' см', sW ? { m: 0, w: 20 * scm } : { m: 40 * scm, w: 20 * scm });
                }
            }

            var kerOn = checked('fp_keramzit_on');
            var kcm = num('fp_keramzit_cm');
            var kerWorkOnly = checked('fp_keramzit_work');
            if (kerOn && kcm > 0) {
                perM2('Керамзит ' + kcm + ' см (п.16)', kerWorkOnly ? 70 * kcm : 150 * kcm, kerWorkOnly ? 'только работа: 70 ₽/м² на см × ' + kcm + ' см' : '150 ₽/м² на см × ' + kcm + ' см', kerWorkOnly ? { m: 0, w: 70 * kcm } : { m: 80 * kcm, w: 70 * kcm });
            }
            if (kerOn && checked('fp_keramzit_pour')) perM2('Проливка керамзита молочком (п.17)', kerWorkOnly ? 150 : 500, kerWorkOnly ? 'только работа: 150 ₽/м²' : '350+150 ₽/м²', kerWorkOnly ? { m: 0, w: 150 } : { m: 350, w: 150 });

            if (checked('fp_hosewrap')) pushItem('Обмотка шланга плёнкой (п.7)', 500 * floor, '500 ₽/этаж × ' + floor);

            if (checked('fp_noelevator')) {
                pushItem('Подъём оборудования без лифта (п.18)', 1000 * floor, '1000 ₽/этаж × ' + floor);
                if (kerOn && kcm > 0) {
                    var vol = area * (thickness / 100);
                    pushItem('Подъём керамзита без лифта (п.19)', 1000 * vol * floor, '1000 ₽/м³/этаж × ' + vol.toFixed(2) + ' м³ × ' + floor);
                }
                if (checked('fp_mesh')) pushItem('Подъём сетки без лифта (п.20)', area * 10 * floor, '10 ₽/м²/этаж × ' + area + ' м² × ' + floor);
            }

            var threshold = checked('fp_pushkino') ? 15 : 5;
            var dist = num('fp_distance');
            var distCost = 0, distNote = '';
            if (dist > threshold) { distCost += dist * 80; distNote = (threshold === 15 ? 'Пушкино, ' : '') + '> ' + threshold + ' км: ' + dist + '×80'; }
            if (dist > 200) { distCost += (dist - 200) * 50; distNote += (distNote ? '; ' : '') + '>200 км: +' + (dist - 200) + '×50'; }
            if (distCost > 0) pushItem('Наценка за расстояние (п.17)', distCost, distNote);

            var subtotal = matTotal + workTotal;

            var zonePct = ({ za_mkad: 0, za_ttk: 5, za_sad: 10 })[val('fp_location')];
            var zoneAmount = subtotal * zonePct / 100;
            if (zoneAmount > 0) pushItem('Расположение (п.18/п.19)', zoneAmount, '+' + zonePct + '%');

            var payPct = ({ pay_cash: 0, pay_beznal: 10, pay_beznal_vat: 22 })[val('fp_payment')];
            var payBase = subtotal + zoneAmount;
            var payAmount = payBase * payPct / 100;
            if (payAmount > 0) pushItem('Форма оплаты (п.42)', payAmount, '+' + payPct + '%');

            var total = payBase + payAmount;

            // Минимальный выезд (до скидки)
            var minCallout = minCalloutFor(price.grade);
            if (!checked('fp_second') && total < minCallout) {
                var diff = minCallout - total;
                pushItem('Минимальный выезд (мин. сумма)', diff, 'минимум ' + money(minCallout) + ' (' + price.grade + ')');
                total = minCallout;
            }

            // Скидка (применяется и к сумме минимального выезда)
            var disc = num('fp_discount');
            if (disc > 0) {
                var discAmount = total * disc / 100;
                total -= discAmount;
                var sumMW = matTotal + workTotal;
                var mDisc = sumMW ? discAmount * matTotal / sumMW : 0;
                var wDisc = discAmount - mDisc;
                pushItem('Скидка менеджера', -discAmount, '−' + disc + '%', -mDisc, -wDisc);
            }

            // Скидка фиксированной суммой (после %)
            var discFix = num('fp_discount_fix');
            if (discFix > 0) {
                var discFixAmount = Math.min(discFix, total);
                total -= discFixAmount;
                var sumMW2 = matTotal + workTotal;
                var mFix = sumMW2 ? discFixAmount * matTotal / sumMW2 : 0;
                var wFix = discFixAmount - mFix;
                pushItem('Скидка менеджера (фикс. сумма)', -discFixAmount, '−' + money(discFixAmount), -mFix, -wFix);
            }

            return { items: items, total: total, materials: matTotal, work: workTotal, rate: rate, range: range.label, area: area, thickness: thickness, grade: price.grade };
        }

        function renderBody() {
            return '' +
                '<div class="fp">' +
                '  <div class="row">' +
                '  <div class="col-12 col-md-6 col-lg-3 fp-left">' +
                '    <div class="fp-group">Прайс и марка стяжки</div>' +
                '    <label class="fp-field">Прайс<select id="fp_prais" class="fp-input"></select></label>' +
                '    <label class="fp-field">Марка стяжки<select id="fp_grade" class="fp-input"></select></label>' +

                '    <div class="fp-group">Основные параметры</div>' +
                '    <label class="fp-field">Площадь помещения, м²<input type="number" id="fp_area" class="fp-input" min="0" step="0.1" value="1"></label>' +
                '    <label class="fp-field">Толщина стяжки, см<input type="number" id="fp_thickness" class="fp-input" min="3" step="1" value="5"></label>' +
                '    <label class="fp-field">Этаж<input type="number" id="fp_floor" class="fp-input" min="1" step="1" value="1"></label>' +
                '    <label class="fp-field">Длина шлангов, пог.м<input type="number" id="fp_hose" class="fp-input" min="0" step="1" value="0"></label>' +
                '    <label class="fp-field">Адрес объекта</label>' +
                '    <div class="fp-suggest-wrap">' +
                '      <input type="text" id="fp_address" class="fp-input" placeholder="Адрес объекта">' +
                '    </div>' +
                '    <div id="fp_address_link" class="fp-addr-link"></div>' +
                '    <div id="fp_mkad_dist" class="fp-addr-link"></div>' +
                '    <label class="fp-field">Расстояние от МКАД, км<input type="number" id="fp_distance" class="fp-input" min="0" step="1" value="0"></label>' +
                '    <label class="fp-field">Расположение<select id="fp_location" class="fp-input">' +
                '        <option value="za_mkad">За МКАД</option><option value="za_ttk">В пределах ТТК (+5%)</option><option value="za_sad">В пределах Садового (+10%)</option></select></label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_pushkino"> Направление Пушкино (порог 15 км)</label>' +
                '    <label class="fp-field">Форма оплаты<select id="fp_payment" class="fp-input">' +
                '        <option value="pay_cash">Наличные</option><option value="pay_beznal">Безнал без НДС (+10%)</option><option value="pay_beznal_vat">Безнал с НДС (+22%)</option></select></label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_second"> Второй объект в том же доме (без мин. выезда)</label>' +
                '  </div>' +

                '  <div class="col-12 col-md-6 col-lg-3 fp-middle">' +
                '    <div class="fp-group">Дополнения к стяжке</div>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_plastic"> Пластификатор для тёплого пола (п.1)</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_frost"> Противоморозная добавка ≤ -5°C (п.5)</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_film"> Плёнка в 2 слоя (п.6)</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_hosewrap"> Обмотка шланга плёнкой (п.7)</label>' +

                '    <div class="fp-group">Другие работы</div>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_sandtamp"> Песок (трамбовка) (п.8)</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_iron"> Железнение (п.9)</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_mesh"> Металлическая сетка 100×100×3мм (п.11)</label>' +
                '    <label class="fp-check fp-indent"><input type="checkbox" id="fp_mesh_work"> только работа</label>' +
                '    <label class="fp-field">Шумоизоляция<select id="fp_noise" class="fp-input">' +
                '        <option value="none">— нет —</option><option value="izokom">Изоком 5мм (+230 ₽/м²)</option><option value="eps">ЭПП 20мм (+800 ₽/м²)</option><option value="combi">Шуманет комби 5мм (+1200 ₽/м²)</option><option value="hydro">Шуманет гидро 5мм (+1400 ₽/м²)</option></select></label>' +
                '    <label class="fp-check fp-indent"><input type="checkbox" id="fp_noise_work"> только работа</label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_sandlayer_on"> Подсыпка песком (п.10)</label>' +
                '    <label class="fp-check fp-indent"><input type="checkbox" id="fp_sandlayer_work"> только работа</label>' +
                '    <label class="fp-field fp-indent">толщина слоя песка, см<input type="number" id="fp_sandlayer_cm" class="fp-input" min="0" step="1" value="5"></label>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_keramzit_on"> Керамзит (п.16)</label>' +
                '    <label class="fp-check fp-indent"><input type="checkbox" id="fp_keramzit_work"> только работа</label>' +
                '    <label class="fp-field fp-indent">толщина керамзита, см<input type="number" id="fp_keramzit_cm" class="fp-input" min="0" step="1" value="5"></label>' +
                '    <label class="fp-check fp-indent"><input type="checkbox" id="fp_keramzit_pour"> Проливка молочком (п.17)</label>' +

                '    <div class="fp-group">Подъём (нет лифта)</div>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_noelevator"> Нет лифта — наценки за подъём (п.18-20)</label>' +
                '  </div>' +

                '  <div class="col-12 col-md-6 col-lg-3 fp-order">' +
                '    <div class="fp-group">Параметры заказа</div>' +
                '    <label class="fp-field">№ Заказа<input type="text" id="fp_order" class="fp-input" placeholder="Номер заказа"></label>' +
                '    <div class="fp-field-row"><label class="fp-field fp-field-half">Дата работ<input type="date" id="fp_date_work" class="fp-input"></label><label class="fp-field fp-field-half">Время<input type="time" id="fp_time_work" class="fp-input"></label></div>' +
                '    <label class="fp-check"><input type="checkbox" id="fp_quiet_hour"> Тихий час</label>' +
                '    <label class="fp-field">Контакты<input type="text" id="fp_contacts" class="fp-input"></label>' +
                '    <label class="fp-field">Автосмеситель<span class="fp-select-wrap"><select id="fp_autogrout" class="fp-input"></select><button type="button" id="fp_autogrout_cfg" class="fp-select-cog" title="Настроить список">⚙</button></span></label>' +
                '    <div id="fp_autogrout_modal" class="fp-modal" style="display:none"><div class="fp-modal-inner"><div class="fp-modal-head">Автосмесители <button type="button" class="fp-modal-close">✕</button></div><div id="fp_autogrout_list" class="fp-modal-list"></div><div class="fp-modal-foot"><input type="text" id="fp_autogrout_new" class="fp-input" placeholder="Новый автосмеситель"><button type="button" id="fp_autogrout_add_btn" class="fp-btn fp-btn-sm">+</button></div></div></div>' +
                '    <label class="fp-field">Водитель<span class="fp-select-wrap"><select id="fp_driver" class="fp-input"></select><button type="button" id="fp_driver_cfg" class="fp-select-cog" title="Настроить список">⚙</button></span></label>' +
                '    <div id="fp_driver_modal" class="fp-modal" style="display:none"><div class="fp-modal-inner"><div class="fp-modal-head">Водители <button type="button" class="fp-modal-close">✕</button></div><div id="fp_driver_list" class="fp-modal-list"></div><div class="fp-modal-foot"><input type="text" id="fp_driver_new" class="fp-input" placeholder="Новый водитель"><button type="button" id="fp_driver_add_btn" class="fp-btn fp-btn-sm">+</button></div></div></div>' +
                '    <label class="fp-field">Бригадир<span class="fp-select-wrap"><select id="fp_foreman" class="fp-input"></select><button type="button" id="fp_foreman_cfg" class="fp-select-cog" title="Настроить список">⚙</button></span></label>' +
                '    <div id="fp_foreman_modal" class="fp-modal" style="display:none"><div class="fp-modal-inner"><div class="fp-modal-head">Бригадиры <button type="button" class="fp-modal-close">✕</button></div><div id="fp_foreman_list" class="fp-modal-list"></div><div class="fp-modal-foot"><input type="text" id="fp_foreman_new" class="fp-input" placeholder="Новый бригадир"><button type="button" id="fp_foreman_add_btn" class="fp-btn fp-btn-sm">+</button></div></div></div>' +
                '    <label class="fp-field">Менеджер<span class="fp-select-wrap"><select id="fp_manager" class="fp-input"></select><button type="button" id="fp_manager_cfg" class="fp-select-cog" title="Настроить список">⚙</button></span></label>' +
                '    <div id="fp_manager_modal" class="fp-modal" style="display:none"><div class="fp-modal-inner"><div class="fp-modal-head">Менеджеры <button type="button" class="fp-modal-close">✕</button></div><div id="fp_manager_list" class="fp-modal-list"></div><div class="fp-modal-foot"><input type="text" id="fp_manager_new" class="fp-input" placeholder="Новый менеджер"><button type="button" id="fp_manager_add_btn" class="fp-btn fp-btn-sm">+</button></div></div></div>' +
                '    <label class="fp-field">Примечание<textarea id="fp_note" class="fp-input" rows="3"></textarea></label>' +
                '  </div>' +

                '  <div class="col-12 col-md-6 col-lg-3 fp-right">' +
                '    <div class="fp-total-label">Итоговая стоимость</div>' +
                '    <div id="fp_total" class="fp-total">—</div>' +
                '    <div class="fp-disc">' +
                '      <label class="fp-field">Скидка, %<input type="number" id="fp_discount" class="fp-input" min="0" max="100" step="1" value="0"></label>' +
                '      <label class="fp-field">Скидка, ₽<input type="number" id="fp_discount_fix" class="fp-input" min="0" step="1" value="0"></label>' +
                '    </div>' +
                '    <div id="fp_items" class="fp-items"></div>' +
                '    <div class="fp-btns">' +
                '      <button id="fp_save" class="fp-btn" type="button">Формула</button>' +
                '      <button id="fp_logist_btn" class="fp-btn fp-btn-logist" type="button">Логист</button>' +
                '    </div>' +
                '    <div id="fp_save_status" class="fp-save-status"></div>' +
                '    <div id="fp_last_hint" class="fp-last-hint"></div>' +
                '  </div>' +
                '  </div>' +

                '  <div id="fp_logist" class="fp-logist"></div>' +
                '  <div id="fp_formula_modal" class="fp-modal" style="display:none">' +
                '    <div class="fp-modal-inner fp-formula-inner">' +
                '      <div class="fp-modal-head">Формула расчёта <button type="button" class="fp-modal-close">✕</button></div>' +
                '      <div id="fp_formula_body" class="fp-formula-body"></div>' +
                '      <div class="fp-modal-foot fp-formula-foot">' +
                '        <button id="fp_formula_crm" class="fp-btn fp-btn-crm" type="button">Отправить в CRM</button>' +
                '        <span id="fp_formula_status" class="fp-save-status"></span>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '</div>';
        }

        function update() {
            var r = compute();
            var $items = $root.find('#fp_items');
            var $total = $root.find('#fp_total');
            if (r.errors) {
                $total.text('—').removeClass('fp-ok');
                $items.html('<div class="fp-err">' + r.errors.join('<br>') + '</div>');
                return;
            }
            var html = '';
            for (var i = 0; i < r.items.length; i++) {
                var it = r.items[i];
                html += '<div class="fp-item">' +
                    '<div class="fp-item-row"><span class="fp-item-label">' + it.label + '</span>' +
                    '<span class="fp-item-amt">' + money(it.amount) + '</span></div>' +
                    (it.note ? '<div class="fp-item-note">' + it.note + '</div>' : '') +
                    '</div>';
            }
            html += '<div class="fp-item fp-subtotal"><div class="fp-item-row"><span>Базовая цена за 1 м² (' + r.grade + ')</span><span>' + money(r.rate) + '</span></div></div>';
            $items.html(html);
            $total.text(money(r.total)).addClass('fp-ok');
            if ($root.find('#fp_logist').hasClass('fp-open')) renderLogist();
        }

        /* Шапка расчёта (Заказ/Договор/Прайс/Адрес) — видна в карточке «Формула» и в CRM. */
        function orderHeader() {
            var o = val('fp_order').trim();
            var pr = '—';
            try { pr = currentPrice().prais || '—'; } catch (e) {}
            return 'Заказ №: ' + (o || '—') + '\n' +
                   'Договор №: ' + (o || '—') + '\n' +
                   'Прайс: ' + pr + '\n' +
                   'Адрес: ' + (val('fp_address').trim() || '—');
        }

        function summaryText() {
            var r = compute();
            if (r.errors) return r.errors.join('\n');
            var t = orderHeader() + '\n';
            t += '--------------------------------\n';
            t += 'Расчёт стяжки пола (' + r.grade + ')\n';
            t += 'Площадь: ' + r.area + ' м², толщина: ' + r.thickness + ' см (диапазон ' + r.range + ')\n';
            for (var i = 0; i < r.items.length; i++) {
                t += '- ' + r.items[i].label + ': ' + money(r.items[i].amount) + (r.items[i].note ? ' (' + r.items[i].note + ')' : '') + '\n';
            }
            t += 'ИТОГО: ' + money(r.total);
            return t;
        }

        /* Полный текст формулы (для окна «Формула»). */
        function formulaText() {
            var r = compute();
            if (r.errors) return r.errors.join('\n');
            var t = orderHeader() + '\n';
            t += '--------------------------------\n';
            t += 'ФОРМУЛА РАСЧЁТА (' + r.grade + ', диапазон ' + r.range + ')\n';
            t += 'Площадь: ' + r.area + ' м² · Толщина: до ' + r.thickness + ' см\n';
            t += 'Базовая ставка: ' + money(r.rate) + ' за м²\n';
            t += '--------------------------------------------------\n';
            var mat = 0, work = 0;
            for (var i = 0; i < r.items.length; i++) {
                var it = r.items[i];
                if (it.label.indexOf('Скидка') === 0) { t += '— ' + it.label + ': ' + money(it.amount) + (it.note ? '  (' + it.note + ')' : '') + '\n'; continue; }
                mat += it.m || 0; work += it.w || 0;
                t += '— ' + it.label + ': ' + money(it.amount) + (it.note ? '  (' + it.note + ')' : '') + '\n';
            }
            t += '--------------------------------------------------\n';
            t += 'Материалы: ' + money(r.materials) + ' · Работа: ' + money(r.work) + '\n';
            t += 'ИТОГО: ' + money(r.total);
            return t;
        }

        /* Отправка в amoCRM. kind: 'Формула' (вариант расчёта) или 'Логист' (карточка логиста). */
        function saveToCrm(kind, statusSel) {
            var $status = $root.find(statusSel || '#fp_save_status');
            $status.removeClass('fp-ok fp-err').text('Отправка...');

            var isLogist = (kind === 'Логист');
            var text = isLogist ? logistText() : summaryText();
            var cr = compute();
            var price = (!cr.errors) ? Math.round(cr.total) : 0;

            var order = val('fp_order').trim();
            var storedVariant = null;
            try {
                var sv = sessionStorage.getItem('fp_crm_variant');
                if (sv) { var v = parseInt(sv, 10); if (!isNaN(v) && v > 0) storedVariant = v; }
            } catch (e) {}

            var payload = {
                text: text,
                price: price,
                kind: isLogist ? 'logist' : 'variant',
                variant_no: storedVariant || 0,
                order: order,
                contacts: val('fp_contacts').trim(),
                address: val('fp_address').trim(),
                subdomain: SUBDOMAIN
            };

            // Режим виджета: пишем примечание в текущую сделку (в карточке amoCRM).
            var entityId = null;
            if (self.system && self.system.extra) {
                entityId = self.system.extra.id || self.system.extra.entity_id || null;
            }

            var okMsg = 'Сохранено в amoCRM.';
            var suffix = isLogist ? 'Вариант сохранён.' : 'Сохранить ещё вариант.';
            var onOk = function (d) {
                // Запоминаем сделку и номер варианта, чтобы кнопки писали в одну сделку.
                if (d && d.lead_id) {
                    try { sessionStorage.setItem('fp_crm_entity_id', String(d.lead_id)); } catch (e) {}
                }
                if (d && d.variant_no) {
                    try { sessionStorage.setItem('fp_crm_variant', String(d.variant_no)); } catch (e) {}
                }
                var url = d && d.url;
                var msg;
                if (url) {
                    msg = '<a href="' + url + '" target="_blank" rel="noopener">Открыть сделку</a>';
                    if (d && d.variant_no) msg = 'Вариант ' + d.variant_no + '. ' + msg;
                } else {
                    msg = okMsg;
                }
                $status.removeClass('fp-err').addClass('fp-ok').html(msg);
                if (url) $root.find('#fp_last_hint').text(isLogist ? 'Логист привязан к текущему расчёту.' : suffix + ' Кликните ещё раз — создастся следующий вариант.');
            };
            var onErr = function (xhr) {
                var hint = '';
                try { var d = JSON.parse(xhr.responseText); hint = d && d.message ? ' — ' + d.message : ''; } catch (e) {}
                // Если не удалось дописать в сохранённую сделку — убираем её id,
                // чтобы следующая попытка создала новую, а не писала в битую.
                if (!order && !inWidget) {
                    try {
                        sessionStorage.removeItem('fp_crm_entity_id');
                        sessionStorage.removeItem('fp_crm_variant');
                    } catch (e2) {}
                }
                $status.removeClass('fp-ok').addClass('fp-err').text('Ошибка сохранения' + hint);
            };

            var inWidget = !!entityId;
            var url = inWidget ? API_URL : CREATE_URL;
            if (!url || url.indexOf('http') !== 0) {
                $status.removeClass('fp-err').addClass('fp-ok').text('Локальный режим. Не настроен бэкенд.\n' + text);
                return;
            }

            if (inWidget) {
                // виджет: примечание в текущую сделку
                var entity = (self.system.area === 'ccard') ? 'contacts' : 'leads';
                payload.entity = entity;
                payload.entity_id = entityId;
            } else if (!order) {
                // страница БЕЗ № заказа: дописываем в сделку этой сессии (первый клик создаёт её),
                // чтобы «Формула» и «Логист» не плодили отдельные сделки.
                var storedId = null;
                try {
                    var s = sessionStorage.getItem('fp_crm_entity_id');
                    if (s) { var n = parseInt(s, 10); if (!isNaN(n) && n > 0) storedId = n; }
                } catch (e) {}
                payload.entity = 'leads';
                payload.entity_id = storedId || 0; // 0 → сервер создаст новую сделку и вернёт её id
            }

            jQuery.ajax({
                url: url, method: 'POST', contentType: 'application/json',
                data: JSON.stringify(payload),
                success: onOk, error: onErr
            });
        }

        /* Окно «Формула»: рендер полного текста и открытие модалки. */
        function openFormula() {
            var $body = $root.find('#fp_formula_body');
            $body.html('<pre>' + esc(formulaText()) + '</pre>');
            $root.find('#fp_formula_status').removeClass('fp-ok fp-err').text('');
            $root.find('#fp_formula_modal').show();
        }

        function resetData() {
            // Новый расчёт = новая сделка в amoCRM.
            try {
                sessionStorage.removeItem('fp_crm_entity_id');
                sessionStorage.removeItem('fp_crm_variant');
            } catch (e) {}
            $root.find('input[type="checkbox"]').prop('checked', false);
            $root.find('input[type="number"]').each(function () {
                this.value = (this.defaultValue !== undefined && this.defaultValue !== '') ? this.defaultValue : '';
            });
            $root.find('input[type="text"], textarea').each(function () { this.value = ''; });
            $root.find('#fp_date_work').val('');
            $root.find('#fp_time_work').val('');
            $root.find('#fp_location').val('za_mkad');
            $root.find('#fp_payment').val('pay_cash');
            $root.find('#fp_noise').val('none');
            $root.find('#fp_address').val('');
            listManagers.driver.renderSelect('');
            listManagers.foreman.renderSelect('');
            listManagers.manager.renderSelect('');
            listManagers.autogrout.renderSelect('');
            $root.find('.fp-modal').hide();
            $root.find('#fp_address_link').empty();
            $root.find('#fp_mkad_dist').empty();
            $root.find('#fp_save_status').text('');
            $root.find('#fp_logist').removeClass('fp-open').empty();
            $root.find('#fp_logist_btn').removeClass('fp-active');
            applyDefault();
            update();
        }

        function updateAddressLink(title) {
            var $link = $root.find('#fp_address_link');
            if (!title) { $link.empty(); return; }
            $link.html('<a href="https://yandex.ru/maps/?text=' + encodeURIComponent(title) + '" target="_blank" rel="noopener">Открыть на Яндекс.Картах</a>');
        }

        /* Упрощённый контур МКАД (долгота, широта) для оценки расстояния по прямой. */
        var MKAD_RING = [
            [37.814, 55.861], [37.615, 55.852], [37.573, 55.866], [37.420, 55.850],
            [37.367, 55.787], [37.364, 55.770], [37.382, 55.711], [37.405, 55.668],
            [37.443, 55.623], [37.485, 55.583], [37.533, 55.563], [37.596, 55.568],
            [37.611, 55.580], [37.733, 55.598], [37.700, 55.573], [37.770, 55.600],
            [37.822, 55.640], [37.852, 55.685], [37.835, 55.720], [37.840, 55.745],
            [37.774, 55.805]
        ];

        function haversineKm(lat1, lon1, lat2, lon2) {
            var R = 6371;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function distanceToMkad(lat, lon) {
            var min = Infinity;
            for (var i = 0; i < MKAD_RING.length; i++) {
                var d = haversineKm(lat, lon, MKAD_RING[i][1], MKAD_RING[i][0]);
                if (d < min) min = d;
            }
            return min;
        }

        function showMkadDistance(lat, lon) {
            var $d = $root.find('#fp_mkad_dist');
            if (isNaN(lat) || isNaN(lon)) { $d.empty(); return; }
            var km = distanceToMkad(lat, lon);
            if (!isFinite(km)) { $d.empty(); return; }
            $d.html('Расстояние до МКАД (по прямой): <b>' + km.toFixed(1) + ' км</b>');
        }

        /* Поиск адресов: сначала JS API (ymaps.geocode), при его ошибке/пустом ответе
           пробуем внутренний HTTP-прокси геокодера. */
        function httpGeoSearch(geocode, results, cb) {
            if (!GEO_PROXY_URL) { cb([], true); return; }
            jQuery.getJSON(GEO_PROXY_URL, {
                geocode: geocode,
                results: results,
                lang: 'ru_RU'
            }).done(function (d) {
                var g = d.response && d.response.GeoObjectCollection;
                var fm = g && g.featureMember, items = [];
                if (fm) {
                    for (var i = 0; i < fm.length; i++) {
                        var geo = fm[i].GeoObject;
                        var meta = geo && geo.metaDataProperty && geo.metaDataProperty.GeocoderMetaData;
                        var name = (meta && meta.text) || (geo && geo.name);
                        var posArr = (geo && geo.Point && geo.Point.pos) ? geo.Point.pos.split(' ') : [];
                        items.push({ name: name, lat: parseFloat(posArr[1]), lon: parseFloat(posArr[0]) });
                    }
                }
                cb(items, false);
            }).fail(function () { cb([], true); });
        }

        function fromGeoObjects(res) {
            var items = [];
            res.geoObjects.each(function (obj) {
                var coords = (obj.geometry && obj.geometry.getCoordinates) ? obj.geometry.getCoordinates() : [NaN, NaN];
                var name = obj.getAddressLine ? obj.getAddressLine() : '';
                items.push({ name: name, lat: coords[0], lon: coords[1] });
            });
            return items;
        }

        function geoSearch(geocode, results, cb) {
            if (window.ymaps && ymaps.geocode) {
                ymaps.geocode(geocode, { results: results }).then(function (res) {
                    var items = fromGeoObjects(res);
                    if (items.length) { cb(items, false); return; }
                    httpGeoSearch(geocode, results, cb);
                }).catch(function () {
                    httpGeoSearch(geocode, results, cb);
                });
                return;
            }
            httpGeoSearch(geocode, results, cb);
        }

        function geocodeAndShowMkad(address) {
            var $d = $root.find('#fp_mkad_dist');
            if (!address) { $d.empty(); return; }
            $d.html('Определение координат…');
            geoSearch(address, 1, function (items, err) {
                if (!items.length || isNaN(items[0].lat) || isNaN(items[0].lon)) {
                    $d.empty();
                    return;
                }
                showMkadDistance(items[0].lat, items[0].lon);
            });
        }

        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function fmtDate(v) {
            if (!v) return '';
            var p = String(v).split('-');
            return (p.length === 3) ? p[2] + '.' + p[1] + '.' + p[0] : String(v);
        }

        /* Полный текст карточки логиста: водители, менеджеры, расстояние, маршрут и т.п. */
        function logistText() {
            var r = compute();
            var L = [];
            if (r.errors) {
                return 'Расчёт невозможен: ' + r.errors.join('; ');
            }
            var price = currentPrice();
            var area = r.area, thickness = r.thickness;
            var grade = r.grade;
            var order = val('fp_order').trim();
            var orderNo = order;
            var dateWork = val('fp_date_work');
            var address = val('fp_address').trim();
            var payLabels = { pay_cash: 'Наличные', pay_beznal: 'Безнал без НДС', pay_beznal_vat: 'Безнал с НДС' };
            var praisLabel = price.prais + (price.date ? ' (' + price.date + ')' : '');

            var plasticPer = checked('fp_plastic') ? 10 * thickness : 0;
            var frostPer = checked('fp_frost') ? 10 * thickness : 0;
            var floorPer = floorSurcharge(num('fp_floor') || 1);
            var dist = num('fp_distance');
            var threshold = checked('fp_pushkino') ? 15 : 5;
            var distCost = 0;
            if (dist > threshold) distCost += dist * 80;
            if (dist > 200) distCost += (dist - 200) * 50;
            var perM2Sum = r.rate + distCost / area + plasticPer + frostPer + floorPer;
            var formulaTotal = area * perM2Sum;

            var extraCmTable = { 'М150': 75, 'М200': 95, 'М250': 115, 'М300': 135 };
            var extraCm = extraCmTable[grade] || null;
            var payPct = ({ pay_cash: 0, pay_beznal: 10, pay_beznal_vat: 22 })[val('fp_payment')] || 0;
            if (extraCm != null && payPct > 0) extraCm = extraCm * (1 + payPct / 100);

            var hose = num('fp_hose');
            var hoseText = 'шланг ' + hose + ' п.м — до 100 п.м, наценки нет';
            if (hose > 100) {
                var hoseBlocks = Math.ceil((hose - 100) / 20);
                var hosePerBlock = Math.max(60 * area, 12000);
                var hoseTotal = hoseBlocks * hosePerBlock;
                hoseText = hose + ' п.м: (' + hose + ' − 100) ÷ 20 = ' + hoseBlocks + ' бл. × max(60 ₽/м² × ' + area + ' м² = ' + Math.round(60 * area) + ' ₽, 12 000 ₽) = ' + Math.round(hoseTotal) + ' ₽';
            }

            var extraLabels = [], extraSum = 0;
            for (var i = 0; i < r.items.length; i++) {
                var lb = r.items[i].label;
                if (/Базовая стяжка|Наценка за расстояние|Наценка за этаж|Пластификатор|Противоморозная|Расположение |Форма оплаты|Минимальный выезд|Скидка |Наценка за шланги/.test(lb)) continue;
                extraLabels.push(lb);
                extraSum += r.items[i].amount;
            }

            L.push('Заказ №: ' + orderNo);
            L.push('Договор №: ' + orderNo);
            L.push('Прайс: ' + praisLabel);
            L.push('Тип оплаты: ' + (payLabels[val('fp_payment')] || val('fp_payment')));
            L.push('Дата время начала работ: ' + ((fmtDate(dateWork) || 'не указана') + (val('fp_time_work') ? ', ' + val('fp_time_work') : '')));
            L.push('Адрес объекта: ' + (address || '—'));
            var mkadInfo = '';
            var $mk = $root.find('#fp_mkad_dist');
            if ($mk.length && $mk.text()) mkadInfo = ' · ' + $mk.text();
            L.push('Расстояние от МКАД: ' + (dist > 0 ? dist + ' км' : '—') + mkadInfo);
            L.push('Маршрут: ' + (address ? 'https://yandex.ru/maps/?rtext=~' + encodeURIComponent(address) : '—'));
            L.push('Площадь: ' + area + ' м²');
            L.push('Толщина: до ' + thickness + ' см');
            L.push('Марка стяжки: ' + grade);
            L.push('Цена по прайсу: ' + area + ' м² × ' + money(perM2Sum) + ' до ' + thickness + ' см = ' + money(formulaTotal));
            L.push('Доп услуги: ' + (extraLabels.length ? extraLabels.join('; ') : '—'));
            L.push('Цена доп. услуг: ' + (extraLabels.length ? money(extraSum) : 'Нет'));
            L.push('Цена всего: ' + money(r.total));
            L.push('Цена при толщине до ' + thickness + ' см/м2: ' + money(perM2Sum));
            L.push('Цена за увеличение толщины на 1 см/м2: ' + (extraCm != null ? money(extraCm) : '—') + (payPct > 0 ? ' (вкл. наценку ' + payPct + '% за оплату)' : ''));
            L.push('Цена при длине шланга более 100м: ' + hoseText);
            L.push('Наличие лифта: ' + (checked('fp_noelevator') ? 'нет' : 'есть'));
            L.push('Тихий час: ' + (checked('fp_quiet_hour') ? 'да' : 'нет'));
            L.push('Контакты: ' + (val('fp_contacts').trim() || '—'));
            L.push('Автосмеситель: ' + (val('fp_autogrout').trim() || '—'));
            L.push('Водитель: ' + (val('fp_driver').trim() || '—'));
            L.push('Бригадир: ' + (val('fp_foreman').trim() || '—'));
            L.push('Менеджер: ' + (val('fp_manager').trim() || '—'));
            L.push('Примечание: ' + (val('fp_note').trim() || '—'));
            return L.join('\n');
        }

        function renderLogist() {
            var $log = $root.find('#fp_logist');
            if (!$log.length) return;
            $log.html(
                '<div class="fp-logist-head">Логист' +
                '<button type="button" class="fp-logist-close">Скрыть ✕</button></div>' +
                '<div class="fp-logist-body"><pre>' + esc(logistText()) + '</pre></div>' +
                '<div class="fp-logist-foot">' +
                '<button type="button" id="fp_logist_crm" class="fp-btn fp-btn-crm">Отправить в CRM</button>' +
                '<span id="fp_logist_status" class="fp-save-status"></span>' +
                '</div>'
            );
        }

        function toggleLogist() {
            var $log = $root.find('#fp_logist');
            var $btn = $root.find('#fp_logist_btn');
            var open = !$log.hasClass('fp-open');
            $log.toggleClass('fp-open', open);
            $btn.toggleClass('fp-active', open);
            if (open) renderLogist();
        }

        /* ---------- ЖИЗНЕННЫЙ ЦИКЛ ВИДЖЕТА ---------- */
        this.init = function () { return true; };

        this.render = function () {
            self.render_template(
                { caption: 'КАЛЬКУЛЯТОР СТЯЖКИ <button id="fp_reset" class="fp-btn-reset" type="button">Очистить данные</button>', body: renderBody() },
                function () { self.bind_actions(); }
            );
            return true;
        };

        this.bind_actions = function () {
            $root = (self.$el && self.$el.length) ? self.$el : document;
            loadPrices(function () {
                if (!PRICES || !PRICES.prices.length) {
                    $root.find('#fp_items').html('<div class="fp-err">Нет данных прайсов. Проверьте prices_data.js / prices.php</div>');
                    return;
                }
                buildPraisSelect();
                applyDefault();

                var fieldKeys = ['driver', 'foreman', 'manager', 'autogrout'];
                var fieldLabels = { driver: 'Водители', foreman: 'Бригадиры', manager: 'Менеджеры', autogrout: 'Автосмесители' };
                for (var fi = 0; fi < fieldKeys.length; fi++) {
                    (function (key) {
                        var mgr = listManagers[key];
                        mgr.renderSelect('');
                        $root.find('#fp_' + key + '_modal').hide();
                        function renderModal() {
                            var list = mgr.getList();
                            var $list = $root.find('#fp_' + key + '_list').empty();
                            if (!list.length) {
                                $list.append(jQuery('<div></div>').css({ color: '#8593a0', fontSize: '13px', padding: '8px 0' }).text('Список пуст'));
                                return;
                            }
                            for (var i = 0; i < list.length; i++) {
                                var name = String(list[i]);
                                var $item = jQuery('<div></div>').addClass('fp-modal-item');
                                var $name = jQuery('<span></span>').text(name);
                                var $remove = jQuery('<button type="button"></button>')
                                    .addClass('fp-modal-del')
                                    .attr('data-name', name)
                                    .text('✕');
                                $item.append($name, $remove);
                                $list.append($item);
                            }
                        }
                        $root.find('#fp_' + key + '_cfg').on('click', function (e) { e.preventDefault(); renderModal(); $root.find('#fp_' + key + '_modal').show(); });
                        $root.find('#fp_' + key + '_modal').on('click', '.fp-modal-close', function () { $root.find('#fp_' + key + '_modal').hide(); });
                        $root.find('#fp_' + key + '_modal').on('click', function (e) { if (e.target === this) jQuery(this).hide(); });
                        $root.find('#fp_' + key + '_list').on('click', '.fp-modal-del', function () { mgr.remove(jQuery(this).attr('data-name')); renderModal(); });
                        $root.find('#fp_' + key + '_add_btn').on('click', function () { var $inp = $root.find('#fp_' + key + '_new'); mgr.add($inp.val()); $inp.val(''); renderModal(); });
                        $root.find('#fp_' + key + '_new').on('keydown', function (e) { if (e.keyCode === 13) { e.preventDefault(); $root.find('#fp_' + key + '_add_btn').click(); } });
                    })(fieldKeys[fi]);
                }
                loadListsFromServer();
                $root.find('#fp_address').on('change', function () {
                    var v = jQuery(this).val().trim();
                    updateAddressLink(v);
                    geocodeAndShowMkad(v);
                });
                $root.find('input, select').on('input change', update);
                $root.find('#fp_reset').on('click', resetData);
                $root.find('#fp_save').on('click', openFormula);
                $root.find('#fp_formula_modal').on('click', '.fp-modal-close', function () { $root.find('#fp_formula_modal').hide(); });
                $root.find('#fp_formula_modal').on('click', function (e) { if (e.target === this) jQuery(this).hide(); });
                $root.find('#fp_formula_crm').on('click', function () { saveToCrm('Формула', '#fp_formula_status'); });
                $root.find('#fp_logist_btn').on('click', toggleLogist);
                $root.find('#fp_logist').on('click', '.fp-logist-close', toggleLogist);
                $root.find('#fp_logist').on('click', '#fp_logist_crm', function () { saveToCrm('Логист', '#fp_logist_status'); });
                update();
            });
            return true;
        };

        this.settings = function () { return true; };
        this.onSave = function () { return true; };
        this.destroy = function () { return true; };
        this.advancedSettingsButton = function () { return true; };

        return this;
    };
})();
