-- Public shop appearance. Values are constrained before they can reach CSS.
alter table public.organizations
  add column if not exists public_theme text not null default 'ocean'
    check (public_theme in ('ocean', 'mint', 'coral')),
  add column if not exists button_color text not null default '#2D8A9E'
    check (button_color ~ '^#[0-9A-Fa-f]{6}$');

-- Owner and active dealers may change appearance only. This avoids granting
-- dealers UPDATE access to shop name, currency or open/closed state.
create or replace function public.update_shop_appearance(
  p_org uuid,
  p_theme text,
  p_button_color text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.has_org_role(p_org, 'owner')
    or public.has_org_role(p_org, 'dealer')
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_theme not in ('ocean', 'mint', 'coral')
    or p_button_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_APPEARANCE';
  end if;
  update public.organizations
  set public_theme = p_theme, button_color = upper(p_button_color)
  where id = p_org;
  if not found then
    raise exception 'ORG_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.update_shop_appearance(uuid, text, text) from public, anon;
grant execute on function public.update_shop_appearance(uuid, text, text) to authenticated;

-- Keep financial history intact when cancelling. The UI intentionally hides
-- payment badges on cancelled orders to avoid a contradictory customer message.