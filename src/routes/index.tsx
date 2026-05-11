import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ArrowRight, BarChart3, Boxes, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg" style={{ background: "var(--gradient-primary)" }} />
            <span className="font-bold text-lg">UMKM Manager</span>
          </div>
          <div className="flex gap-2">
            <Link to="/login"><Button variant="ghost">Masuk</Button></Link>
            <Link to="/login" search={{ tab: "register" }}><Button>Daftar</Button></Link>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 md:py-28 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="inline-block rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground">
            Sistem Manajemen UMKM Modern
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
            Kelola Usaha Anda Lebih Cerdas
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Manajemen produk, stok, supplier, transaksi penjualan, hingga analisis laba/rugi —
            semuanya dalam satu dashboard yang elegan dan responsif.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/login" search={{ tab: "register" }}>
              <Button size="lg" className="gap-2">Mulai Gratis <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Link to="/login"><Button size="lg" variant="outline">Masuk</Button></Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-24 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Boxes, title: "Manajemen Produk", desc: "CRUD produk, kategori, supplier dengan upload gambar." },
          { icon: Receipt, title: "Transaksi POS", desc: "Kasir cepat, auto kurang stok, cetak invoice." },
          { icon: BarChart3, title: "Laporan & Grafik", desc: "Pendapatan, laba/rugi, produk terlaris, export PDF." },
          { icon: ShieldCheck, title: "Multi Role", desc: "Akses Owner & Kasir dengan keamanan berlapis." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition">
            <div className="h-11 w-11 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <f.icon className="h-5 w-5 text-primary-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
