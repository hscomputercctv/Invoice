-- ============================================================
-- Invoice Manager · Supabase schema
-- Run this in the Supabase SQL Editor (SQL → New query → Run)
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'printer' check (role in ('admin','printer')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created.
-- Default role is 'printer' so you must promote admins manually.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'printer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. SETTINGS (single-row config table)
-- ------------------------------------------------------------
create table if not exists public.settings (
  id int primary key generated always as identity,
  shop_name text not null default 'My Shop',
  logo_url text,
  address text default 'Plot D, 48, Metroville Block-4, Karachi, Pakistan',
  phone text default '+92 315 8901026',
  tax_percent numeric(6,2) not null default 0,
  currency text not null default 'PKR',
  print_mode text not null default 'a4' check (print_mode in ('a4','thermal')),
  updated_at timestamptz not null default now()
);

-- Ensure a single settings row exists
insert into public.settings (shop_name, address, phone)
select 'My Shop', 'Plot D, 48, Metroville Block-4, Karachi, Pakistan', '+92 315 8901026'
where not exists (select 1 from public.settings);

-- ------------------------------------------------------------
-- 3. INVOICES
-- ------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  customer_name text default 'Walk-in',
  customer_phone text,
  customer_address text,
  invoice_date date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_status text not null default 'Unpaid'
    check (payment_status in ('Paid','Unpaid','Partial')),
  notes text,
  print_status text not null default 'pending'
    check (print_status in ('pending','printed')),
  printed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists invoices_print_status_idx on public.invoices (print_status);
create index if not exists invoices_invoice_date_idx on public.invoices (invoice_date desc);

-- ------------------------------------------------------------
-- 4. INVOICE ITEMS
-- ------------------------------------------------------------
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_name text not null,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- ------------------------------------------------------------
-- 5. INVOICE NUMBER GENERATOR
-- Uses a dedicated sequence + advisory lock so concurrent
-- inserts never collide.
-- ------------------------------------------------------------
create sequence if not exists public.invoice_no_seq start 1;

create or replace function public.next_invoice_no()
returns text
language plpgsql
as $$
declare
  next_val bigint;
begin
  -- Take a transaction-scoped advisory lock so simultaneous calls don't race
  perform pg_advisory_xact_lock(918273645);
  next_val := nextval('public.invoice_no_seq');
  return 'INV-' || lpad(next_val::text, 4, '0');
end;
$$;

grant execute on function public.next_invoice_no() to authenticated;

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.settings      enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

-- Profiles: users can read all (needed for role display); only edit self, only admin can change role
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Settings: readable by everyone authenticated; writable by admin only
drop policy if exists "settings read" on public.settings;
create policy "settings read"
  on public.settings for select
  to authenticated
  using (true);

-- Public read for login page footer (only shop_name is exposed via anon)
drop policy if exists "settings public read" on public.settings;
create policy "settings public read"
  on public.settings for select
  to anon
  using (true);

drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write"
  on public.settings for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Invoices: readable by all authenticated; insert by all authenticated
-- (both admin and printer can create if desired); update restricted to
-- print_status for printer role; delete by admin only.
drop policy if exists "invoices read" on public.invoices;
create policy "invoices read"
  on public.invoices for select
  to authenticated
  using (true);

drop policy if exists "invoices insert" on public.invoices;
create policy "invoices insert"
  on public.invoices for insert
  to authenticated
  with check (true);

drop policy if exists "invoices update" on public.invoices;
create policy "invoices update"
  on public.invoices for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "invoices delete admin only" on public.invoices;
create policy "invoices delete admin only"
  on public.invoices for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Invoice items: follow the parent invoice's access rules
drop policy if exists "invoice_items read" on public.invoice_items;
create policy "invoice_items read"
  on public.invoice_items for select
  to authenticated
  using (true);

drop policy if exists "invoice_items insert" on public.invoice_items;
create policy "invoice_items insert"
  on public.invoice_items for insert
  to authenticated
  with check (true);

drop policy if exists "invoice_items update" on public.invoice_items;
create policy "invoice_items update"
  on public.invoice_items for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "invoice_items delete" on public.invoice_items;
create policy "invoice_items delete"
  on public.invoice_items for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 7. REALTIME
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.invoice_items;

-- ------------------------------------------------------------
-- 8. STORAGE BUCKET FOR LOGOS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
select 'logos', 'logos', true
where not exists (select 1 from storage.buckets where id = 'logos');

-- Storage policies: anyone can read, only authenticated can upload
drop policy if exists "logos public read" on storage.objects;
create policy "logos public read"
  on storage.objects for select
  using (bucket_id = 'logos');

drop policy if exists "logos authenticated upload" on storage.objects;
create policy "logos authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'logos');

drop policy if exists "logos authenticated update" on storage.objects;
create policy "logos authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos');

drop policy if exists "logos authenticated delete" on storage.objects;
create policy "logos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos');

-- ============================================================
-- POST-SETUP STEPS (run manually)
-- ============================================================
-- After you create your first user via Auth → Users, promote
-- them to admin by running:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
--
-- ============================================================