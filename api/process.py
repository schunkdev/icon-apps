"""
Vercel Python serverless function — POST /api/process

Accepts multipart/form-data with a field named "file" containing a CSV.
Returns the processed XLSX as an attachment download.
All data lives only in memory for the duration of this request.
"""
from __future__ import annotations

import email
import email.policy
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

# Make the scripts/ directory importable regardless of the working directory.
_HERE = os.path.dirname(os.path.abspath(__file__))
_SCRIPTS = os.path.join(os.path.dirname(_HERE), "scripts")
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)

from cleanup_icon_csv import process_csv_bytes  # noqa: E402

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB hard ceiling


def _parse_multipart(content_type: str, body: bytes) -> bytes | None:
    """
    Extract the first file field from a multipart/form-data body.
    Returns the raw bytes of the uploaded file, or None if not found.
    """
    msg_bytes = f"Content-Type: {content_type}\r\n\r\n".encode() + body
    msg = email.message_from_bytes(msg_bytes, policy=email.policy.compat32)

    if not msg.is_multipart():
        return None

    for part in msg.get_payload():  # type: ignore[union-attr]
        disposition = part.get("Content-Disposition", "")
        if 'name="file"' in disposition or "name=file" in disposition:
            return part.get_payload(decode=True)  # type: ignore[return-value]

    return None


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
                self._json_error(413, "File too large (max 20 MB).")
                return

            if "multipart/form-data" not in content_type:
                self._json_error(400, "Expected multipart/form-data.")
                return

            body = self.rfile.read(content_length)

            csv_bytes = _parse_multipart(content_type, body)
            if csv_bytes is None:
                self._json_error(400, 'No field named "file" found in the upload.')
                return

            xlsx_bytes = process_csv_bytes(csv_bytes)

            self.send_response(200)
            self._cors_headers()
            self.send_header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.send_header(
                "Content-Disposition",
                'attachment; filename="ICON_CSV_Cleanup_Dashboard.xlsx"',
            )
            self.send_header("Content-Length", str(len(xlsx_bytes)))
            self.end_headers()
            self.wfile.write(xlsx_bytes)

        except ValueError as exc:
            self._json_error(422, str(exc))
        except Exception as exc:  # noqa: BLE001
            self._json_error(500, f"Processing failed: {exc}")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

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
        pass  # silence default access log noise
