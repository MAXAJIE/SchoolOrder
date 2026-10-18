-- Preorder calendar: per-day inventory, per-day ordering deadlines.
--
-- What changes, and why:
--
--  1. Stock is no longer one global number per product. Every sellable day gets
--     its own row in public.product_schedules with its own capacity, so what is
--     on sale on Tuesday can differ from Wednesday (a "limited time menu"), and
--     one busy day can never eat another day's quota.
--
--  2. Nothing can be ordered for today any more. A buyer orders for a service
--     date between tomorrow and today + organizations.preorder_max_days
--     (default 5, hard capped at 14). Dates outside that window are refused by
--     the database, not merely hidden by the UI.
--
--  3. Per-day, per-product ordering deadline (cutoff_time). Because the service
--     date is always in the future, the deadline that matters is the one on the
--     day BEFORE the service date: orders for date D close at cutoff_time on
--     D-1, shop-local time. With no cutoff_time the day simply closes when D-1
--     ends.
--
--  4. No oversell and no ghost holds:
--       * create_public_order takes a row-level write lock on the schedule row
--         (SELECT ... FOR UPDATE) before it compares reserved against capacity,
--         so two buyers racing for the last portion cannot both win.
--       * a CHECK constraint (reserved <= capacity) is the last line of defence
--         even if some future code path forgets to compare.
--       * reserved is released in exactly ONE place: a trigger on orders that
--         fires when an order becomes cancelled (or is deleted while not yet
--         cancelled). cancel_order therefore only flips the status; it can no
--         longer double-release.
--       * owner_release_stale_holds cancels unpaid holds in bulk, through that
--         same single release path.
--
--  5. Owner guard rails: capacity can never be set below what is already
--     reserved, and a day that already has reservations cannot be deleted.

set search_path = public;

-- ------------------------------------------------------------ shop setup ---

alter table public.organizations
  add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';
alter table public.organizations
  add column if not exists preorder_max_days integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_preorder_max_days_range'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_preorder_max_days_range
      check (preorder_max_days between 1 and 14);
  end if;
end $$;

-- "Now" always means now in the shop's own timezone: a shop in Kuala Lumpur
-- must not lose a selling day because the server thinks in UTC.
create or replace function public.org_timezone(_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(o.timezone), ''), 'Asia/Kuala_Lumpur')
  from public.organizations o
  where o.id = _org;
$$;

create or replace function public.org_today(_org uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.org_timezone(_org))::date;
$$;

create or replace function public.org_now(_org uuid)
returns timestamp
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.org_timezone(_org));
$$;

