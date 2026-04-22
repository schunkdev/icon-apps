"""
Shared processing logic for the BP/USP tool.

Kept in scripts/ so it can be reused by both local scripts and Vercel functions
without relying on the current working directory.
"""

from __future__ import annotations

import io
import re
import zipfile

import pandas as pd

TERMINAL_PUNCT = {".", "!", "?"}
EMPTY_MARKER = "[EMPTY]"


def _clean_text(value) -> str:
    if not isinstance(value, str):
        if pd.isna(value):
            return EMPTY_MARKER
        value = str(value)
    text = value.replace("ß", "SS").replace("ẞ", "SS")
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return EMPTY_MARKER
    if text[-1] not in TERMINAL_PUNCT:
        text += "."
    return text


def _is_empty(value) -> bool:
    if isinstance(value, str):
        return value.strip() == ""
    return pd.isna(value)


def _detect_bp_indices(columns: list[str]) -> list[int]:
    indices = []
    for col in columns:
        m_old = re.fullmatch(r"USP(\d+)_EN", col)
        if m_old:
            indices.append(int(m_old.group(1)))
            continue
        m_new = re.fullmatch(r"USP EN(\d+)", col)
        if m_new:
            indices.append(int(m_new.group(1)))
    return sorted(indices)


def process_xlsx_bytes(xlsx_bytes: bytes) -> tuple[bytes, dict]:
    """
    Read xlsx_bytes, split by BP index, and return (zip_bytes, report).

    report = {
        "bp_stats":   [{"index": int, "rows": int}, ...],
        "missing":    [{"bp": int, "internal_id": str, "name": str,
                        "usp_name": str, "langs": [str, ...]}, ...],
        "skipped_bps": [int, ...],
    }

    Raises ValueError with a human-readable message on bad input.
    """
    try:
        df = pd.read_excel(io.BytesIO(xlsx_bytes), dtype=str)
    except Exception as exc:
        raise ValueError(f"Could not read Excel file: {exc}") from exc

    df.replace({"nan": "", "None": ""}, inplace=True)

    if "NAME" not in df.columns and "Item Name/Number" in df.columns:
        df.rename(columns={"Item Name/Number": "NAME"}, inplace=True)

    bp_indices = _detect_bp_indices(df.columns.tolist())
    if not bp_indices:
        raise ValueError(
            "No USP columns found. Make sure the file follows the expected format."
        )

    required_base = {"Internal ID", "NAME"}
    missing_base = required_base - set(df.columns)
    if missing_base:
        raise ValueError(f"Missing required columns: {sorted(missing_base)}")

    bp_stats: list[dict] = []
    missing_log: list[dict] = []
    skipped_bps: list[int] = []

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for n in bp_indices:
            usp_name_col = f"USP Name {n}"
            en_col = f"USP{n}_EN"
            de_col = f"USP{n}_DE"
            fr_col = f"USP{n}_FR"
            en_col_alt = f"USP EN{n}"
            de_col_alt = f"USP DE{n}"
            fr_col_alt = f"USP FR{n}"

            en_in = en_col if en_col in df.columns else en_col_alt
            de_in = de_col if de_col in df.columns else de_col_alt
            fr_in = fr_col if fr_col in df.columns else fr_col_alt

            required_lang = [en_in, de_in, fr_in]
            missing_lang = [c for c in required_lang if c not in df.columns]
            if missing_lang:
                skipped_bps.append(n)
                continue

            out = pd.DataFrame()
            out["Internal ID"] = df["Internal ID"]
            out["NAME"] = df["NAME"]
            if usp_name_col in df.columns:
                out[usp_name_col] = df[usp_name_col]
            else:
                out[usp_name_col] = df["NAME"].astype(str).str.strip() + f"-{n}"

            for out_col, in_col in ((en_col, en_in), (de_col, de_in), (fr_col, fr_in)):
                out[out_col] = df[in_col].apply(_clean_text)

            has_any = ~(
                df[en_in].apply(_is_empty)
                & df[de_in].apply(_is_empty)
                & df[fr_in].apply(_is_empty)
            )
            out = out[has_any].reset_index(drop=True)

            # Record rows with at least one missing translation
            for _, row in out.iterrows():
                langs = [
                    lang
                    for lang, col in (("EN", en_col), ("DE", de_col), ("FR", fr_col))
                    if row[col] == EMPTY_MARKER
                ]
                if langs:
                    missing_log.append(
                        {
                            "bp": n,
                            "internal_id": str(row["Internal ID"]),
                            "name": str(row["NAME"]),
                            "usp_name": str(row[usp_name_col]),
                            "langs": langs,
                        }
                    )

            csv_buf = io.StringIO()
            out.to_csv(csv_buf, sep=";", index=False, encoding="utf-8-sig")
            zf.writestr(f"BP{n}.csv", csv_buf.getvalue().encode("utf-8-sig"))
            bp_stats.append({"index": n, "rows": len(out)})

    report = {
        "bp_stats": bp_stats,
        "missing": missing_log,
        "skipped_bps": skipped_bps,
    }
    return zip_buf.getvalue(), report

