import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl md:text-3xl font-bold">Laporan</h1>
      <p className="text-sm text-muted-foreground">Modul laporan & export PDF akan dibuat di tahap berikutnya.</p>
    </div>
  ),
});
