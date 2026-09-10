-- Fix #1: create_public_order read pv.is_active but never selected it, so every
--         checkout died with: record "v_variant" has no field "is_active".
-- Fix #5: buyer age / name / class are now validated on the server, not only in HTML.
-- Fix #3: get_order_by_token now returns organization_id, so the client can scope
--         the DuitNow QR and the payment-proof folder to the order's own shop.

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
  v_class text;
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

    -- Lock the product row, not the customization row. All variants share this stock.
    select pv.id as variant_id, pv.name as variant_name, pv.price, pv.cost_price,
           pv.is_active as variant_active,
           pv.product_id, p.name as product_name, p.is_active as product_active,
           p.stock as product_stock
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and pv.organization_id = p_org
    for update of p;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_variant.variant_active or not v_variant.product_active then raise exception 'PRODUCT_INACTIVE'; end if;
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
    'order_number', v_order.order_number, 'pickup_code', v_order.pickup_code,
    'buyer_name', v_order.buyer_name, 'buyer_class', v_order.buyer_class,
    'subtotal', v_order.subtotal, 'discount', v_order.discount, 'total', v_order.total,
    'payment_method', v_order.payment_method, 'payment_status', v_order.payment_status,
    'status', v_order.status, 'created_at', v_order.created_at,
    'has_proof', v_order.payment_proof_path is not null,
    'items', v_items);
end; $$;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
