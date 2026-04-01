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

export function CsvProcessor() {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<ProcessingState>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [isDragging, setIsDragging] = React.useState(false);
  const [errorLog, setErrorLog] = React.useState<ErrorEntry[]>([]);
  const [logExpanded, setLogExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function resetAll() {
    setFile(null);
    setState("idle");
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function acceptFile(f: File) {
    // Always reset previous error so a new upload re-enables the button
    setErrorMessage("");

    if (!f.name.toLowerCase().endsWith(".csv") && f.type !== "text/csv") {
      const msg = "Invalid file type — only .csv files are accepted.";
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

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try {
          const json = await res.json();
          if (json?.error) msg = json.error;
        } catch {
          // response was not JSON — fall back to status text
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ICON_CSV_Cleanup_Dashboard.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

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
      // Clear the file — user must upload a new one to re-enable the button
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
          Sales Data Processor
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Upload a raw sales export CSV to enhance and clean it into a
          structured Excel dashboard — including revenue summaries, brand
          breakdowns, and customer analytics.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload CSV</CardTitle>
          <CardDescription>
            Drag &amp; drop or click to select a .csv export file
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload CSV file"
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
              state === "processing" && "pointer-events-none opacity-60"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={onFileChange}
              aria-label="CSV file input"
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
                  <p className="text-xs text-muted-foreground">
                    .csv files only
                  </p>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Drop your CSV here</p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse — .csv only
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Error label */}
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
                  Please upload a valid ICON Outdoor sales export CSV to
                  continue.
                </p>
              </div>
            </div>
          )}

          {/* Success label */}
          {state === "done" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Download started — your Excel dashboard is ready.</span>
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
              "Process CSV"
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
