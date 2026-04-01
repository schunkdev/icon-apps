"use client";

import * as React from "react";
import { FileSpreadsheet, UploadCloud, X, CheckCircle2, AlertCircle } from "lucide-react";
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

export function CsvProcessor() {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<ProcessingState>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function resetAll() {
    setFile(null);
    setState("idle");
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function acceptFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".csv") && f.type !== "text/csv") {
      setErrorMessage("Only .csv files are accepted.");
      setState("error");
      return;
    }
    setErrorMessage("");
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
          // not JSON — use status text
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
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
      setState("error");
    }
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">ICON CSV Processor</h1>
        <p className="text-sm text-muted-foreground">
          Upload a raw export CSV and receive a cleaned Excel dashboard.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload CSV</CardTitle>
          <CardDescription>Drag &amp; drop or click to select a .csv file</CardDescription>
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
                : "border-border hover:border-primary/60 hover:bg-muted/40",
              (state === "processing") && "pointer-events-none opacity-60"
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
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Drop your CSV here</p>
                  <p className="text-xs text-muted-foreground">or click to browse — .csv only</p>
                </div>
              </>
            )}
          </div>

          {/* Status messages */}
          {state === "done" && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Download started — your Excel dashboard is ready.</span>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage || "Something went wrong."}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            className="flex-1"
            disabled={state !== "ready" && state !== "done" && state !== "error"}
            onClick={processFile}
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

      <p className="text-center text-xs text-muted-foreground">
        Your file is processed server-side and immediately discarded — nothing is stored.
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
