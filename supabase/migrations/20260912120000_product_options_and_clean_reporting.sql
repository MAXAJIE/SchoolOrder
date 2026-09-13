-- Customisation rework + cancelled-order hygiene.
--
-- 1. A product now carries its own base price/cost. Differences (size, ice,
--    add-ons) are option groups with price deltas, the shape WarungSaaS uses.
--    `product_variants` stays only so historical order_items keep their
--    foreign key; nothing writes to it any more.
-- 2. order_items remembers the product it came from and the exact choices made,
--    so reporting no longer has to join through a variant row.
-- 3. Cancelled orders must never contribute to any figure. Reporting reads go
--    through `order_items_reportable`, which excludes them at the source.

-- ------------------------------------------------------------- products ----

alter table public.products
  add column if not exists base_price numeric(10,2) not null default 0;
alter table public.products
  add column if not exists cost_price numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_base_price_nonnegative' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_base_price_nonnegative check (base_price >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_cost_price_nonnegative' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_cost_price_nonnegative check (cost_price >= 0);
  end if;
end $$;

-- Cheapest active variant becomes the base price; the rest become option deltas.
update public.products p
set base_price = v.price, cost_price = v.cost_price
from (
  select distinct on (product_id) product_id, price, cost_price
  from public.product_variants
  where is_active
  order by product_id, price asc, sort_order asc, created_at asc
) v
where v.product_id = p.id and p.base_price = 0;

-- ------------------------------------------------------- option groups -----

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  max_select integer not null default 1 check (max_select >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  option_id uuid not null references public.product_options(id) on delete cascade,
  label text not null,
  price_delta numeric(10,2) not null default 0,
  cost_delta numeric(10,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_options_product_idx on public.product_options(product_id);
create index if not exists product_option_values_option_idx on public.product_option_values(option_id);

grant select on public.product_options to anon;
grant select, insert, update, delete on public.product_options to authenticated;
grant all on public.product_options to service_role;
grant select on public.product_option_values to anon;
grant select, insert, update, delete on public.product_option_values to authenticated;
grant all on public.product_option_values to service_role;

alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;

drop policy if exists "options public read" on public.product_options;
create policy "options public read" on public.product_options for select to anon
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));

drop policy if exists "options member read" on public.product_options;
create policy "options member read" on public.product_options for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "options owner manage" on public.product_options;
create policy "options owner manage" on public.product_options for all to authenticated
  using (public.has_org_role(organization_id, 'owner'))
  with check (public.has_org_role(organization_id, 'owner'));

drop policy if exists "option values public read" on public.product_option_values;
create policy "option values public read" on public.product_option_values for select to anon
  using (exists (
    select 1 from public.product_options o
    join public.products p on p.id = o.product_id
    where o.id = option_id and p.is_active
  ));

drop policy if exists "option values member read" on public.product_option_values;
create policy "option values member read" on public.product_option_values for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "option values owner manage" on public.product_option_values;
create policy "option values owner manage" on public.product_option_values for all to authenticated
  using (public.has_org_role(organization_id, 'owner'))
  with check (public.has_org_role(organization_id, 'owner'));

-- Existing multi-variant products keep working: the variants become one
-- required single-select group priced relative to the new base price.
do $$
declare r record;
declare v_option uuid;
begin
  for r in
    select p.id, p.organization_id, p.base_price, p.cost_price
    from public.products p
    where (select count(*) from public.product_variants pv where pv.product_id = p.id and pv.is_active) > 1
      and not exists (select 1 from public.product_options o where o.product_id = p.id)
  loop
    insert into public.product_options (organization_id, product_id, name, is_required, max_select, sort_order)
    values (r.organization_id, r.id, 'Options', true, 1, 0)
    returning id into v_option;

    insert into public.product_option_values (organization_id, option_id, label, price_delta, cost_delta, sort_order)
    select r.organization_id, v_option, pv.name,
           round(pv.price - r.base_price, 2), round(pv.cost_price - r.cost_price, 2), pv.sort_order
    from public.product_variants pv
    where pv.product_id = r.id and pv.is_active;
  end loop;
end $$;

-- ---------------------------------------------------------- order items ----

alter table public.order_items
  add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.order_items
  add column if not exists options jsonb not null default '[]'::jsonb;

update public.order_items oi
set product_id = pv.product_id
from public.product_variants pv
where oi.variant_id = pv.id and oi.product_id is null;

create index if not exists order_items_product_idx on public.order_items(product_id);

-- Single source of truth for every report: cancelled orders are simply absent.
drop view if exists public.order_items_reportable;
create view public.order_items_reportable
with (security_invoker = true) as
select
  oi.id,
  oi.order_id,
  oi.organization_id,
  oi.product_id,
  oi.product_name,
  oi.variant_name,
  oi.quantity,
  oi.unit_price,
  oi.unit_cost,
  oi.line_total,
  o.status,
  o.payment_status,
  o.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status <> 'cancelled';

