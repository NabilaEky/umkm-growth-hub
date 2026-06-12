import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, X, Receipt as ReceiptIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { idr, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type Product = {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  categories?: { name: string } | null;
};

type CartItem = {
  product_id: string;
  name: string;
  sell_price: number;
  quantity: number;
  stock: number;
};

type Invoice = {
  id: string;
  invoice_no: string;
  total: number;
  change: number;
  paid: number;
  cashier: string;
  date: string;
  items: CartItem[];
  note?: string;
};

function TransactionsPage() {
  const { fullName } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paid, setPaid] = useState<string>("");
  const [note, setNote] = useState("");
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["pos-products", search],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku, sell_price, stock, image_url, is_active, categories(name)")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(60);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`name.ilike.${s},sku.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const addToCart = (p: Product) => {
    if (p.stock <= 0) {
      toast.error("Stok habis");
      return;
    }
    setCart((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) {
        if (found.quantity + 1 > p.stock) {
          toast.error("Melebihi stok tersedia");
          return prev;
        }
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { product_id: p.id, name: p.name, sell_price: Number(p.sell_price), quantity: 1, stock: p.stock },
      ];
    });
  };

  const setQty = (id: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product_id !== id) return i;
          const q = Math.max(0, Math.min(qty, i.stock));
          return { ...i, quantity: q };
        })
        .filter((i) => i.quantity > 0),
    );
  };

  const removeItem = (id: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== id));

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.sell_price * i.quantity, 0),
    [cart],
  );
  const paidNum = Number(paid || 0);
  const change = paidNum - total;

  const checkout = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Keranjang kosong");
      if (paidNum < total) throw new Error("Pembayaran kurang dari total");
      const { data, error } = await (supabase as any).rpc("create_pos_transaction", {
        _items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        _paid: paidNum,
        _note: note || null,
      });
      if (error) throw error;
      return data as { id: string; invoice_no: string; total: number; change: number };
    },
    onSuccess: (res) => {
      setInvoice({
        id: res.id,
        invoice_no: res.invoice_no,
        total: Number(res.total),
        change: Number(res.change),
        paid: paidNum,
        cashier: fullName ?? "Kasir",
        date: new Date().toISOString(),
        items: [...cart],
        note,
      });
      setCart([]);
      setPaid("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["pos-products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaksi berhasil");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan transaksi"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Transaksi (POS)</h1>
          <p className="text-sm text-muted-foreground">Pilih produk, tentukan jumlah, dan proses pembayaran.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Produk */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Katalog Produk</CardTitle>
            </div>
            <div className="relative mt-2">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari produk atau SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-12 text-center">Memuat...</div>
            ) : products.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">Tidak ada produk.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {products.map((p) => {
                  const out = p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      disabled={out}
                      onClick={() => addToCart(p)}
                      className="group text-left rounded-lg border bg-card p-2 hover:border-primary hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="aspect-square w-full rounded-md bg-muted mb-2 overflow-hidden flex items-center justify-center">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-xs font-medium line-clamp-2 min-h-[2.25rem]">{p.name}</div>
                      <div className="text-sm font-bold text-primary mt-1">{idr(p.sell_price)}</div>
                      <div className={`text-[10px] mt-0.5 ${out ? "text-destructive" : "text-muted-foreground"}`}>
                        Stok: {p.stock}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keranjang */}
        <Card className="lg:sticky lg:top-20 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Keranjang ({cart.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Belum ada produk dipilih.
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {cart.map((i) => (
                  <div key={i.product_id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground">{idr(i.sell_price)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product_id, i.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={i.quantity}
                        onChange={(e) => setQty(i.product_id, Number(e.target.value))}
                        className="h-7 w-12 text-center px-1"
                      />
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product_id, i.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(i.product_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Item</span>
                <span>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{idr(total)}</span>
              </div>
              <div>
                <Label className="text-xs">Bayar</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="mt-1 text-right font-semibold"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {[total, 50000, 100000, 200000].filter((v) => v > 0).map((v, idx) => (
                    <Button key={idx} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaid(String(v))}>
                      {idx === 0 ? "Pas" : idr(v)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kembali</span>
                <span className={change < 0 ? "text-destructive font-semibold" : "font-semibold"}>
                  {idr(Math.max(0, change))}
                </span>
              </div>
              <div>
                <Label className="text-xs">Catatan (opsional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || paidNum < total || checkout.isPending}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? "Memproses..." : "Bayar & Cetak"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice dialog */}
      <Dialog open={!!invoice} onOpenChange={(o) => !o && setInvoice(null)}>
        <DialogContent className="max-w-md print:max-w-none print:shadow-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 print:hidden">
              <ReceiptIcon className="h-5 w-5" /> Invoice
            </DialogTitle>
          </DialogHeader>
          {invoice && <InvoiceView inv={invoice} />}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setInvoice(null)}>
              <X className="h-4 w-4" /> Tutup
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; padding: 16px; }
        }
      `}</style>
    </div>
  );
}

function InvoiceView({ inv }: { inv: Invoice }) {
  return (
    <div className="print-area">
      <div className="text-center border-b pb-3 mb-3">
        <div className="text-lg font-bold">UMKM Manager</div>
        <div className="text-xs text-muted-foreground">Struk Pembayaran</div>
      </div>
      <div className="text-xs space-y-0.5 mb-3">
        <div className="flex justify-between"><span>No. Invoice</span><span className="font-mono">{inv.invoice_no}</span></div>
        <div className="flex justify-between"><span>Tanggal</span><span>{fmtDate(inv.date)}</span></div>
        <div className="flex justify-between"><span>Kasir</span><span>{inv.cashier}</span></div>
      </div>
      <div className="border-t border-dashed pt-2 space-y-1 text-xs">
        {inv.items.map((i) => (
          <div key={i.product_id}>
            <div className="font-medium">{i.name}</div>
            <div className="flex justify-between text-muted-foreground">
              <span>{i.quantity} x {idr(i.sell_price)}</span>
              <span>{idr(i.sell_price * i.quantity)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed mt-2 pt-2 text-xs space-y-1">
        <div className="flex justify-between font-bold text-sm">
          <span>Total</span><span>{idr(inv.total)}</span>
        </div>
        <div className="flex justify-between"><span>Bayar</span><span>{idr(inv.paid)}</span></div>
        <div className="flex justify-between"><span>Kembali</span><span>{idr(inv.change)}</span></div>
        {inv.note && <div className="pt-1 italic text-muted-foreground">Catatan: {inv.note}</div>}
      </div>
      <div className="text-center text-xs mt-4 pt-3 border-t">
        Terima kasih atas kunjungan Anda 🙏
      </div>
    </div>
  );
}
