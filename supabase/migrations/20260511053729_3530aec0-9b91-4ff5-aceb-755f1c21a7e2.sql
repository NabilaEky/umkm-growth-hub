-- ============ ROLES & PROFILES ============
create type public.app_role as enum ('owner', 'kasir');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Auto-create profile + default kasir role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'kasir');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- profiles RLS
create policy "view own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "owners view all profiles" on public.profiles for select using (public.has_role(auth.uid(), 'owner'));

-- user_roles RLS
create policy "view own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "owners view all roles" on public.user_roles for select using (public.has_role(auth.uid(), 'owner'));
create policy "owners manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'owner')) with check (public.has_role(auth.uid(), 'owner'));

-- ============ CATEGORIES ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create trigger trg_categories_updated before update on public.categories for each row execute function public.set_updated_at();

create policy "auth view categories" on public.categories for select to authenticated using (true);
create policy "owners insert categories" on public.categories for insert to authenticated with check (public.has_role(auth.uid(), 'owner'));
create policy "owners update categories" on public.categories for update to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "owners delete categories" on public.categories for delete to authenticated using (public.has_role(auth.uid(), 'owner'));

-- ============ SUPPLIERS ============
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suppliers enable row level security;
create trigger trg_suppliers_updated before update on public.suppliers for each row execute function public.set_updated_at();

create policy "auth view suppliers" on public.suppliers for select to authenticated using (true);
create policy "owners insert suppliers" on public.suppliers for insert to authenticated with check (public.has_role(auth.uid(), 'owner'));
create policy "owners update suppliers" on public.suppliers for update to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "owners delete suppliers" on public.suppliers for delete to authenticated using (public.has_role(auth.uid(), 'owner'));

-- ============ PRODUCTS ============
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  description text,
  image_url text,
  cost_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  stock integer not null default 0,
  is_active boolean not null default true,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();
create index idx_products_category on public.products(category_id);
create index idx_products_supplier on public.products(supplier_id);

create policy "auth view products" on public.products for select to authenticated using (true);
create policy "owners insert products" on public.products for insert to authenticated with check (public.has_role(auth.uid(), 'owner'));
create policy "owners update products" on public.products for update to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "owners delete products" on public.products for delete to authenticated using (public.has_role(auth.uid(), 'owner'));

-- ============ TRANSACTIONS ============
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  cashier_id uuid not null references auth.users(id) on delete restrict,
  total_amount numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  profit numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  change_amount numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create index idx_transactions_created on public.transactions(created_at desc);

create policy "auth view transactions" on public.transactions for select to authenticated using (true);
create policy "auth insert transactions" on public.transactions for insert to authenticated with check (auth.uid() = cashier_id);
create policy "owners delete transactions" on public.transactions for delete to authenticated using (public.has_role(auth.uid(), 'owner'));

create table public.transaction_details (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  cost_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0
);
alter table public.transaction_details enable row level security;
create index idx_txdetails_tx on public.transaction_details(transaction_id);
create index idx_txdetails_product on public.transaction_details(product_id);

create policy "auth view txdetails" on public.transaction_details for select to authenticated using (true);
create policy "auth insert txdetails" on public.transaction_details for insert to authenticated
  with check (exists (select 1 from public.transactions t where t.id = transaction_id and t.cashier_id = auth.uid()));
create policy "owners delete txdetails" on public.transaction_details for delete to authenticated using (public.has_role(auth.uid(), 'owner'));

-- ============ STORAGE: product images ============
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "public read product images" on storage.objects for select using (bucket_id = 'product-images');
create policy "auth upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images');
create policy "owners update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'owner'));
create policy "owners delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'owner'));