grant select on public.order_items_reportable to authenticated;
grant select on public.order_items_reportable to service_role;

-- -------------------------------------------------------------- ordering ---

create or replace function public.create_public_order(
  p_org uuid,
  p_buyer_name text,
  p_buyer_age integer,
  p_buyer_class text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product record;
  v_group record;
  v_qty int;
  v_ids uuid[];
  v_price numeric(10,2);
  v_cost numeric(10,2);
  v_labels text;
  v_choices jsonb;
  v_subtotal numeric(10,2) := 0;
  v_cost_total numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_promo record;
  v_order_id uuid;
  v_number text;
  v_pickup text;
  v_token text;
  v_open boolean;
  v_count int := 0;
  v_class text;
  v_selected int;
begin
  if p_buyer_name is null or length(btrim(p_buyer_name)) < 2
     or length(btrim(p_buyer_name)) > 80 then
    raise exception 'INVALID_NAME';
  end if;
  if p_buyer_age is not null and (p_buyer_age < 5 or p_buyer_age > 100) then
    raise exception 'INVALID_AGE';
  end if;
  v_class := nullif(btrim(coalesce(p_buyer_class,'')),'');
  if v_class is not null and length(v_class) > 20 then
    raise exception 'INVALID_CLASS';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  select is_open into v_open from public.organizations where id = p_org;
  if v_open is null then raise exception 'ORG_NOT_FOUND'; end if;
  if not v_open then raise exception 'SHOP_CLOSED'; end if;

  v_order_id := gen_random_uuid();
  v_pickup := public.gen_code(6);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_number := 'ORD-' || to_char(now() at time zone 'utc', 'YYMMDD') || '-' || public.gen_code(5);

  insert into public.orders (id, organization_id, order_number, pickup_code, access_token,
    buyer_name, buyer_age, buyer_class, payment_method, payment_status, status, promo_code)
  values (v_order_id, p_org, v_number, v_pickup, v_token,
    btrim(p_buyer_name), p_buyer_age, v_class, p_payment_method,
    'pending_payment', 'pending', nullif(btrim(coalesce(p_promo_code,'')),''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 500 then raise exception 'INVALID_QUANTITY'; end if;
    v_count := v_count + v_qty;

    select p.id, p.name, p.is_active, p.stock, p.base_price, p.cost_price
      into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.organization_id = p_org
    for update;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_product.is_active then raise exception 'PRODUCT_INACTIVE'; end if;
    if v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.name;
    end if;

    -- Chosen option values, de-duplicated and always scoped to this product.
    select coalesce(array_agg(distinct e.value_id::uuid), '{}'::uuid[])
      into v_ids
    from jsonb_array_elements_text(coalesce(v_item->'option_value_ids', '[]'::jsonb)) as e(value_id);

    if array_length(v_ids, 1) is not null then
      if exists (
        select 1 from unnest(v_ids) as sel(id)
        where not exists (
          select 1 from public.product_option_values ov
          join public.product_options o on o.id = ov.option_id
          where ov.id = sel.id and o.product_id = v_product.id and o.organization_id = p_org
        )
      ) then
        raise exception 'OPTION_INVALID';
      end if;
    end if;

    -- Every group of this product must respect required / max_select.
    for v_group in
      select o.id, o.is_required, o.max_select
      from public.product_options o
      where o.product_id = v_product.id
      order by o.sort_order, o.created_at
    loop
      select count(*) into v_selected
      from public.product_option_values ov
      where ov.option_id = v_group.id and ov.id = any(v_ids);

      if v_group.is_required and v_selected = 0 then raise exception 'OPTION_REQUIRED'; end if;
      if v_selected > v_group.max_select then raise exception 'OPTION_TOO_MANY'; end if;
    end loop;

    select coalesce(sum(ov.price_delta), 0), coalesce(sum(ov.cost_delta), 0),
           nullif(string_agg(ov.label, ', ' order by o.sort_order, ov.sort_order), ''),
           coalesce(jsonb_agg(jsonb_build_object(
             'group', o.name, 'label', ov.label, 'price_delta', ov.price_delta
           ) order by o.sort_order, ov.sort_order), '[]'::jsonb)
      into v_price, v_cost, v_labels, v_choices
    from public.product_option_values ov
    join public.product_options o on o.id = ov.option_id
    where ov.id = any(v_ids);

    v_price := round(v_product.base_price + coalesce(v_price, 0), 2);
    v_cost := round(v_product.cost_price + coalesce(v_cost, 0), 2);
    if v_price < 0 then raise exception 'OPTION_INVALID'; end if;

    update public.products set stock = stock - v_qty where id = v_product.id;

    insert into public.inventory_movements (organization_id, product_id, variant_id, delta, reason, note)
    values (p_org, v_product.id, null, -v_qty, 'order_deduct', v_number);

    insert into public.order_items (order_id, organization_id, product_id, variant_id,
      product_name, variant_name, unit_price, unit_cost, quantity, line_total, options)
    values (v_order_id, p_org, v_product.id, null,
      v_product.name, coalesce(v_labels, 'Standard'), v_price, v_cost, v_qty,
      round(v_price * v_qty, 2), coalesce(v_choices, '[]'::jsonb));

    v_subtotal := v_subtotal + round(v_price * v_qty, 2);
    v_cost_total := v_cost_total + round(v_cost * v_qty, 2);
  end loop;

  if v_count > 1000 then raise exception 'INVALID_QUANTITY'; end if;

  if nullif(btrim(coalesce(p_promo_code,'')),'') is not null then
    select * into v_promo from public.promo_codes
    where organization_id = p_org and upper(code) = upper(btrim(p_promo_code)) and is_active
    for update;

    if not found then raise exception 'PROMO_INVALID'; end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then raise exception 'PROMO_NOT_STARTED'; end if;
    if v_promo.ends_at is not null and now() > v_promo.ends_at then raise exception 'PROMO_EXPIRED'; end if;
    if v_promo.usage_limit is not null and v_promo.used_count >= v_promo.usage_limit then raise exception 'PROMO_USED_UP'; end if;
    if v_subtotal < v_promo.minimum_order_amount then raise exception 'PROMO_MIN_AMOUNT'; end if;

    if v_promo.type = 'fixed_amount_off' then
      v_discount := least(v_promo.value, v_subtotal);
    elsif v_promo.type = 'percentage_off' then
      v_discount := round(v_subtotal * v_promo.value / 100.0, 2);
    else
      select coalesce(sum(round(oi.unit_price * floor(oi.quantity / 2) * v_promo.value / 100.0, 2)), 0)
        into v_discount
      from public.order_items oi
      where oi.order_id = v_order_id
        and (v_promo.product_id is null or oi.product_id = v_promo.product_id);
    end if;

    if v_promo.max_discount is not null then
      v_discount := least(v_discount, v_promo.max_discount);
    end if;
    v_discount := least(greatest(v_discount, 0), v_subtotal);

    update public.promo_codes set used_count = used_count + 1 where id = v_promo.id;
    update public.orders set promo_code_id = v_promo.id where id = v_order_id;
  end if;

  update public.orders
     set subtotal = v_subtotal,
         discount = v_discount,
         total = round(v_subtotal - v_discount, 2),
         cost_total = v_cost_total
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'pickup_code', v_pickup,
    'access_token', v_token,
    'total', round(v_subtotal - v_discount, 2)
  );
end; $$;

grant execute on function public.create_public_order(uuid, text, integer, text, jsonb, public.payment_method, text) to anon, authenticated;

-- ------------------------------------------------------------ cancelling ---

create or replace function public.cancel_order(p_order uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_order record; v_item record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.has_org_role(v_order.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('ok', true); end if;

  -- Put the goods back. Legacy rows only know their variant, new rows know the
  -- product directly, so resolve both.
  for v_item in
    select oi.quantity, coalesce(oi.product_id, pv.product_id) as product_id
    from public.order_items oi
    left join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order
  loop
    if v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      insert into public.inventory_movements (organization_id, product_id, variant_id, delta, reason, note, created_by)
      values (v_order.organization_id, v_item.product_id, null, v_item.quantity,
        'order_cancel', v_order.order_number, auth.uid());
    end if;
  end loop;

  if v_order.promo_code_id is not null then
    update public.promo_codes set used_count = greatest(used_count - 1, 0) where id = v_order.promo_code_id;
  end if;

  -- Amounts stay on the row for audit; every report filters cancelled orders
  -- out at the source instead (see order_items_reportable).
  update public.orders set status = 'cancelled' where id = p_order;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cancel_order(uuid) to authenticated;

-- ------------------------------------------------------- order read-out ----

create or replace function public.get_order_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_order record; v_org record; v_items jsonb;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_order from public.orders where access_token = p_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_org from public.organizations where id = v_order.organization_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name', product_name, 'variant_name', variant_name, 'options', options,
    'unit_price', unit_price, 'quantity', quantity, 'line_total', line_total)), '[]'::jsonb)
    into v_items from public.order_items where order_id = v_order.id;
  return jsonb_build_object(
    'organization_id', v_org.id,
    'organization_name', v_org.name, 'currency', v_org.currency,
    'order_number', v_order.order_number, 'pickup_code', v_order.pickup_code,
    'buyer_name', v_order.buyer_name, 'buyer_class', v_order.buyer_class,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'total', v_order.total,
    'payment_method', v_order.payment_method, 'payment_status', v_order.payment_status,
    'status', v_order.status, 'created_at', v_order.created_at,
    'has_proof', v_order.payment_proof_path is not null,
    'items', v_items
  );
end; $$;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
