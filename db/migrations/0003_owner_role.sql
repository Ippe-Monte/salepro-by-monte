-- SALEPRO by MONTE — 0003 owner role.
-- owner > admin. Creator of a company is its owner. Admins manage members and settings but cannot
-- touch owners or grant ownership. At least one active owner must always remain. Owners can hand
-- over ownership (promote another owner, then step down) and members can leave a company.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','admin','sales','warehouse','dispatcher','viewer'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role in ('owner','admin','sales','warehouse','dispatcher','viewer'));

-- Backfill: the creator of an existing company becomes its owner.
update public.memberships m set role = 'owner'
  from public.organizations o
  where o.id = m.org_id and o.created_by = m.user_id and m.role = 'admin';

create or replace function public.create_organization(
  p_name text, p_tax_id text default null, p_address text default null, p_phone text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.current_uid(); oid uuid;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform public.ensure_profile();
  if (select count(*) from public.organizations where created_by = uid) >= 5 then
    raise exception 'organization limit reached' using errcode = '54000';
  end if;
  insert into public.organizations (name, tax_id, address, phone, created_by)
  values (btrim(p_name), nullif(btrim(p_tax_id), ''), nullif(btrim(p_address), ''),
          nullif(btrim(p_phone), ''), uid)
  returning id into oid;
  insert into public.memberships (org_id, user_id, role) values (oid, uid, 'owner');
  return oid;
end $$;

create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare c text; e text := lower(btrim(p_email));
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('owner','admin','sales','warehouse','dispatcher','viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role = 'owner' and not public.has_org_role(p_org, array['owner']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  update public.invitations set status = 'revoked'
   where org_id = p_org and email = e and status = 'pending';
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.invitations (org_id, email, role, code, created_by)
  values (p_org, e, p_role, c, public.current_uid());
  return c;
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid; r text;
begin
  select org_id, role into o, r from public.invitations where id = p_id;
  if o is null or not public.has_org_role(o, array['owner','admin'])
     or (r = 'owner' and not public.has_org_role(o, array['owner'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked' where id = p_id and status = 'pending';
end $$;

create or replace function public.update_member(p_org uuid, p_user uuid, p_role text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare t_role text; caller_owner boolean;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('owner','admin','sales','warehouse','dispatcher','viewer')
     or p_status not in ('active','disabled') then
    raise exception 'invalid role or status' using errcode = '22023';
  end if;
  -- serialize changes per company
  perform 1 from public.memberships where org_id = p_org for update;
  select role into t_role from public.memberships where org_id = p_org and user_id = p_user;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  caller_owner := public.has_org_role(p_org, array['owner']);
  -- only owners may change an owner or grant ownership
  if (t_role = 'owner' or p_role = 'owner') and not caller_owner then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- the company must always keep an active owner
  if t_role = 'owner' and (p_role <> 'owner' or p_status <> 'active')
     and not exists (select 1 from public.memberships
                     where org_id = p_org and role = 'owner' and status = 'active' and user_id <> p_user) then
    raise exception 'cannot remove the last active owner' using errcode = '23514';
  end if;
  update public.memberships set role = p_role, status = p_status
   where org_id = p_org and user_id = p_user;
end $$;

-- A member leaves a company (membership is kept as 'disabled' for history).
create or replace function public.leave_organization(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.current_uid(); r text;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform 1 from public.memberships where org_id = p_org for update;
  select role into r from public.memberships where org_id = p_org and user_id = uid and status = 'active';
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if r = 'owner' and not exists (select 1 from public.memberships
        where org_id = p_org and role = 'owner' and status = 'active' and user_id <> uid) then
    raise exception 'cannot remove the last active owner' using errcode = '23514';
  end if;
  update public.memberships set status = 'disabled' where org_id = p_org and user_id = uid;
end $$;

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = public.current_uid() or public.has_org_role(org_id, array['owner','admin']));
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated using (public.has_org_role(org_id, array['owner','admin']));

revoke all on function public.leave_organization(uuid) from public;
grant execute on function public.leave_organization(uuid) to authenticated;
