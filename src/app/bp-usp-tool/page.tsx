import type { Metadata } from "next";
import { BpUspProcessor } from "@/components/bp-usp-processor";

export const metadata: Metadata = {
  title: "BP / USP Processor — ICON Apps",
  description:
    "Upload the base data Excel file to split it into one CSV per bullet-point index.",
};

export default function BpUspToolPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-background px-4 py-16">
      <BpUspProcessor />
    </main>
  );
}
