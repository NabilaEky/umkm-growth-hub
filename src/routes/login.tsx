import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as string) === "register" ? "register" : "login",
  }),
  component: LoginPage,
});

const emailSchema = z.string().trim().email("Email tidak valid").max(255);
const pwSchema = z.string().min(6, "Password minimal 6 karakter").max(72);
const nameSchema = z.string().trim().min(2, "Nama minimal 2 karakter").max(100);

function LoginPage() {
  const { session, loading } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" />;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const v = emailSchema.safeParse(email);
    const v2 = pwSchema.safeParse(password);
    if (!v.success) return toast.error(v.error.issues[0].message);
    if (!v2.success) return toast.error(v2.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Berhasil masuk");
    navigate({ to: "/dashboard" });
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "");
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const v0 = nameSchema.safeParse(full_name);
    const v1 = emailSchema.safeParse(email);
    const v2 = pwSchema.safeParse(password);
    if (!v0.success) return toast.error(v0.error.issues[0].message);
    if (!v1.success) return toast.error(v1.error.issues[0].message);
    if (!v2.success) return toast.error(v2.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Akun dibuat. Silakan masuk.");
    navigate({ to: "/login", search: { tab: "login" } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--gradient-soft)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto h-12 w-12 rounded-xl" style={{ background: "var(--gradient-primary)" }} />
          <h1 className="mt-4 text-2xl font-bold">UMKM Manager</h1>
          <p className="text-sm text-muted-foreground">Masuk ke dashboard manajemen Anda</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          <Tabs defaultValue={tab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Masuk</TabsTrigger>
              <TabsTrigger value="register">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="li-email">Email</Label>
                  <Input id="li-email" name="email" type="email" placeholder="anda@contoh.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="li-pw">Password</Label>
                  <Input id="li-pw" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Masuk
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="rg-name">Nama Lengkap</Label>
                  <Input id="rg-name" name="full_name" type="text" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rg-email">Email</Label>
                  <Input id="rg-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rg-pw">Password</Label>
                  <Input id="rg-pw" name="password" type="password" required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Daftar
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Akun baru akan terdaftar sebagai <strong>Kasir</strong>. Owner dapat mengubah peran dari pengaturan.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
