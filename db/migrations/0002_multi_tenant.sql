-- SALEPRO by MONTE — 0002 multi-tenant: every company's data is isolated by org_id + RLS.
-- Replaces the global role/status model of 0001 (no users existed when this was written).
-- TENANCY RULE for every later table: org_id uuid not null references organizations(id),
-- RLS enabled, policies built on is_org_member(org_id) / has_org_role(org_id, ...), and
-- business keys (sku, code, doc numbers) unique per (org_id, key), never globally.

-- ---------------------------------------------------------------- tear down 0001 model
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop function if exists public.admin_update_user(uuid, text, text);
drop function if exists public.ensure_profile();
drop function if exists public.current_app_role();
alter table public.profiles drop column if exists role, drop column if exists status;

-- ---------------------------------------------------------------- tables
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  tax_id text check (char_length(tax_id) <= 40),
  address text check (char_length(address) <= 500),
  phone text check (char_length(phone) <= 40),
  currency text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(5,2) not null default 7 check (vat_rate between 0 and 100),
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','sales','warehouse','dispatcher','viewer')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  role text not null check (role in ('admin','sales','warehouse','dispatcher','viewer')),
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (org_id, status);

-- Platform operators (the owner of SALEPRO). Managed by SQL only; no client grants.
create table public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- identity helpers
-- Single place that reads the JWT, so tests on a disposable branch can substitute it.
create or replace function public.current_uid() returns uuid
language sql stable as $$ select auth.user_id()::uuid $$;
create or replace function public.current_email() returns text
language sql stable as $$ select lower(auth.jwt() ->> 'email') $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = public.current_uid())
$$;

-- member of the org with an active membership (any org status): may see the org row.
create or replace function public.is_org_member_any(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where org_id = o and user_id = public.current_uid() and status = 'active')
$$;

-- member of an ACTIVE (not suspended) org: gate for all business data.
create or replace function public.is_org_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 join public.organizations g on g.id = m.org_id
                 where m.org_id = o and m.user_id = public.current_uid()
                   and m.status = 'active' and g.status = 'active')
$$;

create or replace function public.has_org_role(o uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 join public.organizations g on g.id = m.org_id
                 where m.org_id = o and m.user_id = public.current_uid()
                   and m.status = 'active' and g.status = 'active' and m.role = any (roles))
$$;

create or replace function public.shares_org_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships a
                 join public.memberships b on b.org_id = a.org_id
                 where a.user_id = public.current_uid() and a.status = 'active'
                   and b.user_id = u and b.status = 'active')
$$;

-- ---------------------------------------------------------------- RPCs (only way to change tenancy data)
create or replace function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.current_uid(); p public.profiles;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  insert into public.profiles (id, email, display_name)
  values (uid, coalesce(public.current_email(), ''), coalesce(auth.jwt() ->> 'name', ''))
  on conflict (id) do update set email = excluded.email
  returning * into p;
  return p;
end $$;

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
  insert into public.memberships (org_id, user_id, role) values (oid, uid, 'admin');
  return oid;
end $$;

create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare c text; e text := lower(btrim(p_email));
begin
  if not public.has_org_role(p_org, array['admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_role not in ('admin','sales','warehouse','dispatcher','viewer') then
    raise exception 'invalid role' using errcode = '22023';
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
declare o uuid;
begin
  select org_id into o from public.invitations where id = p_id;
  if o is null or not public.has_org_role(o, array['admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked' where id = p_id and status = 'pending';
end $$;

-- Code AND the signed-in email must both match; one generic error for every failure.
create or replace function public.accept_invitation(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.current_uid(); i public.invitations;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform public.ensure_profile();
  select * into i from public.invitations
   where code = upper(btrim(p_code)) and status = 'pending' and expires_at > now()
     and email = public.current_email()
     and exists (select 1 from public.organizations g where g.id = org_id and g.status = 'active');
  if not found then raise exception 'invalid invitation' using errcode = '22023'; end if;
  insert into public.memberships (org_id, user_id, role, status)
  values (i.org_id, uid, i.role, 'active')
  on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';
  update public.invitations set status = 'accepted' where id = i.id;
  return i.org_id;
end $$;

create or replace function public.update_member(p_org uuid, p_user uuid, p_role text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('admin','sales','warehouse','dispatcher','viewer')
     or p_status not in ('active','disabled') then
    raise exception 'invalid role or status' using errcode = '22023';
  end if;
  perform 1 from public.memberships where org_id = p_org for update;
  -- serialize admin changes above; refuse to leave the org without an active admin
  if (p_role <> 'admin' or p_status <> 'active')
     and not exists (select 1 from public.memberships
                     where org_id = p_org and role = 'admin' and status = 'active' and user_id <> p_user) then
    raise exception 'cannot remove the last active admin' using errcode = '23514';
  end if;
  update public.memberships set role = p_role, status = p_status
   where org_id = p_org and user_id = p_user;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.set_org_status(p_org uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.organizations set status = p_status where id = p_org;
end $$;

-- Platform view: companies and member counts only, never business data.
create or replace function public.platform_list_orgs()
returns table (id uuid, name text, status text, created_at timestamptz, member_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select o.id, o.name, o.status, o.created_at,
           (select count(*) from public.memberships m where m.org_id = o.id and m.status = 'active')
    from public.organizations o order by o.created_at desc;
end $$;

create or replace function public.am_platform_admin() returns boolean
language sql stable as $$ select public.is_platform_admin() $$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_admins enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (id = public.current_uid() or public.shares_org_with(id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = public.current_uid()) with check (id = public.current_uid());

create policy organizations_select on public.organizations
  for select to authenticated using (public.is_org_member_any(id));
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['admin'])) with check (public.has_org_role(id, array['admin']));

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = public.current_uid() or public.has_org_role(org_id, array['admin']));

create policy invitations_select on public.invitations
  for select to authenticated using (public.has_org_role(org_id, array['admin']));

-- ---------------------------------------------------------------- grants (explicit only)
revoke all on public.profiles, public.organizations, public.memberships,
              public.invitations, public.platform_admins
  from public, anonymous, authenticated;
grant select on public.profiles, public.organizations, public.memberships, public.invitations
  to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name, tax_id, address, phone, currency, vat_rate) on public.organizations to authenticated;

revoke all on function
  public.current_uid(), public.current_email(), public.is_platform_admin(),
  public.is_org_member_any(uuid), public.is_org_member(uuid), public.has_org_role(uuid, text[]),
  public.shares_org_with(uuid), public.ensure_profile(),
  public.create_organization(text, text, text, text), public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid), public.accept_invitation(text),
  public.update_member(uuid, uuid, text, text), public.set_org_status(uuid, text),
  public.platform_list_orgs(), public.am_platform_admin()
  from public;
grant execute on function
  public.current_uid(), public.current_email(), public.is_platform_admin(),
  public.is_org_member_any(uuid), public.is_org_member(uuid), public.has_org_role(uuid, text[]),
  public.shares_org_with(uuid), public.ensure_profile(),
  public.create_organization(text, text, text, text), public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid), public.accept_invitation(text),
  public.update_member(uuid, uuid, text, text), public.set_org_status(uuid, text),
  public.platform_list_orgs(), public.am_platform_admin()
  to authenticated;
