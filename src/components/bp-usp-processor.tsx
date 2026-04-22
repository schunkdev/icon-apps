"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileArchive,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProcessingState = "idle" | "ready" | "processing" | "done" | "error";

interface ErrorEntry {
  timestamp: string;
  filename: string;
  message: string;
}

interface BpStat {
  index: number;
  rows: number;
}

interface MissingEntry {
  bp: number;
  internal_id: string;
  name: string;
  usp_name: string;
  langs: string[];
}

interface ProcessingReport {
  bp_stats: BpStat[];
  missing: MissingEntry[];
  skipped_bps: number[];
}

export function BpUspProcessor() {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<ProcessingState>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [isDragging, setIsDragging] = React.useState(false);
  const [errorLog, setErrorLog] = React.useState<ErrorEntry[]>([]);
  const [logExpanded, setLogExpanded] = React.useState(false);
  const [report, setReport] = React.useState<ProcessingReport | null>(null);
  const [missingExpanded, setMissingExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function resetAll() {
    setFile(null);
    setState("idle");
    setErrorMessage("");
    setReport(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function acceptFile(f: File) {
    setErrorMessage("");
    setReport(null);

    const isXlsx =
      f.name.toLowerCase().endsWith(".xlsx") ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (!isXlsx) {
      const msg = "Invalid file type — only .xlsx files are accepted.";
      setErrorMessage(msg);
      setErrorLog((prev) => [
        { timestamp: new Date().toISOString(), filename: f.name, message: msg },
        ...prev,
      ]);
      setState("error");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFile(f);
    setState("ready");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  async function processFile() {
    if (!file || state === "processing") return;
    setState("processing");
    setErrorMessage("");
    setReport(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/bp_usp_process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try {
          const json = await res.json();
          if (json?.error) msg = json.error;
        } catch {
          // response was not JSON
        }
        throw new Error(msg);
      }

      const data = await res.json();

      // Decode base64 zip and trigger download
      const zipBinary = atob(data.zip);
      const zipBytes = new Uint8Array(zipBinary.length);
      for (let i = 0; i < zipBinary.length; i++) {
        zipBytes[i] = zipBinary.charCodeAt(i);
      }
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "BP_USPs.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setReport({
        bp_stats: data.bp_stats ?? [],
        missing: data.missing ?? [],
        skipped_bps: data.skipped_bps ?? [],
      });
      setState("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setErrorLog((prev) => [
        {
          timestamp: new Date().toISOString(),
          filename: file?.name ?? "unknown",
          message: msg,
        },
        ...prev,
      ]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setState("error");
    }
  }

  const canProcess = state === "ready" || state === "done";

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Brand header */}
      <div className="text-center space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          ICON Outdoor
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          BP / USP Processor
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Upload the base data Excel file to split it into one CSV per
          bullet-point index — cleaned, translated, and ready for import.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload Excel File</CardTitle>
          <CardDescription>
            Drag &amp; drop or click to select a .xlsx file
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload Excel file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={cn(
              "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none",
              isDragging
                ? "border-primary bg-primary/5"
                : state === "error"
                  ? "border-destructive/50 bg-destructive/5 hover:border-destructive/70"
                  : "border-border hover:border-primary/60 hover:bg-muted/40",
              state === "processing" && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={onFileChange}
              aria-label="Excel file input"
            />

            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </>
            ) : state === "error" ? (
              <>
                <UploadCloud className="h-10 w-10 text-destructive/60" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-destructive">
                    Upload a new file to try again
                  </p>
                  <p className="text-xs text-muted-foreground">.xlsx only</p>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    Drop your Excel file here
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse — .xlsx only
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Error banner */}
          {state === "error" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-medium">Processing failed</p>
                <p className="text-xs opacity-90">
                  {errorMessage || "An unknown error occurred."}
                </p>
                <p className="text-xs opacity-70 mt-1">
                  Make sure the file is a valid ICON base data Excel file with
                  USP columns.
                </p>
              </div>
            </div>
          )}

          {/* Success banner */}
          {state === "done" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Download started — your CSV files are ready.</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            className="flex-1"
            disabled={!canProcess}
            onClick={processFile}
            aria-disabled={!canProcess}
          >
            {state === "processing" ? (
              <>
                <ProcessingSpinner />
                Processing…
              </>
            ) : (
              "Run Script"
            )}
          </Button>

          {file && state !== "processing" && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Remove file"
              onClick={resetAll}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Script output */}
      {report && <ScriptOutput report={report} missingExpanded={missingExpanded} setMissingExpanded={setMissingExpanded} />}

      {/* Error log */}
      {errorLog.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setLogExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
            aria-expanded={logExpanded}
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Error log
              <span className="rounded-full bg-destructive/15 text-destructive px-1.5 py-0.5 text-xs font-semibold leading-none">
                {errorLog.length}
              </span>
            </span>
            {logExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {logExpanded && (
            <div className="divide-y divide-border border-t border-border">
              {errorLog.map((entry, i) => (
                <div key={i} className="px-4 py-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <time dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </time>
                    <span className="mx-1">·</span>
                    <span className="font-mono truncate max-w-[180px]">
                      {entry.filename}
                    </span>
                  </div>
                  <p className="text-xs text-destructive">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Your file is processed server-side and immediately discarded — nothing
        is stored.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Script output panel
// ---------------------------------------------------------------------------

function ScriptOutput({
  report,
  missingExpanded,
  setMissingExpanded,
}: {
  report: ProcessingReport;
  missingExpanded: boolean;
  setMissingExpanded: (v: boolean) => void;
}) {
  const totalRows = report.bp_stats.reduce((s, b) => s + b.rows, 0);

  // Group missing entries by BP for display
  const missingByBp = React.useMemo(() => {
    const map = new Map<number, MissingEntry[]>();
    for (const entry of report.missing) {
      if (!map.has(entry.bp)) map.set(entry.bp, []);
      map.get(entry.bp)!.push(entry);
    }
    return map;
  }, [report.missing]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <FileArchive className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium">Script output</span>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 space-y-2 border-b border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
          Summary
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="BPs processed" value={report.bp_stats.length} />
          <Stat label="Total rows" value={totalRows} />
          <Stat label="Missing translations" value={report.missing.length} warning={report.missing.length > 0} />
        </div>
      </div>

      {/* Per-BP breakdown */}
      {report.bp_stats.length > 0 && (
        <div className="px-4 py-3 border-b border-border space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
            Files generated
          </p>
          <div className="space-y-1">
            {report.bp_stats.map((bp) => (
              <div
                key={bp.index}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  BP{bp.index}.csv
                </span>
                <span className="tabular-nums text-foreground">
                  {bp.rows} row{bp.rows !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skipped BPs */}
      {report.skipped_bps.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Skipped (missing columns):{" "}
            {report.skipped_bps.map((n) => `BP${n}`).join(", ")}
          </p>
        </div>
      )}

      {/* Missing translations */}
      {report.missing.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMissingExpanded(!missingExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
            aria-expanded={missingExpanded}
          >
            <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              Missing translations
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-xs font-semibold leading-none">
                {report.missing.length}
              </span>
            </span>
            {missingExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {missingExpanded && (
            <div className="border-t border-border divide-y divide-border max-h-72 overflow-y-auto">
              {Array.from(missingByBp.entries()).map(([bp, entries]) => (
                <div key={bp} className="px-4 py-2 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    BP{bp}
                  </p>
                  {entries.map((e, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-mono text-muted-foreground mr-1.5">
                          {e.internal_id}
                        </span>
                        <span className="truncate">{e.name}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {e.langs.map((lang) => (
                          <span
                            key={lang}
                            className="rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 text-[10px] font-semibold leading-none"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All good */}
      {report.missing.length === 0 && (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          No missing translations — all items are complete.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          warning && value > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function ProcessingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
