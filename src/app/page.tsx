import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col min-h-screen bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            ICON Outdoor
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Quick tools for internal workflows. Pick an app to get started.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                CSV Sales Dashboard
              </CardTitle>
              <CardDescription>
                Enhance a sales export CSV into a structured Excel dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild className="w-full">
                <Link href="/csv-sales-dashboard">Open</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
