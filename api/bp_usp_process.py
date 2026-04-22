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

import base64
import email
import email.policy
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

# Make the repo root importable regardless of the working directory.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from scripts.bp_usp_split import process_xlsx_bytes  # noqa: E402

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


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

            zip_bytes, report = process_xlsx_bytes(xlsx_bytes)

            body = json.dumps(
                {
                    "zip": base64.b64encode(zip_bytes).decode("ascii"),
                    "bp_stats": report["bp_stats"],
                    "missing": report["missing"],
                    "skipped_bps": report["skipped_bps"],
                }
            ).encode()

            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

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