/** First date a buyer may order for: never today. */
create or replace function public.org_first_service_day(_org uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.org_today(_org) + 1;
$$;

/** Last date a buyer may order for (today + preorder_max_days). */
create or replace function public.org_last_service_day(_org uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.org_today(_org)
       + greatest(least(coalesce(
           (select o.preorder_max_days from public.organizations o where o.id = _org), 5), 14), 1);
$$;

grant execute on function public.org_timezone(uuid) to anon, authenticated;
grant execute on function public.org_today(uuid) to anon, authenticated;
grant execute on function public.org_now(uuid) to anon, authenticated;
grant execute on function public.org_first_service_day(uuid) to anon, authenticated;
grant execute on function public.org_last_service_day(uuid) to anon, authenticated;

-- ------------------------------------------------------- day inventory -----

create table if not exists public.product_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  service_date date not null,
  capacity integer not null default 0 check (capacity >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  cutoff_time time,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, service_date),
  constraint product_schedules_reserved_within_capacity check (reserved <= capacity)
);

create index if not exists product_schedules_org_date_idx
  on public.product_schedules(organization_id, service_date);
create index if not exists product_schedules_date_idx
  on public.product_schedules(service_date);

grant select on public.product_schedules to anon;
grant select, insert, update, delete on public.product_schedules to authenticated;
grant all on public.product_schedules to service_role;

alter table public.product_schedules enable row level security;

drop policy if exists "schedules public read" on public.product_schedules;
create policy "schedules public read" on public.product_schedules
  for select to anon, authenticated
  using (
    public.shop_is_live(organization_id)
    and exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );

drop policy if exists "schedules member read" on public.product_schedules;
create policy "schedules member read" on public.product_schedules
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "schedules owner manage" on public.product_schedules;
create policy "schedules owner manage" on public.product_schedules
  for all to authenticated
  using (public.has_org_role(organization_id, 'owner'))
  with check (public.has_org_role(organization_id, 'owner'));

drop trigger if exists product_schedules_touch on public.product_schedules;
create trigger product_schedules_touch
before update on public.product_schedules
for each row execute function public.touch_updated_at();

-- ----------------------------------------------------- orders get a day ----

alter table public.orders add column if not exists service_date date;

create index if not exists orders_service_date_idx
  on public.orders(organization_id, service_date);

-- ------------------------------------------------- the single release path --

/**
 * The ONLY place a reservation is ever given back: a trigger that fires when an
 * order becomes cancelled, or when a not-yet-cancelled order row is deleted.
 * Grouping by product first means one UPDATE per product, whatever the cart
 * looked like, so nothing can be released twice.
 */
create or replace function public.release_order_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_row record;
begin
  if old.service_date is null then
    return old;
  end if;

  for v_row in
    select oi.product_id, sum(oi.quantity)::int as qty
    from public.order_items oi
    where oi.order_id = old.id and oi.product_id is not null
    group by oi.product_id
  loop
    update public.product_schedules s
       set reserved = greatest(s.reserved - v_row.qty, 0)
     where s.product_id = v_row.product_id
       and s.service_date = old.service_date;
  end loop;

  return old;
end; $$;

drop trigger if exists trg_release_order_reservation on public.orders;
create trigger trg_release_order_reservation
after update of status on public.orders
for each row
when (new.status = 'cancelled' and old.status <> 'cancelled')
execute function public.release_order_reservation();

-- BEFORE, not AFTER: order_items are cascade-deleted with the order, so after
-- the delete there is nothing left to count.
drop trigger if exists trg_release_order_reservation_delete on public.orders;
create trigger trg_release_order_reservation_delete
before delete on public.orders
for each row
when (old.status <> 'cancelled')
execute function public.release_order_reservation();

-- --------------------------------------------------------------- ordering ---

-- The dateless signature is removed on purpose: an order without a service
-- date would bypass the whole calendar.
drop function if exists public.create_public_order(uuid, text, integer, text, jsonb, public.payment_method, text);

create or replace function public.create_public_order(
  p_org uuid,
  p_buyer_name text,
  p_buyer_age integer,
  p_buyer_class text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_service_date date,
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
  v_slot record;
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
  v_now timestamp;
  v_first date;
  v_last date;
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

  -- The window is decided here, in the shop's timezone, so a stale page or a
  -- hand-made request cannot order for today or beyond the window.
  v_now := public.org_now(p_org);
  v_first := public.org_first_service_day(p_org);
  v_last := public.org_last_service_day(p_org);

  if p_service_date is null then raise exception 'DATE_REQUIRED'; end if;
  if p_service_date < v_first then raise exception 'DATE_TOO_SOON'; end if;
  if p_service_date > v_last then raise exception 'DATE_TOO_FAR'; end if;

  v_order_id := gen_random_uuid();
  v_pickup := public.gen_code(6);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_number := 'ORD-' || to_char(now() at time zone 'utc', 'YYMMDD') || '-' || public.gen_code(5);

  insert into public.orders (id, organization_id, order_number, pickup_code, access_token,
    buyer_name, buyer_age, buyer_class, payment_method, payment_status, status, promo_code,
    service_date)
  values (v_order_id, p_org, v_number, v_pickup, v_token,
    btrim(p_buyer_name), p_buyer_age, v_class, p_payment_method,
    'pending_payment', 'pending', nullif(btrim(coalesce(p_promo_code,'')),''),
    p_service_date);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 500 then raise exception 'INVALID_QUANTITY'; end if;
    v_count := v_count + v_qty;

    select p.id, p.name, p.is_active, p.base_price, p.cost_price
      into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.organization_id = p_org;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_product.is_active then raise exception 'PRODUCT_INACTIVE'; end if;

    -- Row-level write lock on this product's row for this one day. The capacity
    -- check and the increment both happen while the lock is held, so a second
    -- buyer waits here and then sees the updated reserved count.
    select s.id, s.capacity, s.reserved, s.cutoff_time, s.is_available
      into v_slot
    from public.product_schedules s
    where s.product_id = v_product.id
      and s.service_date = p_service_date
      and s.organization_id = p_org
    for update;

    if not found then raise exception 'NOT_ON_MENU:%', v_product.name; end if;
    if not v_slot.is_available then raise exception 'NOT_ON_MENU:%', v_product.name; end if;
    if v_slot.cutoff_time is not null
       and v_now > ((p_service_date - 1) + v_slot.cutoff_time) then
      raise exception 'CUTOFF_PASSED:%', v_product.name;
    end if;
    if v_slot.capacity - v_slot.reserved < v_qty then
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

    -- The day's quota IS the inventory now. products.stock is left untouched so
    -- one day can never spend another day's portions.
    update public.product_schedules
       set reserved = reserved + v_qty
     where id = v_slot.id;

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
    'service_date', p_service_date,
    'total', round(v_subtotal - v_discount, 2)
  );
end; $$;

grant execute on function public.create_public_order(uuid, text, integer, text, jsonb, public.payment_method, date, text) to anon, authenticated;

-- ------------------------------------------------------------ cancelling ---

-- Reservations are released by trg_release_order_reservation only, so this
-- function just flips the status (and gives a promo use back).
create or replace function public.cancel_order(p_order uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_order record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.has_org_role(v_order.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('ok', true); end if;

  if v_order.promo_code_id is not null then
    update public.promo_codes set used_count = greatest(used_count - 1, 0) where id = v_order.promo_code_id;
  end if;

  -- Amounts stay on the row for audit; every report filters cancelled orders
  -- out at the source instead (see order_items_reportable).
  update public.orders set status = 'cancelled' where id = p_order;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cancel_order(uuid) to authenticated;

-- -------------------------------------------------------- owner calendar ---

/** A window of days, each with every product's quota for that day. */
create or replace function public.owner_list_schedule(
  p_org uuid,
  p_from date default null,
  p_days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(least(coalesce(p_days, 7), 31), 1);
  v_from date;
  v_result jsonb;
begin
  if not public.is_org_member(p_org) then raise exception 'FORBIDDEN'; end if;

  v_from := coalesce(p_from, public.org_today(p_org));

  select coalesce(jsonb_agg(to_jsonb(day) order by day.service_date), '[]'::jsonb)
    into v_result
  from (
    select
      d::date as service_date,
      (
        select count(*) from public.orders o
        where o.organization_id = p_org
          and o.service_date = d::date
          and o.status <> 'cancelled'
      ) as orders,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'product_id', s.product_id,
          'product_name', p.name,
          'is_active', p.is_active,
          'base_price', p.base_price,
          'capacity', s.capacity,
          'reserved', s.reserved,
          'cutoff_time', to_char(s.cutoff_time, 'HH24:MI'),
          'is_available', s.is_available
        ) order by p.sort_order, p.name), '[]'::jsonb)
        from public.product_schedules s
        join public.products p on p.id = s.product_id
        where s.organization_id = p_org and s.service_date = d::date
      ) as entries
    from generate_series(v_from, v_from + (v_days - 1), interval '1 day') as d
  ) as day;

  return jsonb_build_object(
    'today', public.org_today(p_org),
    'first_service_date', public.org_first_service_day(p_org),
    'last_service_date', public.org_last_service_day(p_org),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'base_price', p.base_price, 'is_active', p.is_active
      ) order by p.sort_order, p.name), '[]'::jsonb)
      from public.products p
      where p.organization_id = p_org
    ),
    'days', v_result
  );
