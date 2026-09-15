-- Dedicated shop codes, owner-linked shops and gated shop creation.
--
-- Problems fixed here:
--  1. The public shop was resolved as "the oldest organization in the table".
--     Every buyer therefore landed in one shop, and a shop whose owner account
--     was removed stayed reachable and orderable (ghost orders).
--  2. organizations.owner_id had no foreign key to auth.users, so deleting a
--     user left an orphan shop behind forever, with no way to notice it.
--  3. Anybody who could sign in could create a shop.
--
-- Approach:
--  * Every shop gets its own immutable, shareable shop code. Buyers reach a
--    shop through that code only (/guest?code=XXXXXX). No global listing.
--  * owner_id is now a real FK (ON DELETE SET NULL). An ownerless shop is
--    force-closed by trigger, hidden from public reads and refuses new orders,
--    while all historical orders stay intact for reporting.
--  * Creating a shop requires a valid activation code, checked server-side.

set search_path = public;

-- ------------------------------------------------------------ shop code ----

create or replace function public.gen_shop_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  loop
    v_code := public.gen_code(6);
    exit when not exists (select 1 from public.organizations where shop_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 50 then
      raise exception 'SHOP_CODE_UNAVAILABLE';
    end if;
  end loop;
  return v_code;
end;
$$;

alter table public.organizations add column if not exists shop_code text;

-- Backfill one code per existing shop (gen_shop_code sees rows already filled).
do $$
declare r record;
begin
  for r in select id from public.organizations where shop_code is null order by created_at loop
    update public.organizations set shop_code = public.gen_shop_code() where id = r.id;
  end loop;
end $$;

create unique index if not exists organizations_shop_code_key on public.organizations(shop_code);

alter table public.organizations alter column shop_code set default public.gen_shop_code();
alter table public.organizations alter column shop_code set not null;

-- --------------------------------------------------------- owner linkage ---

alter table public.organizations alter column owner_id drop not null;

-- Orphans from deleted accounts are detached (and auto-closed by the trigger).
update public.organizations o
set owner_id = null
where o.owner_id is not null
  and not exists (select 1 from auth.users u where u.id = o.owner_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_owner_id_fkey' and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- Membership rows of deleted accounts must go too, otherwise a dealer seat
-- stays "active" for a user that no longer exists.
delete from public.organization_members m
where not exists (select 1 from auth.users u where u.id = m.user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_members_user_id_fkey'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- The code is the shop's public identity: it must never be edited by hand,
-- and a shop with no owner account can never be open for orders again.
create or replace function public.organizations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.shop_code is distinct from old.shop_code then
      new.shop_code := old.shop_code;
    end if;
  end if;
  if new.shop_code is null then
    new.shop_code := public.gen_shop_code();
  end if;
  if new.owner_id is null then
    new.is_open := false;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_trg on public.organizations;
create trigger organizations_guard_trg
before insert or update on public.organizations
for each row execute function public.organizations_guard();

-- Close any shop that was detached above.
update public.organizations set is_open = false where owner_id is null and is_open;

-- A shop is live only when it still has an owner and is open for orders.
create or replace function public.shop_is_live(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = _org and o.owner_id is not null and o.is_open
  );
$$;

grant execute on function public.shop_is_live(uuid) to anon, authenticated;

-- No order may ever be created against a dead shop, whichever path writes it.
create or replace function public.orders_require_live_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid; v_open boolean;
begin
  select owner_id, is_open into v_owner, v_open
  from public.organizations where id = new.organization_id;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if v_owner is null then raise exception 'SHOP_UNAVAILABLE'; end if;
  if not v_open then raise exception 'SHOP_CLOSED'; end if;
  return new;
end;
$$;

drop trigger if exists orders_require_live_shop_trg on public.orders;
create trigger orders_require_live_shop_trg
before insert on public.orders
for each row execute function public.orders_require_live_shop();

-- ------------------------------------------------------------- policies ----

-- Public reads are limited to live shops. Members keep full read of their own
-- shop (including while closed) so the console never goes blank.
drop policy if exists "orgs public read" on public.organizations;
create policy "orgs public read" on public.organizations
  for select to anon, authenticated
  using (owner_id is not null and is_open);

drop policy if exists "orgs member read" on public.organizations;
create policy "orgs member read" on public.organizations
  for select to authenticated
  using (owner_id = auth.uid() or public.is_org_member(id));

drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products
  for select to anon, authenticated
  using (is_active and public.shop_is_live(organization_id));

drop policy if exists "options public read" on public.product_options;
create policy "options public read" on public.product_options
  for select to anon, authenticated
  using (
    public.shop_is_live(organization_id)
    and exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );

drop policy if exists "option values public read" on public.product_option_values;
create policy "option values public read" on public.product_option_values
  for select to anon, authenticated
  using (
    public.shop_is_live(organization_id)
    and exists (
      select 1 from public.product_options o
      join public.products p on p.id = o.product_id
      where o.id = option_id and p.is_active
    )
  );

drop policy if exists "qr public read" on public.payment_qr;
create policy "qr public read" on public.payment_qr
  for select to anon, authenticated
  using (
    (is_active and public.shop_is_live(organization_id))
    or public.has_org_role(organization_id, 'owner')
  );

-- ---------------------------------------------------- activation codes -----

create table if not exists public.shop_activation_codes (
  code text primary key,
  note text,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.shop_activation_codes enable row level security;

-- Deliberately no grants to anon/authenticated: the table is only ever read by
-- the SECURITY DEFINER functions below, so codes can never be enumerated.
revoke all on public.shop_activation_codes from anon, authenticated;
grant all on public.shop_activation_codes to service_role;

-- Starter code. Change or deactivate it from the SQL editor:
--   update public.shop_activation_codes set is_active = false where code = 'SCHOOL-2026';
--   insert into public.shop_activation_codes (code, max_uses, note)
--        values ('MY-OWN-CODE', 5, 'handed out in person');
insert into public.shop_activation_codes (code, note, max_uses)
values ('SCHOOL-2026', 'Starter activation code - replace before going live', 25)
on conflict (code) do nothing;

create or replace function public.normalize_activation_code(p_code text)
returns text
language sql
immutable
as $$ select upper(btrim(coalesce(p_code, ''))) $$;

create or replace function public.verify_shop_activation_code(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_code := public.normalize_activation_code(p_code);
  if length(v_code) < 4 then return false; end if;
  perform 1 from public.shop_activation_codes
  where code = v_code and is_active
    and (expires_at is null or expires_at > now())
    and used_count < max_uses;
  return found;
end;
$$;

revoke all on function public.verify_shop_activation_code(text) from public, anon;
grant execute on function public.verify_shop_activation_code(text) to authenticated;

-- Creating a shop is a single server-side transaction: validate the activation
-- code, create the shop, seat the owner, burn one use of the code.
create or replace function public.create_shop_with_code(p_name text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_code text;
  v_org_id uuid;
  v_shop_code text;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'INVALID_NAME';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.user_id = v_user and m.status = 'active'
  ) then
    raise exception 'ALREADY_HAS_SHOP';
  end if;

  v_code := public.normalize_activation_code(p_code);

  update public.shop_activation_codes
  set used_count = used_count + 1
  where code = v_code
    and is_active
    and (expires_at is null or expires_at > now())
    and used_count < max_uses;

  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;

  insert into public.organizations (name, owner_id)
  values (v_name, v_user)
  returning id, shop_code into v_org_id, v_shop_code;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, v_user, 'owner', 'active');

  return jsonb_build_object('organization_id', v_org_id, 'shop_code', v_shop_code);
end;
$$;

revoke all on function public.create_shop_with_code(text, text) from public, anon;
grant execute on function public.create_shop_with_code(text, text) to authenticated;

-- Shops are opened through the activation flow only: a plain INSERT would skip
-- the code check, so that path is closed.
drop policy if exists "orgs owner insert" on public.organizations;

-- ------------------------------------------------- public shop by code -----

create or replace function public.get_shop_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org record; v_code text;
begin
  v_code := public.normalize_activation_code(p_code);
  if length(v_code) < 4 then raise exception 'SHOP_NOT_FOUND'; end if;

  select * into v_org from public.organizations
  where shop_code = v_code and owner_id is not null;
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;

  return jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'shop_code', v_org.shop_code,
    'currency', v_org.currency,
    'is_open', v_org.is_open,
    'public_theme', v_org.public_theme,
    'button_color', v_org.button_color
  );
end;
$$;

grant execute on function public.get_shop_by_code(text) to anon, authenticated;

-- The order page needs the shop's colours so its buttons match the storefront.
create or replace function public.get_order_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_order record; v_org record; v_items jsonb;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_order from public.orders where access_token = p_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_org from public.organizations where id = v_order.organization_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name', product_name, 'variant_name', variant_name,
    'unit_price', unit_price, 'quantity', quantity, 'line_total', line_total)), '[]'::jsonb)
    into v_items from public.order_items where order_id = v_order.id;
  return jsonb_build_object(
    'organization_id', v_org.id,
    'organization_name', v_org.name, 'currency', v_org.currency,
    'shop_code', v_org.shop_code,
    'public_theme', v_org.public_theme,
    'button_color', v_org.button_color,
    'order_number', v_order.order_number, 'pickup_code', v_order.pickup_code,
    'buyer_name', v_order.buyer_name, 'buyer_class', v_order.buyer_class,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'total', v_order.total,
    'payment_method', v_order.payment_method, 'payment_status', v_order.payment_status,
    'status', v_order.status, 'created_at', v_order.created_at,
    'has_proof', v_order.payment_proof_path is not null,
    'items', v_items);
end; $$;

grant execute on function public.get_order_by_token(text) to anon, authenticated;
