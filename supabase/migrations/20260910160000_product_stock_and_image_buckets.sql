-- Keep inventory on the product. Variants are now customizations (for example,
-- size or flavour) and do not have separate quantities.

insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('shop-images', 'shop-images', false)
on conflict (id) do update set public = excluded.public;

drop function if exists public.create_public_order(uuid, text, integer, text, jsonb, public.payment_method, text);
drop function if exists public.cancel_order(uuid);
drop function if exists public.adjust_stock(uuid, integer, public.movement_reason, text);

alter table public.products add column if not exists stock integer not null default 0;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_stock_nonnegative check (stock >= 0);
  end if;
end $$;

update public.products p
set stock = coalesce((select sum(pv.stock) from public.product_variants pv where pv.product_id = p.id), 0);

alter table public.inventory_movements add column if not exists product_id uuid references public.products(id) on delete cascade;
update public.inventory_movements im
set product_id = pv.product_id
from public.product_variants pv
where im.variant_id = pv.id and im.product_id is null;
alter table public.inventory_movements alter column variant_id drop not null;
alter table public.product_variants drop column if exists stock;

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
  v_variant record;
  v_qty int;
  v_subtotal numeric(10,2) := 0;
  v_cost numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_promo record;
  v_order_id uuid;
  v_number text;
  v_pickup text;
  v_token text;
  v_open boolean;
  v_count int := 0;
begin
  if p_buyer_name is null or length(btrim(p_buyer_name)) < 2 then
    raise exception 'INVALID_NAME';
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
    btrim(p_buyer_name), p_buyer_age, nullif(btrim(coalesce(p_buyer_class,'')),''), p_payment_method,
    'pending_payment', 'pending', nullif(btrim(coalesce(p_promo_code,'')),''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 500 then raise exception 'INVALID_QUANTITY'; end if;
    v_count := v_count + v_qty;

    -- Lock the product row, not the customization row. All variants share this stock.
    select pv.id as variant_id, pv.name as variant_name, pv.price, pv.cost_price,
           pv.product_id, p.name as product_name, p.is_active as product_active,
           p.stock as product_stock
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and pv.organization_id = p_org
    for update of p;

    if v_variant is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_variant.is_active or not v_variant.product_active then raise exception 'PRODUCT_INACTIVE'; end if;
    if v_variant.product_stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_variant.product_name;
    end if;

    update public.products set stock = stock - v_qty where id = v_variant.product_id;

    insert into public.inventory_movements (organization_id, product_id, variant_id, delta, reason, note)
    values (p_org, v_variant.product_id, v_variant.variant_id, -v_qty, 'order_deduct', v_number);

    insert into public.order_items (order_id, organization_id, variant_id, product_name, variant_name,
      unit_price, unit_cost, quantity, line_total)
    values (v_order_id, p_org, v_variant.variant_id, v_variant.product_name, v_variant.variant_name,
      v_variant.price, v_variant.cost_price, v_qty, round(v_variant.price * v_qty, 2));

    v_subtotal := v_subtotal + round(v_variant.price * v_qty, 2);
    v_cost := v_cost + round(v_variant.cost_price * v_qty, 2);
  end loop;

  if v_count > 1000 then raise exception 'INVALID_QUANTITY'; end if;

  if nullif(btrim(coalesce(p_promo_code,'')),'') is not null then
    select * into v_promo from public.promo_codes
    where organization_id = p_org and upper(code) = upper(btrim(p_promo_code)) and is_active
    for update;

    if v_promo is null then raise exception 'PROMO_INVALID'; end if;
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
      join public.product_variants pv on pv.id = oi.variant_id
      where oi.order_id = v_order_id
        and (v_promo.product_id is null or pv.product_id = v_promo.product_id);
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
         cost_total = v_cost
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

create or replace function public.cancel_order(p_order uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_order record; v_item record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.has_org_role(v_order.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('ok', true); end if;

  for v_item in
    select oi.quantity, oi.variant_id, pv.product_id
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order and oi.variant_id is not null
  loop
    update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    insert into public.inventory_movements (organization_id, product_id, variant_id, delta, reason, note, created_by)
    values (v_order.organization_id, v_item.product_id, v_item.variant_id, v_item.quantity,
      'order_cancel', v_order.order_number, auth.uid());
  end loop;

  if v_order.promo_code_id is not null then
    update public.promo_codes set used_count = greatest(used_count - 1, 0) where id = v_order.promo_code_id;
  end if;

  update public.orders set status = 'cancelled' where id = p_order;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cancel_order(uuid) to authenticated;

create function public.adjust_stock(
  p_product uuid,
  p_delta integer,
  p_reason public.movement_reason,
  p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_product record;
  v_variant_id uuid;
  v_next integer;
begin
  select * into v_product from public.products where id = p_product for update;
  if v_product is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not public.has_org_role(v_product.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  v_next := v_product.stock + p_delta;
  if v_next < 0 then raise exception 'NEGATIVE_STOCK'; end if;
  update public.products set stock = v_next where id = p_product;
  select id into v_variant_id from public.product_variants
    where product_id = p_product order by sort_order, created_at limit 1;
  insert into public.inventory_movements (organization_id, product_id, variant_id, delta, reason, note, created_by)
  values (v_product.organization_id, p_product, v_variant_id, p_delta, p_reason, p_note, auth.uid());
  return jsonb_build_object('ok', true, 'stock', v_next);
end; $$;
revoke all on function public.adjust_stock(uuid, integer, public.movement_reason, text) from anon, public;
grant execute on function public.adjust_stock(uuid, integer, public.movement_reason, text) to authenticated;
