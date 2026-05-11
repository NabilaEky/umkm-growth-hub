-- Fix set_updated_at search_path
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- Revoke execute on internal/security definer fns from public roles
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
-- has_role is needed by RLS policies running as authenticated; keep authenticated
revoke execute on function public.has_role(uuid, app_role) from public, anon;

-- Tighten storage list: only authenticated can list, but public can still read individual files via public URL
drop policy if exists "public read product images" on storage.objects;
create policy "auth list product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images');