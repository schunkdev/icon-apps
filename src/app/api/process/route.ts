import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PYTHON = process.env.PYTHON_BIN ?? "python3";
const SCRIPT = join(process.cwd(), "scripts", "cleanup_icon_csv.py");

const RUNNER = `
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(sys.argv[1]).parent))
from cleanup_icon_csv import process_csv_bytes
csv_path = sys.argv[2]
out_path = sys.argv[3]
data = pathlib.Path(csv_path).read_bytes()
result = process_csv_bytes(data)
pathlib.Path(out_path).write_bytes(result)
`;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: 'No field named "file" found in the upload.' },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const csvPath = join(tmpdir(), `icon-csv-${id}.csv`);
  const xlsxPath = join(tmpdir(), `icon-xlsx-${id}.xlsx`);

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(csvPath, bytes);

    const xlsxBytes = await new Promise<Buffer>((resolve, reject) => {
      execFile(
        PYTHON,
        ["-c", RUNNER, SCRIPT, csvPath, xlsxPath],
        { timeout: 60_000, maxBuffer: 50 * 1024 * 1024 },
        async (err, _stdout, stderr) => {
          if (err) {
            const msg = stderr.trim().split("\n").pop() ?? err.message;
            reject(new Error(msg));
            return;
          }
          try {
            const { readFile } = await import("node:fs/promises");
            resolve(await readFile(xlsxPath));
          } catch (e) {
            reject(e);
          }
        },
      );
    });

    return new NextResponse(xlsxBytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="ICON_CSV_Cleanup_Dashboard.xlsx"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Processing failed";
    const isValidation =
      message.includes("valid ICON") || message.includes("Missing column");
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 422 : 500 },
    );
  } finally {
    await unlink(csvPath).catch(() => {});
    await unlink(xlsxPath).catch(() => {});
  }
}
