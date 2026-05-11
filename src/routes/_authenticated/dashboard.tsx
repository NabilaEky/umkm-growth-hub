import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, Boxes, Receipt, Truck, TrendingUp, Wallet,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { idr, fmtDate, fmtDateShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Stat({
  icon: Icon, label, value, accent,
}: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: accent ?? "var(--gradient-primary)" }}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const last30 = new Date(); last30.setDate(last30.getDate() - 29); last30.setHours(0, 0, 0, 0);

      const [products, stockSum, suppliers, txAll, txToday, txRecent, topProducts] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("products").select("stock"),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("transactions").select("*", { count: "exact", head: true }),
        supabase.from("transactions").select("total_amount, profit, created_at").gte("created_at", today.toISOString()),
        supabase.from("transactions").select("id, invoice_no, total_amount, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("transaction_details").select("product_name, quantity, subtotal").gte("transactions.created_at" as any, last30.toISOString()).limit(1000),
      ]);

      // sales last 30 days from transactions
      const { data: txRange } = await supabase
        .from("transactions")
        .select("created_at, total_amount, profit")
        .gte("created_at", last30.toISOString());

      const series: Record<string, { date: string; sales: number; profit: number }> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date(last30); d.setDate(last30.getDate() + i);
        const k = d.toISOString().slice(0, 10);
        series[k] = { date: k, sales: 0, profit: 0 };
      }
      (txRange ?? []).forEach((t) => {
        const k = t.created_at.slice(0, 10);
        if (series[k]) {
          series[k].sales += Number(t.total_amount);
          series[k].profit += Number(t.profit);
        }
      });

      // top products
      const map = new Map<string, { name: string; qty: number; revenue: number }>();
      (topProducts.data ?? []).forEach((d: any) => {
        const cur = map.get(d.product_name) ?? { name: d.product_name, qty: 0, revenue: 0 };
        cur.qty += d.quantity; cur.revenue += Number(d.subtotal);
        map.set(d.product_name, cur);
      });
      const top = [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

      const totalStock = (stockSum.data ?? []).reduce((s, p: any) => s + (p.stock ?? 0), 0);
      const todayRevenue = (txToday.data ?? []).reduce((s, t: any) => s + Number(t.total_amount), 0);
      const todayProfit = (txToday.data ?? []).reduce((s, t: any) => s + Number(t.profit), 0);

      return {
        productCount: products.count ?? 0,
        totalStock,
        supplierCount: suppliers.count ?? 0,
        txCount: txAll.count ?? 0,
        todayRevenue,
        todayProfit,
        chart: Object.values(series),
        recent: txRecent.data ?? [],
        top,
      };
    },
  });

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Memuat dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Ringkasan aktivitas usaha Anda hari ini.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Package} label="Total Produk" value={String(data.productCount)} />
        <Stat icon={Boxes} label="Total Stok" value={String(data.totalStock)} accent="linear-gradient(135deg, oklch(0.65 0.17 155), oklch(0.75 0.17 155))" />
        <Stat icon={Truck} label="Supplier" value={String(data.supplierCount)} accent="linear-gradient(135deg, oklch(0.78 0.16 75), oklch(0.85 0.14 75))" />
        <Stat icon={Receipt} label="Transaksi" value={String(data.txCount)} accent="linear-gradient(135deg, oklch(0.6 0.2 310), oklch(0.7 0.18 310))" />
        <Stat icon={Wallet} label="Pendapatan Hari Ini" value={idr(data.todayRevenue)} />
        <Stat icon={TrendingUp} label="Laba Hari Ini" value={idr(data.todayProfit)} accent="linear-gradient(135deg, oklch(0.65 0.17 155), oklch(0.75 0.17 155))" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Grafik Penjualan 30 Hari</h3>
          <p className="text-xs text-muted-foreground">Pendapatan & laba harian</p>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 260)" />
                <XAxis dataKey="date" tickFormatter={(v) => fmtDateShort(v)} fontSize={11} />
                <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} fontSize={11} />
                <Tooltip
                  formatter={(v: number) => idr(v)}
                  labelFormatter={(l) => fmtDateShort(l as string)}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2} dot={false} name="Penjualan" />
                <Line type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} dot={false} name="Laba" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Produk Terlaris</h3>
          <p className="text-xs text-muted-foreground">30 hari terakhir</p>
          <div className="h-72 mt-4">
            {data.top.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Belum ada data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="qty" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b">
          <h3 className="font-semibold">Transaksi Terbaru</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">Belum ada transaksi.</td></tr>
              ) : data.recent.map((t: any) => (
                <tr key={t.id} className="border-t">
                  <td className="px-5 py-3 font-medium">{t.invoice_no}</td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(t.created_at)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{idr(t.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
