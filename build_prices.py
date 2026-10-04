import csv
import json
import os
import re
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FOLDER = os.path.join(BASE_DIR, "All_Price_All_Marki")
OUT = os.path.join(BASE_DIR, "fixed", "prices_data.js")

# Колонки с ценой за 1 м² в строках толщины (после split(';'))
PRICE_COLS = [1, 2, 4, 5, 6, 8, 10, 11]


def parse_base(path):
    """Извлекает базовую таблицу: толщина(см) -> [цена за м² по 8 диапазонам площади]."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    base = {}
    for r in rows:
        if not r:
            continue
        cell0 = r[0] if r[0] else ""
        m = re.match(r"\s*(\d+)\s*см", cell0, re.I)
        if not m:
            continue
        t = m.group(1)
        prices = []
        ok = True
        for ci in PRICE_COLS:
            v = r[ci].strip() if ci < len(r) else ""
            if not v:
                ok = False
                break
            prices.append(int(v))
        if ok:
            base[t] = prices
    return base


def meta_from_name(name):
    nm = re.sub(r"\.csv$", "", name, flags=re.I)
    # марка: М150 / М200 ...
    gm = re.search(r"м\s*(\d+)", nm, re.I)
    grade = ("М" + gm.group(1)) if gm else "М150"
    # номер прайса: «прайс 33» или ведущие цифры перед разделителем
    pm = re.search(r"прайс\s*(\d+)", nm, re.I)
    if not pm:
        pm = re.search(r"^(\d+)", nm)
    prais = ("прайс " + pm.group(1)) if pm else "прайс"
    # дата: 12.08.26 или 12.08.2026
    dm = re.search(r"(\d{2})\.(\d{2})\.(\d{2,4})", nm)
    if dm:
        y = dm.group(3)
        if len(y) == 2:
            y = "20" + y
        date = dm.group(1) + "." + dm.group(2) + "." + y
    else:
        date = ""
    return prais, grade, date


def main():
    files = sorted(glob.glob(os.path.join(FOLDER, "*.csv")))
    prices = []
    for path in files:
        fn = os.path.basename(path)
        base = parse_base(path)
        if not base:
            print("Пропущен (нет таблицы):", fn)
            continue
        prais, grade, date = meta_from_name(fn)
        pid = re.sub(r"[^a-z0-9]+", "_", (prais + "_" + grade + "_" + date).lower())
        prices.append({
            "id": pid,
            "prais": prais,
            "grade": grade,
            "date": date,
            "base": base,
        })

    if not prices:
        print("CSV-файлы не найдены в", FOLDER)
        return

    # Дефолт: М150 (первая попавшаяся), иначе первая
    default_id = None
    for p in prices:
        if p["grade"].upper() == "М150":
            default_id = p["id"]
            break
    if default_id is None:
        default_id = prices[0]["id"]

    data = {"default": default_id, "prices": prices}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.GALILEO_PRICES = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")

    print("Сгенерировано прайсов:", len(prices), "| дефолт:", default_id)
    for p in prices:
        print("  -", p["prais"], p["grade"], p["date"], "(толщин:", len(p["base"]), ")")


if __name__ == "__main__":
    main()
