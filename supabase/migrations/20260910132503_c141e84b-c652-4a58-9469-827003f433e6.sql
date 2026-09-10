revoke execute on function public.has_org_role(uuid, public.app_role) from anon, public;
revoke execute on function public.is_org_member(uuid) from anon, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;

create or replace function public.gen_code(_len int)
returns text language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random()*32)::int + 1, 1), '')
  from generate_series(1, _len);
$$;
revoke execute on function public.gen_code(int) from anon, authenticated, public;

create or replace function public.create_public_order(
  p_org uuid,
  p_buyer_name text,
  p_buyer_age integer,
  p_buyer_class text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_promo_code text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  v_token := encode(gen_random_bytes(24), 'hex');
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

    select pv.*, p.name as product_name, p.is_active as product_active, p.id as pid
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid and pv.organization_id = p_org
    for update of pv;

    if v_variant is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not v_variant.is_active or not v_variant.product_active then raise exception 'PRODUCT_INACTIVE'; end if;
    if v_variant.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_variant.product_name || ' - ' || v_variant.name;
    end if;

    update public.product_variants set stock = stock - v_qty where id = v_variant.id;

    insert into public.inventory_movements (organization_id, variant_id, delta, reason, note)
    values (p_org, v_variant.id, -v_qty, 'order_deduct', v_number);

    insert into public.order_items (order_id, organization_id, variant_id, product_name, variant_name,
      unit_price, unit_cost, quantity, line_total)
    values (v_order_id, p_org, v_variant.id, v_variant.product_name, v_variant.name,
      v_variant.price, v_variant.cost_price, v_qty, round(v_variant.price * v_qty, 2));

    v_subtotal := v_subtotal + round(v_variant.price * v_qty, 2);
    v_cost := v_cost + round(v_variant.cost_price * v_qty, 2);
  end loop;

  if v_count > 1000 then raise exception 'INVALID_QUANTITY'; end if;

  -- promo (server side, one per order)
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
      -- second_item_percentage_off: per eligible line, every 2nd unit discounted
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
  if v_order is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_org from public.organizations where id = v_order.organization_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name', product_name, 'variant_name', variant_name,
    'unit_price', unit_price, 'quantity', quantity, 'line_total', line_total)), '[]'::jsonb)
    into v_items from public.order_items where order_id = v_order.id;
  return jsonb_build_object(
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

create or replace function public.attach_payment_proof(p_token text, p_path text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_order record;
begin
  select * into v_order from public.orders where access_token = p_token;
  if v_order is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  if p_path is null or p_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$' then raise exception 'INVALID_PATH'; end if;
  update public.orders
     set payment_proof_path = p_path,
         payment_status = case when payment_status = 'paid' then payment_status else 'proof_uploaded' end
   where id = v_order.id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.attach_payment_proof(text, text) to anon, authenticated;

create or replace function public.cancel_order(p_order uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_order record; v_item record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.has_org_role(v_order.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'cancelled' then return jsonb_build_object('ok', true); end if;

  for v_item in select * from public.order_items where order_id = p_order and variant_id is not null loop
    update public.product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
    insert into public.inventory_movements (organization_id, variant_id, delta, reason, note, created_by)
    values (v_order.organization_id, v_item.variant_id, v_item.quantity, 'order_cancel', v_order.order_number, auth.uid());
  end loop;

  if v_order.promo_code_id is not null then
    update public.promo_codes set used_count = greatest(used_count - 1, 0) where id = v_order.promo_code_id;
  end if;

  update public.orders set status = 'cancelled' where id = p_order;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cancel_order(uuid) to authenticated;

create or replace function public.adjust_stock(p_variant uuid, p_delta integer, p_reason public.movement_reason, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_v record;
begin
  select * into v_v from public.product_variants where id = p_variant for update;
  if v_v is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not public.has_org_role(v_v.organization_id, 'owner') then raise exception 'FORBIDDEN'; end if;
  if v_v.stock + p_delta < 0 then raise exception 'NEGATIVE_STOCK'; end if;
  update public.product_variants set stock = stock + p_delta where id = p_variant;
  insert into public.inventory_movements (organization_id, variant_id, delta, reason, note, created_by)
  values (v_v.organization_id, p_variant, p_delta, p_reason, p_note, auth.uid());
  return jsonb_build_object('ok', true, 'stock', v_v.stock + p_delta);
end; $$;
grant execute on function public.adjust_stock(uuid, integer, public.movement_reason, text) to authenticated;