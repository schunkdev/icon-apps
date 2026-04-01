import { CsvProcessor } from "@/components/csv-processor";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-background px-4 py-16">
      <CsvProcessor />
    </main>
  );
}
