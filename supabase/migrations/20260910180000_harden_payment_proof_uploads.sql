-- Hardens anonymous payment-proof uploads.
--
-- Before this migration anyone could insert any object of any size and type
-- into the payment-proofs bucket, under any path, without limit. The browser
-- checks were the only guard, so a scripted client could fill the bucket or
-- park arbitrary files in another shop's folder. attach_payment_proof also
-- accepted any "<uuid>/<name>" string, even one belonging to a different shop
-- and even when no such object existed.

-- 1. Bucket-level caps (5 MB, images only) so the limit is enforced by storage
--    itself, not by the client.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array[
         'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'
       ]
 where id in ('payment-proofs', 'shop-images');

-- 2. Helper used by the storage policy. It must be security definer because
--    anon cannot read public.orders directly under RLS.
create or replace function public.proof_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_org text;
  v_file text;
  v_prefix text;
  v_order record;
  v_existing int;
begin
  if p_name is null then return false; end if;

  -- Expected shape: <organization uuid>/<first 16 chars of access token>-<epoch ms>.<ext>
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{16}-[0-9]{10,16}\.(png|jpg|jpeg|webp|heic|heif)$' then
    return false;
  end if;

  v_org := split_part(p_name, '/', 1);
  v_file := split_part(p_name, '/', 2);
  v_prefix := split_part(v_file, '-', 1);

  -- The folder must be the order's own shop, the order must still be live, and
  -- uploads are only accepted for a short window after the order is created.
  select o.id, o.organization_id, o.status
    into v_order
  from public.orders o
  where left(o.access_token, 16) = v_prefix
    and o.organization_id = v_org::uuid
    and o.status <> 'cancelled'
    and o.created_at > now() - interval '2 days'
  limit 1;

  if not found then return false; end if;

  -- Cap retries per order so an anonymous client cannot upload endlessly.
  select count(*) into v_existing
  from storage.objects so
  where so.bucket_id = 'payment-proofs'
    and so.name like v_org || '/' || v_prefix || '-%';

  return v_existing < 5;
end; $$;

revoke all on function public.proof_upload_allowed(text) from public;
grant execute on function public.proof_upload_allowed(text) to anon, authenticated;

-- 3. Replace the wide-open insert policy.
drop policy if exists "proof upload public" on storage.objects;
create policy "proof upload scoped" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs' and public.proof_upload_allowed(name));

-- 4. attach_payment_proof now verifies the path really belongs to this order's
--    shop and that the uploaded object exists.
create or replace function public.attach_payment_proof(p_token text, p_path text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
declare
  v_order record;
begin
  select * into v_order from public.orders where access_token = p_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;

  if p_path is null
     or split_part(p_path, '/', 1) <> v_order.organization_id::text
     or split_part(split_part(p_path, '/', 2), '-', 1) <> left(v_order.access_token, 16)
     or p_path !~ '\.(png|jpg|jpeg|webp|heic|heif)$'
  then
    raise exception 'INVALID_PATH';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'payment-proofs' and name = p_path
  ) then
    raise exception 'INVALID_PATH';
  end if;

  update public.orders
     set payment_proof_path = p_path,
         payment_status = case when payment_status = 'paid' then payment_status else 'proof_uploaded' end
   where id = v_order.id;

  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.attach_payment_proof(text, text) from public;
grant execute on function public.attach_payment_proof(text, text) to anon, authenticated;