end; $$;

grant execute on function public.owner_list_schedule(uuid, date, integer) to authenticated;

create or replace function public.owner_upsert_schedule(
  p_org uuid,
  p_product uuid,
  p_date date,
  p_capacity integer,
  p_cutoff_time text default null,
  p_is_available boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cutoff time;
  v_reserved int;
begin
  if not public.has_org_role(p_org, 'owner') then raise exception 'FORBIDDEN'; end if;
  if p_date is null then raise exception 'DATE_REQUIRED'; end if;
  if p_date < public.org_today(p_org) then raise exception 'DATE_IN_PAST'; end if;
  if p_capacity is null or p_capacity < 0 or p_capacity > 100000 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if not exists (
    select 1 from public.products where id = p_product and organization_id = p_org
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if nullif(btrim(coalesce(p_cutoff_time, '')), '') is null then
    v_cutoff := null;
  else
    begin
      v_cutoff := btrim(p_cutoff_time)::time;
    exception when others then
      raise exception 'INVALID_CUTOFF';
    end;
  end if;

  select s.reserved into v_reserved
  from public.product_schedules s
  where s.product_id = p_product and s.service_date = p_date
  for update;

  -- A quota can never drop below what buyers already hold.
  if found and p_capacity < v_reserved then
    raise exception 'CAPACITY_BELOW_RESERVED';
  end if;

  insert into public.product_schedules
    (organization_id, product_id, service_date, capacity, cutoff_time, is_available)
  values (p_org, p_product, p_date, p_capacity, v_cutoff, coalesce(p_is_available, true))
  on conflict (product_id, service_date) do update
    set capacity = excluded.capacity,
        cutoff_time = excluded.cutoff_time,
        is_available = excluded.is_available;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.owner_upsert_schedule(uuid, uuid, date, integer, text, boolean) to authenticated;

create or replace function public.owner_delete_schedule(p_org uuid, p_product uuid, p_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_reserved int;
begin
  if not public.has_org_role(p_org, 'owner') then raise exception 'FORBIDDEN'; end if;

  select s.reserved into v_reserved
  from public.product_schedules s
  where s.organization_id = p_org and s.product_id = p_product and s.service_date = p_date
  for update;

  if not found then return jsonb_build_object('ok', true); end if;
  if v_reserved > 0 then raise exception 'SCHEDULE_HAS_ORDERS'; end if;

  delete from public.product_schedules
  where organization_id = p_org and product_id = p_product and service_date = p_date;

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.owner_delete_schedule(uuid, uuid, date) to authenticated;

/** Copy one day's whole line-up onto another day. Reserved counts stay put. */
create or replace function public.owner_copy_schedule(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_copied int := 0;
begin
  if not public.has_org_role(p_org, 'owner') then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null then raise exception 'DATE_REQUIRED'; end if;
  if p_from = p_to then raise exception 'SAME_DAY'; end if;
  if p_to < public.org_today(p_org) then raise exception 'DATE_IN_PAST'; end if;

  if not exists (
    select 1 from public.product_schedules where organization_id = p_org and service_date = p_from
  ) then
    raise exception 'NOTHING_TO_COPY';
  end if;

  -- Never let a copy push a day below what buyers already hold.
  if exists (
    select 1
    from public.product_schedules src
    join public.product_schedules dst
      on dst.product_id = src.product_id and dst.service_date = p_to
    where src.organization_id = p_org
      and src.service_date = p_from
      and src.capacity < dst.reserved
  ) then
    raise exception 'CAPACITY_BELOW_RESERVED';
  end if;

  insert into public.product_schedules
    (organization_id, product_id, service_date, capacity, cutoff_time, is_available)
  select src.organization_id, src.product_id, p_to, src.capacity, src.cutoff_time, src.is_available
  from public.product_schedules src
  where src.organization_id = p_org and src.service_date = p_from
  on conflict (product_id, service_date) do update
    set capacity = excluded.capacity,
        cutoff_time = excluded.cutoff_time,
        is_available = excluded.is_available;

  select count(*) into v_copied
  from public.product_schedules
  where organization_id = p_org and service_date = p_to;

  return jsonb_build_object('ok', true, 'copied', v_copied);
end; $$;

grant execute on function public.owner_copy_schedule(uuid, date, date) to authenticated;

/**
 * DuitNow holds that were never paid keep portions away from other buyers.
 * Cancelling them goes through the one release trigger, so the freed portions
 * are always exact.
 */
create or replace function public.owner_release_stale_holds(p_org uuid, p_minutes integer default 120)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ids uuid[]; v_minutes int;
begin
  if not public.has_org_role(p_org, 'owner') then raise exception 'FORBIDDEN'; end if;
  v_minutes := greatest(least(coalesce(p_minutes, 120), 10080), 15);

  select coalesce(array_agg(o.id), '{}'::uuid[]) into v_ids
  from public.orders o
  where o.organization_id = p_org
    and o.status = 'pending'
    and o.payment_status in ('pending_payment', 'rejected')
    and o.service_date is not null
    and o.created_at < now() - make_interval(mins => v_minutes);

  if array_length(v_ids, 1) is null then
    return jsonb_build_object('released', 0);
  end if;

  update public.orders set status = 'cancelled' where id = any(v_ids);

  return jsonb_build_object('released', array_length(v_ids, 1));
end; $$;

grant execute on function public.owner_release_stale_holds(uuid, integer) to authenticated;

-- ---------------------------------------------------------- buyer calendar --

/** The dates a buyer may choose, with a hint of what each day looks like. */
create or replace function public.get_shop_calendar(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first date;
  v_last date;
  v_now timestamp;
  v_days jsonb;
begin
  if not public.shop_is_live(p_org) then raise exception 'SHOP_UNAVAILABLE'; end if;

  v_first := public.org_first_service_day(p_org);
  v_last := public.org_last_service_day(p_org);
  v_now := public.org_now(p_org);

  select coalesce(jsonb_agg(to_jsonb(day) order by day.service_date), '[]'::jsonb)
    into v_days
  from (
    select
      d::date as service_date,
      (
        select count(*) from public.product_schedules s
        join public.products p on p.id = s.product_id
        where s.organization_id = p_org
          and s.service_date = d::date
          and s.is_available
          and p.is_active
          and (s.cutoff_time is null or v_now <= ((d::date - 1) + s.cutoff_time))
      ) as open_items,
      (
        select count(*) from public.product_schedules s
        join public.products p on p.id = s.product_id
        where s.organization_id = p_org
          and s.service_date = d::date
          and s.is_available
          and p.is_active
          and s.capacity > s.reserved
          and (s.cutoff_time is null or v_now <= ((d::date - 1) + s.cutoff_time))
      ) as available_items
    from generate_series(v_first, v_last, interval '1 day') as d
  ) as day;

  return jsonb_build_object(
    'today', public.org_today(p_org),
    'first_service_date', v_first,
    'last_service_date', v_last,
    'days', v_days
  );
end; $$;

grant execute on function public.get_shop_calendar(uuid) to anon, authenticated;

/** Everything on sale for one service date, with that day's remaining count. */
create or replace function public.get_shop_menu(p_org uuid, p_service_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamp;
  v_first date;
  v_last date;
  v_items jsonb;
begin
  if not public.shop_is_live(p_org) then raise exception 'SHOP_UNAVAILABLE'; end if;
  if p_service_date is null then raise exception 'DATE_REQUIRED'; end if;

  v_now := public.org_now(p_org);
  v_first := public.org_first_service_day(p_org);
  v_last := public.org_last_service_day(p_org);

  if p_service_date < v_first then raise exception 'DATE_TOO_SOON'; end if;
  if p_service_date > v_last then raise exception 'DATE_TOO_FAR'; end if;

  select coalesce(jsonb_agg(to_jsonb(item) - 'sort_order' order by item.sort_order, item.name), '[]'::jsonb)
    into v_items
  from (
    select
      p.id,
      p.name,
      p.description,
      p.image_url,
      p.base_price,
      p.sort_order,
      greatest(s.capacity - s.reserved, 0) as remaining,
      to_char(s.cutoff_time, 'HH24:MI') as cutoff_time,
      (s.cutoff_time is not null and v_now > ((p_service_date - 1) + s.cutoff_time)) as cutoff_passed,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'is_required', o.is_required,
          'max_select', o.max_select,
          'sort_order', o.sort_order,
          'values', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', ov.id, 'label', ov.label,
              'price_delta', ov.price_delta, 'sort_order', ov.sort_order
            ) order by ov.sort_order, ov.label), '[]'::jsonb)
            from public.product_option_values ov where ov.option_id = o.id
          )
        ) order by o.sort_order, o.created_at), '[]'::jsonb)
        from public.product_options o
        where o.product_id = p.id
      ) as options
    from public.product_schedules s
    join public.products p on p.id = s.product_id
    where s.organization_id = p_org
      and s.service_date = p_service_date
      and s.is_available
      and p.is_active
  ) as item;

  return jsonb_build_object(
    'service_date', p_service_date,
    'first_service_date', v_first,
    'last_service_date', v_last,
    'items', v_items
  );
end; $$;

grant execute on function public.get_shop_menu(uuid, date) to anon, authenticated;

-- The storefront needs the bookable window as soon as it resolves the shop.
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
    'button_color', v_org.button_color,
    'today', public.org_today(v_org.id),
    'first_service_date', public.org_first_service_day(v_org.id),
    'last_service_date', public.org_last_service_day(v_org.id),
    'preorder_max_days', v_org.preorder_max_days
  );
end;
$$;

grant execute on function public.get_shop_by_code(text) to anon, authenticated;

-- The receipt has to say which day the order is for.
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
    'service_date', v_order.service_date,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'total', v_order.total,
    'payment_method', v_order.payment_method, 'payment_status', v_order.payment_status,
    'status', v_order.status, 'created_at', v_order.created_at,
    'has_proof', v_order.payment_proof_path is not null,
    'items', v_items);
end; $$;

grant execute on function public.get_order_by_token(text) to anon, authenticated;
