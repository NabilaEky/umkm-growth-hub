import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl md:text-3xl font-bold">Transaksi</h1>
      <p className="text-sm text-muted-foreground">Modul transaksi (POS) akan dibuat di tahap berikutnya.</p>
    </div>
  ),
});
