"""
Vercel Python serverless function — POST /api/bp_usp_process

Accepts multipart/form-data with a field named "file" containing an .xlsx file
(first sheet) with USP columns in the format `USP{n}_EN` / `USP{n}_DE` / `USP{n}_FR`
or `USP EN{n}` / `USP DE{n}` / `USP FR{n}`.

Returns a ZIP archive containing one semicolon-delimited CSV per bullet-point index:
  BP{n}.csv

All data lives only in memory for the duration of this request.
"""
from __future__ import annotations

import email
import email.policy
import io
import json
import re
import zipfile
from http.server import BaseHTTPRequestHandler

import pandas as pd

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
TERMINAL_PUNCT = {".", "!", "?"}
EMPTY_MARKER = "[EMPTY]"


# ---------------------------------------------------------------------------
# Text helpers (ported from BP_USP_TOOL/scripts/split_bulletpoints.py)
# ---------------------------------------------------------------------------

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
        # Old format: USP{n}_EN
        m_old = re.fullmatch(r"USP(\d+)_EN", col)
        if m_old:
            indices.append(int(m_old.group(1)))
            continue
        # New format: USP EN{n}
        m_new = re.fullmatch(r"USP EN(\d+)", col)
        if m_new:
            indices.append(int(m_new.group(1)))
    return sorted(indices)


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------

def process_xlsx_bytes(xlsx_bytes: bytes) -> bytes:
    """
    Read xlsx_bytes, split by BP index, and return a ZIP of CSV files.
    Raises ValueError with a human-readable message on bad input.
    """
    try:
        # Don't depend on a specific worksheet name — just use the first sheet.
        df = pd.read_excel(io.BytesIO(xlsx_bytes), dtype=str)
    except Exception as exc:
        raise ValueError(f"Could not read Excel file: {exc}") from exc

    df.replace({"nan": "", "None": ""}, inplace=True)

    # Normalize base columns across variants
    if "NAME" not in df.columns and "Item Name/Number" in df.columns:
        df.rename(columns={"Item Name/Number": "NAME"}, inplace=True)

    bp_indices = _detect_bp_indices(df.columns.tolist())
    if not bp_indices:
        raise ValueError(
            "No USP columns found in sheet 'Tabelle1'. "
            "Make sure the file follows the expected format."
        )

    required_base = {"Internal ID", "NAME"}
    missing_base = required_base - set(df.columns)
    if missing_base:
        raise ValueError(f"Missing required columns: {sorted(missing_base)}")

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for n in bp_indices:
            usp_name_col = f"USP Name {n}"
            # Old format: USP{n}_EN / USP{n}_DE / USP{n}_FR
            en_col = f"USP{n}_EN"
            de_col = f"USP{n}_DE"
            fr_col = f"USP{n}_FR"
            # New format: USP EN{n} / USP DE{n} / USP FR{n}
            en_col_alt = f"USP EN{n}"
            de_col_alt = f"USP DE{n}"
            fr_col_alt = f"USP FR{n}"

            en_in = en_col if en_col in df.columns else en_col_alt
            de_in = de_col if de_col in df.columns else de_col_alt
            fr_in = fr_col if fr_col in df.columns else fr_col_alt

            required_lang = [en_in, de_in, fr_in]
            missing_lang = [c for c in required_lang if c not in df.columns]
            if missing_lang:
                continue  # skip this BP silently — expected if sheet is partial

            out = pd.DataFrame()
            out["Internal ID"] = df["Internal ID"]
            out["NAME"] = df["NAME"]
            if usp_name_col in df.columns:
                out[usp_name_col] = df[usp_name_col]
            else:
                # Base format changed: generate stable USP Name values as "{NAME}-{n}"
                out[usp_name_col] = df["NAME"].astype(str).str.strip() + f"-{n}"

            for out_col, in_col in ((en_col, en_in), (de_col, de_in), (fr_col, fr_in)):
                out[out_col] = df[in_col].apply(_clean_text)

            has_any = ~(
                df[en_in].apply(_is_empty)
                & df[de_in].apply(_is_empty)
                & df[fr_in].apply(_is_empty)
            )
            out = out[has_any].reset_index(drop=True)

            csv_buf = io.StringIO()
            out.to_csv(csv_buf, sep=";", index=False, encoding="utf-8-sig")
            zf.writestr(f"BP{n}.csv", csv_buf.getvalue().encode("utf-8-sig"))

    return zip_buf.getvalue()


# ---------------------------------------------------------------------------
# Multipart parser (same approach as process.py)
# ---------------------------------------------------------------------------

def _parse_multipart(content_type: str, body: bytes) -> bytes | None:
    msg_bytes = f"Content-Type: {content_type}\r\n\r\n".encode() + body
    msg = email.message_from_bytes(msg_bytes, policy=email.policy.compat32)

    if not msg.is_multipart():
        return None

    for part in msg.get_payload():  # type: ignore[union-attr]
        disposition = part.get("Content-Disposition", "")
        if 'name="file"' in disposition or "name=file" in disposition:
            return part.get_payload(decode=True)  # type: ignore[return-value]

    return None


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))

            if content_length > MAX_UPLOAD_BYTES:
                self._json_error(413, "File too large (max 50 MB).")
                return

            if "multipart/form-data" not in content_type:
                self._json_error(400, "Expected multipart/form-data.")
                return

            body = self.rfile.read(content_length)

            xlsx_bytes = _parse_multipart(content_type, body)
            if xlsx_bytes is None:
                self._json_error(400, 'No field named "file" found in the upload.')
                return

            zip_bytes = process_xlsx_bytes(xlsx_bytes)

            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/zip")
            self.send_header(
                "Content-Disposition",
                'attachment; filename="BP_USPs.zip"',
            )
            self.send_header("Content-Length", str(len(zip_bytes)))
            self.end_headers()
            self.wfile.write(zip_bytes)

        except ValueError as exc:
            self._json_error(422, str(exc))
        except Exception as exc:  # noqa: BLE001
            self._json_error(500, f"Processing failed: {exc}")

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_error(self, status: int, message: str) -> None:
        body = json.dumps({"error": message}).encode()
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:  # noqa: ARG002
        pass
