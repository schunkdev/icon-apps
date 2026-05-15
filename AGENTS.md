<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# About This Project

**ICON Apps** is an internal tooling platform for ICON Outdoor — a collection of small web apps for day-to-day business workflows. It's deployed on Vercel and built with Next.js (App Router) + Python serverless functions.

## Apps

| Route | Name | Description |
|---|---|---|
| `/` | Home | Landing page listing all available apps |
| `/csv-sales-dashboard` | CSV Sales Dashboard | Upload a raw sales export CSV → get a cleaned Excel dashboard with revenue summaries, brand breakdowns, and customer analytics |
| `/bp-usp-tool` | BP / USP Processor | Upload a base data Excel file → splits it into one CSV per bullet-point index |

## Key Directories

- `src/app/` — Next.js App Router pages and layouts
- `src/components/` — React components (including `csv-processor.tsx`, `bp-usp-processor.tsx`)
- `src/components/ui/` — shadcn/ui primitives
- `api/` — Vercel Python serverless functions (production entry points)
- `scripts/` — Python processing logic (shared between Vercel functions and local dev proxy)

# Project Architecture

## Hybrid Next.js + Python Serverless

This project uses **Next.js (App Router)** for the frontend and **Python serverless functions** (in `api/`) for backend processing. On Vercel, the Python functions in `api/` are served natively. Locally, Next.js Route Handlers in `src/app/api/` proxy to the same Python scripts so `next dev` works without `vercel dev`.

- `api/process.py` — Vercel Python serverless function for CSV processing (production)
- `src/app/api/process/route.ts` — Next.js Route Handler that shells out to Python (local dev)
- `scripts/cleanup_icon_csv.py` — shared processing logic used by both entry points

## CSV Processing (ICON Outdoor Sales Exports)

The sales system exports CSV files in varying formats. When modifying `scripts/cleanup_icon_csv.py`, be aware:

- **Encoding varies**: exports can be UTF-8, Mac OS Roman, or Windows-1252. Always use `_decode_csv_bytes()` which tries multiple encodings and picks the first where expected headers match.
- **Delimiters vary**: some exports use `,`, others use `;`. Use `_detect_delimiter()` on the header row.
- **KDE customer header rows** may include summary numbers in the numeric columns — only check text columns (`c1, c2, c3`) to identify them, not numeric columns (`c4, c5`).
- **Header matching** uses NFC unicode normalization to handle encoding-related character differences.

## Package Manager

This repo uses **Yarn** (enforced by a preinstall check in `package.json`). Use `yarn` for all install/run commands.
