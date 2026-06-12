import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idr, fmtDate } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart, FileDown } from "lucide-react";
import { format, startOfMonth, endOfDay, startOfDay, subDays } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const COLORS = ["hsl(221 83% 53%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)", "hsl(346 87% 60%)", "hsl(199 89% 48%)"];

function ReportsPage() {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const fromIso = startOfDay(new Date(from)).toISOString();
      const toIso = endOfDay(new Date(to)).toISOString();
      const { data: tx, error } = await supabase
        .from("transactions")
        .select("id, invoice_no, created_at, total_amount, total_cost, profit, paid_amount, change_amount, transaction_details(product_name, quantity, sell_price, cost_price, subtotal)")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return tx ?? [];
    },
  });

  const summary = useMemo(() => {
    const txs = data ?? [];
    const revenue = txs.reduce((s, t) => s + Number(t.total_amount), 0);
    const cost = txs.reduce((s, t) => s + Number(t.total_cost), 0);
    const profit = txs.reduce((s, t) => s + Number(t.profit), 0);
    const itemsSold = txs.reduce(
      (s, t) => s + (t.transaction_details ?? []).reduce((a: number, d: any) => a + d.quantity, 0),
      0,
    );
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, itemsSold, count: txs.length, margin };
  }, [data]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; profit: number; cost: number }>();
    (data ?? []).forEach((t) => {
      const key = format(new Date(t.created_at), "yyyy-MM-dd");
      const prev = map.get(key) ?? { date: key, revenue: 0, profit: 0, cost: 0 };
      prev.revenue += Number(t.total_amount);
      prev.profit += Number(t.profit);
      prev.cost += Number(t.total_cost);
      map.set(key, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      ...d,
      label: format(new Date(d.date), "dd MMM"),
    }));
  }, [data]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    (data ?? []).forEach((t) => {
      (t.transaction_details ?? []).forEach((d: any) => {
        const prev = map.get(d.product_name) ?? { name: d.product_name, qty: 0, revenue: 0, profit: 0 };
        prev.qty += d.quantity;
        prev.revenue += Number(d.subtotal);
        prev.profit += (Number(d.sell_price) - Number(d.cost_price)) * d.quantity;
        map.set(d.product_name, prev);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [data]);

  const quickRange = (days: number) => {
    setFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
    setTo(format(new Date(), "yyyy-MM-dd"));
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Laporan Penjualan UMKM", 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Periode: ${format(new Date(from), "dd MMM yyyy")} - ${format(new Date(to), "dd MMM yyyy")}`, 14, 25);
      doc.text(`Dicetak: ${fmtDate(new Date())}`, 14, 30);

      autoTable(doc, {
        startY: 36,
        head: [["Ringkasan", "Nilai"]],
        body: [
          ["Total Transaksi", String(summary.count)],
          ["Total Item Terjual", String(summary.itemsSold)],
          ["Total Pendapatan", idr(summary.revenue)],
          ["Total Modal (HPP)", idr(summary.cost)],
          ["Laba Bersih", idr(summary.profit)],
          ["Margin", `${summary.margin.toFixed(2)}%`],
        ],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
      });

      autoTable(doc, {
        head: [["Tanggal", "Pendapatan", "Modal", "Laba"]],
        body: daily.map((d) => [d.label, idr(d.revenue), idr(d.cost), idr(d.profit)]),
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
      });

      autoTable(doc, {
        head: [["Produk Terlaris", "Qty", "Pendapatan", "Laba"]],
        body: topProducts.map((p) => [p.name, String(p.qty), idr(p.revenue), idr(p.profit)]),
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
      });

      autoTable(doc, {
        head: [["Invoice", "Tanggal", "Total", "Laba"]],
        body: (data ?? []).map((t) => [
          t.invoice_no,
          format(new Date(t.created_at), "dd/MM/yy HH:mm"),
          idr(t.total_amount),
          idr(t.profit),
        ]),
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
      });

      doc.save(`laporan-${from}_${to}.pdf`);
      toast.success("PDF berhasil diunduh");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal export PDF");
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Invoice", "Tanggal", "Total", "Modal", "Laba", "Dibayar", "Kembali"],
      ...(data ?? []).map((t) => [
        t.invoice_no,
        format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
        t.total_amount,
        t.total_cost,
        t.profit,
        t.paid_amount,
        t.change_amount,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaksi-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Laporan & Analisis</h1>
          <p className="text-sm text-muted-foreground">Pantau penjualan, laba, dan performa produk.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button onClick={exportPDF}>
            <FileDown className="h-4 w-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Dari</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Sampai</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => quickRange(7)}>7 Hari</Button>
              <Button size="sm" variant="outline" onClick={() => quickRange(30)}>30 Hari</Button>
              <Button size="sm" variant="outline" onClick={() => quickRange(90)}>90 Hari</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pendapatan" value={idr(summary.revenue)} icon={<DollarSign className="h-4 w-4" />} tone="primary" />
        <StatCard title="Laba Bersih" value={idr(summary.profit)} icon={<TrendingUp className="h-4 w-4" />} tone={summary.profit >= 0 ? "success" : "danger"} sub={`${summary.margin.toFixed(1)}% margin`} />
        <StatCard title="Modal (HPP)" value={idr(summary.cost)} icon={<TrendingDown className="h-4 w-4" />} tone="warning" />
        <StatCard title="Transaksi" value={String(summary.count)} icon={<ShoppingCart className="h-4 w-4" />} tone="primary" sub={`${summary.itemsSold} item`} />
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Tren Harian</TabsTrigger>
          <TabsTrigger value="profit">Laba/Rugi</TabsTrigger>
          <TabsTrigger value="products">Produk Terlaris</TabsTrigger>
          <TabsTrigger value="list">Daftar Transaksi</TabsTrigger>
        </TabsList>

        <TabsContent value="trend">
          <Card>
            <CardHeader><CardTitle>Pendapatan vs Laba Harian</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[340px]">
                <ResponsiveContainer>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => idr(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Pendapatan" stroke="hsl(221 83% 53%)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="profit" name="Laba" stroke="hsl(142 71% 45%)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cost" name="Modal" stroke="hsl(38 92% 50%)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Analisis Laba vs Modal</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[340px]">
                  <ResponsiveContainer>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => idr(v)} />
                      <Legend />
                      <Bar dataKey="cost" name="Modal" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" name="Laba" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Komposisi</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[340px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Laba", value: Math.max(0, summary.profit) },
                          { name: "Modal", value: summary.cost },
                        ]}
                        dataKey="value"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        <Cell fill="hsl(142 71% 45%)" />
                        <Cell fill="hsl(38 92% 50%)" />
                      </Pie>
                      <Tooltip formatter={(v: number) => idr(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Margin keuntungan: <span className="font-semibold text-foreground">{summary.margin.toFixed(2)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader><CardTitle>10 Produk Terlaris</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[340px] mb-4">
                <ResponsiveContainer>
                  <BarChart data={topProducts} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="name" fontSize={11} width={120} />
                    <Tooltip />
                    <Bar dataKey="qty" name="Terjual" radius={[0, 4, 4, 0]}>
                      {topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Pendapatan</TableHead>
                      <TableHead className="text-right">Laba</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{p.qty}</TableCell>
                        <TableCell className="text-right">{idr(p.revenue)}</TableCell>
                        <TableCell className="text-right text-success font-medium">{idr(p.profit)}</TableCell>
                      </TableRow>
                    ))}
                    {!topProducts.length && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader><CardTitle>Daftar Transaksi ({(data ?? []).length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Modal</TableHead>
                      <TableHead className="text-right">Laba</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>}
                    {(data ?? []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.invoice_no}</TableCell>
                        <TableCell>{fmtDate(t.created_at)}</TableCell>
                        <TableCell className="text-right">{idr(t.total_amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{idr(t.total_cost)}</TableCell>
                        <TableCell className="text-right font-semibold text-success">{idr(t.profit)}</TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && !(data ?? []).length && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Tidak ada transaksi pada periode ini</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon, tone, sub }: { title: string; value: string; icon: React.ReactNode; tone: "primary" | "success" | "warning" | "danger"; sub?: string }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className="text-lg md:text-2xl font-bold mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${tones[tone]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
