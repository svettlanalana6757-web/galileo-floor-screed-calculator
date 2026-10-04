'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'fixed', 'script.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const returnAnchor = '        return this;\n    };\n})();';
const testHook = [
    '        this.__test = {',
    '            configure: function (price, values, checks) {',
    '                PRICES = { default: price.id, prices: [price] };',
    '                currentId = price.id;',
    '                $root = { find: function (selector) {',
    '                    var id = selector.replace(/^#/, "");',
    '                    return {',
    '                        val: function () { return values[id]; },',
    '                        is: function () { return !!checks[id]; }',
    '                    };',
    '                } };',
    '            },',
    '            compute: compute',
    '        };',
    returnAnchor
].join('\n');

if (!source.includes(returnAnchor)) {
    throw new Error('Не найден якорь для тестовой инструментализации калькулятора');
}

const instrumentedSource = source.replace(returnAnchor, testHook);
const amo = { widgets: {} };
const context = {
    window: { AMO: amo },
    AMO: amo,
    URL,
    document: { currentScript: { src: 'http://localhost/script.js' } },
    console,
    jQuery: {}
};
vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });

function fixture(overrides = {}, checks = {}) {
    const rates5 = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
    const rates15 = [100, 200, 300, 400, 500, 600, 700, 800];
    const price = {
        id: 'test-price',
        grade: 'М150',
        prais: 'Тестовый прайс',
        date: '',
        base: { '5': rates5, '15': rates15 }
    };
    const values = Object.assign({
        fp_area: '100',
        fp_thickness: '5',
        fp_floor: '1',
        fp_hose: '0',
        fp_distance: '0',
        fp_location: 'za_mkad',
        fp_payment: 'pay_cash',
        fp_discount: '0',
        fp_discount_fix: '0',
        fp_noise: 'none',
        fp_sandlayer_cm: '0',
        fp_keramzit_cm: '0'
    }, overrides);

    const widget = new amo.widgets.galileo_full_calc();
    widget.__test.configure(price, values, checks);
    return widget.__test.compute();
}

test('compute отклоняет неположительную площадь и толщину меньше 3 см', () => {
    assert.match(fixture({ fp_area: '0' }).errors[0], /площадь/i);
    assert.match(fixture({ fp_thickness: '2' }).errors[0], /толщина/i);
});

test('baseRate выбирает диапазон площади и добавляет ставку после 15 см', () => {
    const result = fixture({ fp_area: '45', fp_thickness: '16' });
    assert.equal(result.rate, 275);
    assert.equal(result.range, '40-49');
});

test('минимальный выезд поднимает итог до тарифа марки М150', () => {
    const result = fixture({ fp_area: '1' });
    assert.equal(result.total, 75000);
});

test('наценка за этаж добавляется к базовой стоимости', () => {
    const result = fixture({ fp_floor: '10' });
    assert.equal(result.total, 102000);
});

test('процентная и фиксированная скидки применяются последовательно', () => {
    const result = fixture({ fp_discount: '10', fp_discount_fix: '5000' });
    assert.equal(result.total, 85000);
});
