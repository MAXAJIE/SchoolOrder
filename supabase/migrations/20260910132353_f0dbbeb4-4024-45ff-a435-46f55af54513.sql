-- ===== enums =====
create type public.app_role as enum ('owner','dealer');
create type public.member_status as enum ('active','disabled');
create type public.order_status as enum ('pending','confirmed','completed','cancelled');
create type public.payment_method as enum ('cash','duitnow');
create type public.payment_status as enum ('pending_payment','proof_uploaded','paid','rejected');
create type public.promo_type as enum ('fixed_amount_off','percentage_off','second_item_percentage_off');
create type public.request_status as enum ('draft','submitted','quoted','approved','rejected','cancelled');
create type public.quote_status as enum ('pending_owner','countered','accepted','rejected','cancelled');
create type public.movement_reason as enum ('purchase','manual_adjustment','order_deduct','order_cancel','dealer_reservation','dealer_release','return');

-- ===== core tables =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  currency text not null default 'RM',
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null,
  status public.member_status not null default 'active',
  display_name text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Standard',
  price numeric(10,2) not null check (price >= 0),
  cost_price numeric(10,2) not null default 0 check (cost_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  delta integer not null,
  reason public.movement_reason not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  type public.promo_type not null,
  value numeric(10,2) not null check (value >= 0),
  minimum_order_amount numeric(10,2) not null default 0 check (minimum_order_amount >= 0),
  max_discount numeric(10,2),
  usage_limit integer,
  used_count integer not null default 0,
  product_id uuid references public.products(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.payment_qr (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  image_url text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null unique,
  pickup_code text not null,
  access_token text not null unique,
  buyer_name text not null,
  buyer_age integer,
  buyer_class text,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  cost_total numeric(10,2) not null default 0,
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  promo_code text,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending_payment',
  status public.order_status not null default 'pending',
  payment_proof_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) not null default 0,
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null
);

create table public.dealer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dealer_id uuid not null,
  status public.request_status not null default 'submitted',
  affects_inventory boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dealer_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dealer_requests(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.dealer_requests(id) on delete cascade,
  dealer_id uuid not null,
  version integer not null default 1,
  status public.quote_status not null default 'pending_owner',
  total numeric(10,2) not null default 0,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0)
);

create index on public.products (organization_id);
create index on public.product_variants (product_id);
create index on public.orders (organization_id, created_at desc);
create index on public.order_items (order_id);
create index on public.inventory_movements (organization_id, created_at desc);

-- ===== helper functions =====
create or replace function public.has_org_role(_org uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
      and m.role = _role and m.status = 'active'
  );
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger t_products_updated before update on public.products
  for each row execute function public.touch_updated_at();
create trigger t_orders_updated before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger t_requests_updated before update on public.dealer_requests
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== grants =====
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select on public.organizations to anon;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.product_variants to authenticated;
grant select on public.product_variants to anon;
grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.promo_codes to authenticated;
grant select, insert, update, delete on public.payment_qr to authenticated;
grant select on public.payment_qr to anon;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.dealer_requests to authenticated;
grant select, insert, update, delete on public.dealer_request_items to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant all on public.profiles, public.organizations, public.organization_members, public.products,
  public.product_variants, public.inventory_movements, public.promo_codes, public.payment_qr,
  public.orders, public.order_items, public.dealer_requests, public.dealer_request_items,
  public.quotes, public.quote_items to service_role;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.promo_codes enable row level security;
alter table public.payment_qr enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.dealer_requests enable row level security;
alter table public.dealer_request_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile write" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "orgs public read" on public.organizations for select to anon, authenticated using (true);
create policy "orgs owner insert" on public.organizations for insert to authenticated with check (owner_id = auth.uid());
create policy "orgs owner update" on public.organizations for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "orgs owner delete" on public.organizations for delete to authenticated using (owner_id = auth.uid());

create policy "members read own or owner" on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.has_org_role(organization_id,'owner'));
create policy "members owner manage" on public.organization_members for all to authenticated
  using (public.has_org_role(organization_id,'owner') or exists (select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()))
  with check (public.has_org_role(organization_id,'owner') or exists (select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()));

create policy "products public read active" on public.products for select to anon using (is_active);
create policy "products member read" on public.products for select to authenticated using (public.is_org_member(organization_id));
create policy "products owner manage" on public.products for all to authenticated
  using (public.has_org_role(organization_id,'owner')) with check (public.has_org_role(organization_id,'owner'));

create policy "variants public read active" on public.product_variants for select to anon using (is_active);
create policy "variants member read" on public.product_variants for select to authenticated using (public.is_org_member(organization_id));
create policy "variants owner manage" on public.product_variants for all to authenticated
  using (public.has_org_role(organization_id,'owner')) with check (public.has_org_role(organization_id,'owner'));

create policy "movements owner read" on public.inventory_movements for select to authenticated using (public.has_org_role(organization_id,'owner'));
create policy "movements owner insert" on public.inventory_movements for insert to authenticated with check (public.has_org_role(organization_id,'owner'));

create policy "promo owner manage" on public.promo_codes for all to authenticated
  using (public.has_org_role(organization_id,'owner')) with check (public.has_org_role(organization_id,'owner'));

create policy "qr public read" on public.payment_qr for select to anon, authenticated using (is_active or public.has_org_role(organization_id,'owner'));
create policy "qr owner manage" on public.payment_qr for all to authenticated
  using (public.has_org_role(organization_id,'owner')) with check (public.has_org_role(organization_id,'owner'));

create policy "orders owner read" on public.orders for select to authenticated using (public.has_org_role(organization_id,'owner'));
create policy "orders owner update" on public.orders for update to authenticated
  using (public.has_org_role(organization_id,'owner')) with check (public.has_org_role(organization_id,'owner'));

create policy "order items owner read" on public.order_items for select to authenticated using (public.has_org_role(organization_id,'owner'));

create policy "requests read" on public.dealer_requests for select to authenticated
  using (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'));
create policy "requests dealer insert" on public.dealer_requests for insert to authenticated
  with check (dealer_id = auth.uid() and public.has_org_role(organization_id,'dealer'));
create policy "requests update" on public.dealer_requests for update to authenticated
  using (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'))
  with check (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'));

create policy "request items read" on public.dealer_request_items for select to authenticated
  using (exists (select 1 from public.dealer_requests r where r.id = request_id
    and (r.dealer_id = auth.uid() or public.has_org_role(r.organization_id,'owner'))));
create policy "request items dealer write" on public.dealer_request_items for all to authenticated
  using (exists (select 1 from public.dealer_requests r where r.id = request_id and r.dealer_id = auth.uid()))
  with check (exists (select 1 from public.dealer_requests r where r.id = request_id and r.dealer_id = auth.uid()));

create policy "quotes read" on public.quotes for select to authenticated
  using (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'));
create policy "quotes insert" on public.quotes for insert to authenticated
  with check (created_by = auth.uid() and (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner')));
create policy "quotes update" on public.quotes for update to authenticated
  using (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'))
  with check (dealer_id = auth.uid() or public.has_org_role(organization_id,'owner'));

create policy "quote items read" on public.quote_items for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id
    and (q.dealer_id = auth.uid() or public.has_org_role(q.organization_id,'owner'))));
create policy "quote items write" on public.quote_items for all to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id
    and (q.dealer_id = auth.uid() or public.has_org_role(q.organization_id,'owner'))))
  with check (exists (select 1 from public.quotes q where q.id = quote_id
    and (q.dealer_id = auth.uid() or public.has_org_role(q.organization_id,'owner'))));