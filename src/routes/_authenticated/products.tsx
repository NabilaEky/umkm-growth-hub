import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Pencil, Trash2, Search, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { idr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

const schema = z.object({
  name: z.string().trim().min(2).max(150),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  cost_price: z.coerce.number().min(0),
  sell_price: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
  category_id: z.string().uuid().optional().or(z.literal("")),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  is_active: z.boolean(),
});

type Product = {
  id: string; name: string; sku: string | null; description: string | null;
  image_url: string | null; cost_price: number; sell_price: number; stock: number;
  is_active: boolean; category_id: string | null; supplier_id: string | null;
  categories?: { name: string } | null; suppliers?: { name: string } | null;
};

const PAGE_SIZE = 10;

function ProductsPage() {
  const { role } = useAuth();
  const isOwner = role === "owner";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["categories-min"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });
  const { data: sups = [] } = useQuery({
    queryKey: ["suppliers-min"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [],
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), suppliers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const okSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase());
      const okCat = filterCat === "all" || p.category_id === filterCat;
      return okSearch && okCat;
    });
  }, [products, search, filterCat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => {
    setEditing(null); setPreview(null); setActive(true); setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p); setPreview(p.image_url); setActive(p.is_active); setOpen(true);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const parsed = schema.safeParse({
        name: fd.get("name"),
        sku: fd.get("sku"),
        description: fd.get("description"),
        cost_price: fd.get("cost_price"),
        sell_price: fd.get("sell_price"),
        stock: fd.get("stock"),
        category_id: fd.get("category_id") || "",
        supplier_id: fd.get("supplier_id") || "",
        is_active: active,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      let image_url = editing?.image_url ?? null;
      const file = fileRef.current?.files?.[0];
      if (file) image_url = await uploadImage(file);

      const payload: any = {
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        description: parsed.data.description || null,
        cost_price: parsed.data.cost_price,
        sell_price: parsed.data.sell_price,
        stock: parsed.data.stock,
        category_id: parsed.data.category_id || null,
        supplier_id: parsed.data.supplier_id || null,
        is_active: parsed.data.is_active,
        image_url,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produk disimpan");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setEditing(null); setPreview(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dihapus"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Produk</h1>
          <p className="text-sm text-muted-foreground">Kelola produk, harga, stok & gambar.</p>
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setPreview(null); } }}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Tambah Produk</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} Produk</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(e.currentTarget); }} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Produk *</Label>
                    <Input id="name" name="name" defaultValue={editing?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" name="sku" defaultValue={editing?.sku ?? ""} />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cost_price">Harga Beli *</Label>
                    <Input id="cost_price" name="cost_price" type="number" min="0" step="any" defaultValue={editing?.cost_price ?? 0} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sell_price">Harga Jual *</Label>
                    <Input id="sell_price" name="sell_price" type="number" min="0" step="any" defaultValue={editing?.sell_price ?? 0} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stock">Stok *</Label>
                    <Input id="stock" name="stock" type="number" min="0" step="1" defaultValue={editing?.stock ?? 0} required />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kategori</Label>
                    <Select name="category_id" defaultValue={editing?.category_id ?? ""}>
                      <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                      <SelectContent>
                        {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <Select name="supplier_id" defaultValue={editing?.supplier_id ?? ""}>
                      <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                      <SelectContent>
                        {sups.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Deskripsi</Label>
                  <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} rows={3} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image">Gambar</Label>
                  <Input id="image" type="file" accept="image/*" ref={fileRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPreview(f ? URL.createObjectURL(f) : editing?.image_url ?? null);
                    }} />
                  {preview && <img src={preview} alt="preview" className="mt-2 h-24 w-24 rounded-md object-cover border" />}
                </div>

                <div className="flex items-center gap-3">
                  <Switch id="is_active" checked={active} onCheckedChange={setActive} />
                  <Label htmlFor="is_active">Aktif</Label>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={save.isPending}>Simpan</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari nama atau SKU..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Harga Beli</th>
                <th className="px-4 py-3 text-right">Harga Jual</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">Status</th>
                {isOwner && <th className="px-4 py-3 w-32 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Memuat...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Tidak ada produk.</td></tr>
              ) : pageItems.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-md object-cover border" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.categories?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{idr(p.cost_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{idr(p.sell_price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={p.stock <= 5 ? "text-destructive font-semibold" : ""}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus produk?</AlertDialogTitle>
                              <AlertDialogDescription>Aksi ini tidak dapat dibatalkan.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(p.id)}>Hapus</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{filtered.length} produk</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
            <span className="text-xs">Hal {page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
