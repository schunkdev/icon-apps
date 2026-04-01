import type { Metadata } from "next";
import { CsvProcessor } from "@/components/csv-processor";

export const metadata: Metadata = {
  title: "CSV Sales Dashboard — ICON Apps",
  description:
    "Upload a raw sales export CSV to enhance and clean it into a structured Excel dashboard.",
};

export default function CsvSalesDashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-background px-4 py-16">
      <CsvProcessor />
    </main>
  );
}

