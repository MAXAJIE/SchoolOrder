create policy "proof upload public" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs');
create policy "proof read owner" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
    and public.has_org_role(nullif(split_part(name,'/',1),'')::uuid, 'owner'));
create policy "proof delete owner" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs'
    and public.has_org_role(nullif(split_part(name,'/',1),'')::uuid, 'owner'));

create policy "shop images read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shop-images');
create policy "shop images owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-images'
    and public.has_org_role(nullif(split_part(name,'/',1),'')::uuid, 'owner'));
create policy "shop images owner update" on storage.objects for update to authenticated
  using (bucket_id = 'shop-images'
    and public.has_org_role(nullif(split_part(name,'/',1),'')::uuid, 'owner'));
create policy "shop images owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shop-images'
    and public.has_org_role(nullif(split_part(name,'/',1),'')::uuid, 'owner'));