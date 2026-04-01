"""
ICON CSV Cleanup — importable module.

Public API:
    process_csv_bytes(csv_bytes: bytes) -> bytes
        Accepts raw CSV file bytes, returns XLSX file bytes.

    All internal functions from the original script are preserved for
    direct use / testing.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Iterable, Iterator


HEADER_NEEDLES = ("Marke: Name", "Artikelbeschr.", "Menge Verkauft", "Gesamtsumme Erlös")

KDE_RE = re.compile(r"^KDE\d+\b")
SUBTOTAL_RE = re.compile(r"^Gesamtsumme\s*-")

EXCLUDE_KLASSE = {"- Kein Produktklasse -", "Keine Produktklasse"}
EXCLUDE_BRAND_FOR_DATA = {"Versandkostenartikel"}
EXCLUDE_BRAND_FOR_CHARTS = {"Versandkostenartikel", "- Unassigned -", "Sonstige Gebühr", "Sonstige Gebühren"}


@dataclass(frozen=True)
class Row:
    kunde: str
    brand: str
    klasse: str
    produkt: str
    artikelbeschr: str
    menge_verkauft: int
    gesamtsumme_erloes: float


def _find_header_idx(lines: list[str]) -> int:
    for i, line in enumerate(lines):
        if all(needle in line for needle in HEADER_NEEDLES):
            return i
    missing = [n for n in HEADER_NEEDLES if not any(n in ln for ln in lines)]
    raise ValueError(
        "This does not appear to be a valid ICON Outdoor sales export. "
        "The required data header row was not found. "
        f"Missing column(s): {', '.join(missing)}. "
        "Please export the file directly from the sales system and try again."
    )


def _parse_csv_line(line: str) -> list[str]:
    row = next(csv.reader([line], delimiter=",", quotechar='"', skipinitialspace=True))
    if len(row) == 1 and "," in row[0]:
        row = next(csv.reader([row[0]], delimiter=",", quotechar='"', skipinitialspace=True))
    if len(row) < 6:
        row = row + [""] * (6 - len(row))
    return [c.strip() for c in row[:6]]


def _to_int(x: str) -> int | None:
    x = x.strip()
    if not x:
        return None
    x = x.replace("\u2019", "").replace("'", "").replace(" ", "")
    try:
        return int(float(x))
    except Exception:
        return None


def _to_float(x: str) -> float | None:
    x = x.strip()
    if not x:
        return None
    x = x.replace("\u2019", "").replace("'", "").replace(" ", "")
    if x.count(",") == 1 and x.count(".") == 0:
        x = x.replace(",", ".")
    try:
        return float(x)
    except Exception:
        return None


def iter_clean_rows(lines: Iterable[str]) -> Iterator[Row]:
    current_kunde = ""
    current_brand = ""

    for line in lines:
        if not line.strip():
            continue

        c0, c1, c2, c3, c4, c5 = _parse_csv_line(line)

        if KDE_RE.search(c0) and not any([c1, c2, c3, c4, c5]):
            current_kunde = c0
            current_brand = ""
            continue

        if SUBTOTAL_RE.match(c0):
            continue

        if c0 and not any([c1, c2, c3, c4, c5]):
            if current_kunde:
                current_brand = c0
            continue

        produkt = c2
        if not produkt:
            continue

        kunde = current_kunde.strip()
        brand = (current_brand or "").strip()
        klasse = (c1 or "").strip()
        artikelbeschr = (c3 or "").strip()
        menge = _to_int(c4)
        erloes = _to_float(c5)

        if not kunde:
            continue
        if klasse in EXCLUDE_KLASSE:
            continue
        if brand in EXCLUDE_BRAND_FOR_DATA:
            continue
        if produkt.strip().lower() == "versandkostenartikel":
            continue
        if menge is None or erloes is None:
            continue

        yield Row(
            kunde=kunde,
            brand=brand,
            klasse=klasse,
            produkt=produkt.strip(),
            artikelbeschr=artikelbeschr,
            menge_verkauft=menge,
            gesamtsumme_erloes=erloes,
        )


def _topn(items: dict[str, float], n: int = 20) -> list[tuple[str, float]]:
    return sorted(items.items(), key=lambda kv: kv[1], reverse=True)[:n]


def write_xlsx_to_buffer(rows: list[Row]) -> bytes:
    """Generate the XLSX workbook and return its raw bytes (never touches disk)."""
    import xlsxwriter  # type: ignore

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})

    fmt_header = workbook.add_format({"bold": True, "bg_color": "#F2F2F2", "border": 1})
    fmt_money = workbook.add_format({"num_format": "#,##0.00"})
    fmt_note = workbook.add_format({"font_color": "#555555", "italic": True})

    ws_data = workbook.add_worksheet("DATA")
    ws_dash = workbook.add_worksheet("Dashboard")

    headers = [
        "Kunde",
        "Brand",
        "Klasse",
        "Produkt",
        "Artikelbeschr.",
        "Menge Verkauft",
        "Gesamtsumme Erlös",
    ]
    for col, h in enumerate(headers):
        ws_data.write(0, col, h, fmt_header)

    for i, r in enumerate(rows, start=1):
        ws_data.write(i, 0, r.kunde)
        ws_data.write(i, 1, r.brand)
        ws_data.write(i, 2, r.klasse)
        ws_data.write(i, 3, r.produkt)
        ws_data.write(i, 4, r.artikelbeschr)
        ws_data.write_number(i, 5, r.menge_verkauft)
        ws_data.write_number(i, 6, r.gesamtsumme_erloes, fmt_money)

    ws_data.freeze_panes(1, 0)
    ws_data.autofilter(0, 0, len(rows), len(headers) - 1)
    ws_data.set_column(0, 0, 28)
    ws_data.set_column(1, 1, 22)
    ws_data.set_column(2, 2, 26)
    ws_data.set_column(3, 3, 18)
    ws_data.set_column(4, 4, 60)
    ws_data.set_column(5, 5, 16)
    ws_data.set_column(6, 6, 18, fmt_money)

    # Summary data for dashboard
    by_kunde: dict[str, float] = {}
    by_brand: dict[str, float] = {}
    by_klasse: dict[str, float] = {}
    for r in rows:
        by_kunde[r.kunde] = by_kunde.get(r.kunde, 0.0) + r.gesamtsumme_erloes
        if r.brand not in EXCLUDE_BRAND_FOR_CHARTS:
            by_brand[r.brand] = by_brand.get(r.brand, 0.0) + r.gesamtsumme_erloes
        if r.klasse not in EXCLUDE_KLASSE:
            by_klasse[r.klasse] = by_klasse.get(r.klasse, 0.0) + r.gesamtsumme_erloes

    # Hidden list sheets for dropdown data validation
    kunden_list = sorted({r.kunde for r in rows})
    brands_list = sorted({r.brand for r in rows if r.brand and r.brand not in EXCLUDE_BRAND_FOR_CHARTS})
    klassen_list = sorted({r.klasse for r in rows if r.klasse and r.klasse not in EXCLUDE_KLASSE})
    produkte_list = sorted({r.produkt for r in rows if r.produkt})

    ws_lists = workbook.add_worksheet("_lists")
    ws_lists.hide()
    for i, v in enumerate(kunden_list):
        ws_lists.write(i, 0, v)
    for i, v in enumerate(brands_list):
        ws_lists.write(i, 1, v)
    for i, v in enumerate(klassen_list):
        ws_lists.write(i, 2, v)
    for i, v in enumerate(produkte_list):
        ws_lists.write(i, 3, v)

    workbook.define_name("KUNDEN", f"=_lists!$A$1:$A${len(kunden_list)}")
    workbook.define_name("BRANDS", f"=_lists!$B$1:$B${len(brands_list)}")
    workbook.define_name("KLASSEN", f"=_lists!$C$1:$C${len(klassen_list)}")
    workbook.define_name("PRODUKTE", f"=_lists!$D$1:$D${len(produkte_list)}")

    # Dashboard
    ws_dash.set_column(0, 0, 18)
    ws_dash.set_column(1, 1, 38)
    ws_dash.set_column(2, 2, 18)
    ws_dash.set_column(3, 6, 18)

    ws_dash.write("A1", "Revenue & Units Filter", workbook.add_format({"bold": True, "font_size": 14}))
    ws_dash.write("A3", "Kunde")
    ws_dash.write("A4", "Brand")
    ws_dash.write("A5", "Klasse")
    ws_dash.write("A6", "Product")
    ws_dash.write("A8", "Revenue (filtered)")
    ws_dash.write("A9", "Units (filtered)")
    ws_dash.write("A11", "Note", fmt_header)
    ws_dash.write("B11", "Dropdowns are optional. Blank = no filter.", fmt_note)

    ws_dash.data_validation("B3", {"validate": "list", "source": "=KUNDEN", "ignore_blank": True})
    ws_dash.data_validation("B4", {"validate": "list", "source": "=BRANDS", "ignore_blank": True})
    ws_dash.data_validation("B5", {"validate": "list", "source": "=KLASSEN", "ignore_blank": True})
    ws_dash.data_validation("B6", {"validate": "list", "source": "=PRODUKTE", "ignore_blank": True})

    last_row = len(rows) + 1
    kunde_rng = f"DATA!$A$2:$A${last_row}"
    brand_rng = f"DATA!$B$2:$B${last_row}"
    klasse_rng = f"DATA!$C$2:$C${last_row}"
    produkt_rng = f"DATA!$D$2:$D${last_row}"
    units_rng = f"DATA!$F$2:$F${last_row}"
    revenue_rng = f"DATA!$G$2:$G${last_row}"

    ws_dash.write("C3", "criteria", fmt_note)
    ws_dash.write_formula("D3", '=IF($B$3="","*",$B$3)')
    ws_dash.write_formula("D4", '=IF($B$4="","*",$B$4)')
    ws_dash.write_formula("D5", '=IF($B$5="","*",$B$5)')
    ws_dash.write_formula("D6", '=IF($B$6="","*",$B$6)')

    ws_dash.write_formula(
        "B8",
        f'=SUMIFS({revenue_rng},{kunde_rng},$D$3,{brand_rng},$D$4,{klasse_rng},$D$5,{produkt_rng},$D$6)',
        fmt_money,
    )
    ws_dash.write_formula(
        "B9",
        f'=SUMIFS({units_rng},{kunde_rng},$D$3,{brand_rng},$D$4,{klasse_rng},$D$5,{produkt_rng},$D$6)',
    )

    def write_summary(
        start_row: int,
        start_col: int,
        title: str,
        series_name: str,
        data: list[tuple[str, float]],
        chart_type: str,
    ) -> None:
        ws_dash.write(start_row, start_col, title, fmt_header)
        ws_dash.write(start_row + 1, start_col, series_name, fmt_header)
        ws_dash.write(start_row + 1, start_col + 1, "Revenue", fmt_header)
        for i, (k, v) in enumerate(data):
            ws_dash.write(start_row + 2 + i, start_col, k)
            ws_dash.write_number(start_row + 2 + i, start_col + 1, v, fmt_money)

        last = start_row + 2 + len(data) - 1
        chart = workbook.add_chart({"type": chart_type})
        chart.add_series(
            {
                "name": title,
                "categories": ["Dashboard", start_row + 2, start_col, last, start_col],
                "values": ["Dashboard", start_row + 2, start_col + 1, last, start_col + 1],
            }
        )
        chart.set_title({"name": title})
        chart.set_legend({"none": True})
        chart.set_y_axis({"num_format": "#,##0"})
        chart.set_style(10)
        ws_dash.insert_chart(start_row, start_col + 3, chart, {"x_scale": 1.35, "y_scale": 1.15})

    write_summary(13, 0, "Top revenue by customer (Top 20)", "Kunde", _topn(by_kunde, 20), "column")
    write_summary(13, 8, "Top revenue by brand (Top 20)", "Brand", _topn(by_brand, 20), "column")
    write_summary(37, 0, "Top revenue by klasse (Top 20)", "Klasse", _topn(by_klasse, 20), "column")

    workbook.close()
    return output.getvalue()


def process_csv_bytes(csv_bytes: bytes) -> bytes:
    """
    Main entry point: accept CSV bytes, return XLSX bytes.
    Raises ValueError with a descriptive message if the CSV is invalid.
    """
    if not csv_bytes or not csv_bytes.strip():
        raise ValueError("The uploaded file is empty. Please provide a valid ICON Outdoor sales export CSV.")

    text = csv_bytes.decode("utf-8", errors="replace")
    lines = text.splitlines()

    if len(lines) < 2:
        raise ValueError(
            "The uploaded file contains fewer than 2 lines and cannot be a valid sales export. "
            "Please check the file and try again."
        )

    header_idx = _find_header_idx(lines)
    data_lines = lines[header_idx + 1:]
    rows = list(iter_clean_rows(data_lines))

    if not rows:
        raise ValueError(
            "No valid sales data rows were found after processing. "
            "The file may be empty, contain only header/subtotal lines, or all rows were filtered out "
            "(e.g. missing Kunde, Menge, or Erlös values). "
            "Please verify you are uploading a complete ICON Outdoor sales export."
        )

    return write_xlsx_to_buffer(rows)
