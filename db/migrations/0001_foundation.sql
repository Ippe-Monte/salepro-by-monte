-- SALEPRO by MONTE — SE-M1 foundation: profiles, roles, approval, RLS.
-- Requires Neon Auth (neon_auth."user") and the Data API roles (authenticated, anonymous).

create table if not exists public.profiles (
  id uuid primary key,  -- = Neon Auth user id (no FK: neon_auth is not ownable by us)
  email text not null,
  display_name text not null default '',
  role text not null default 'viewer'
    check (role in ('admin','sales','warehouse','dispatcher','viewer')),
  status text not null default 'pending'
    check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_status_idx on public.profiles (status);

-- Helpers (security definer so policies on profiles do not recurse).
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id::text = auth.user_id() and status = 'active'
$$;

-- Called by the app right after sign-in. Creates the caller's profile once.
-- The very first user becomes the active admin; everyone after waits as
-- pending/viewer until an admin approves them. Identity comes from the JWT only.
create or replace function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.user_id()::uuid; p public.profiles; first_user boolean;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(7001);
  select * into p from public.profiles where id = uid;
  if found then return p; end if;
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, display_name, role, status)
  values (uid, coalesce(auth.jwt()->>'email',''), coalesce(auth.jwt()->>'name',''),
          case when first_user then 'admin' else 'viewer' end,
          case when first_user then 'active' else 'pending' end)
  returning * into p;
  return p;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Admin-only role/status change. Refuses to demote or disable the last active admin.
create or replace function public.admin_update_user(target uuid, new_role text, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('admin','sales','warehouse','dispatcher','viewer')
     or new_status not in ('pending','active','disabled') then
    raise exception 'invalid role or status' using errcode = '22023';
  end if;
  if (new_role <> 'admin' or new_status <> 'active')
     and not exists (select 1 from public.profiles
                     where role='admin' and status='active' and id <> target) then
    raise exception 'cannot remove the last active admin' using errcode = '23514';
  end if;
  update public.profiles set role = new_role, status = new_status where id = target;
end $$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id::text = auth.user_id());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.current_app_role() = 'admin');
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id::text = auth.user_id()) with check (id::text = auth.user_id());

-- Explicit grants only (no default grants). Clients may change display_name only;
-- role/status go through admin_update_user().
revoke all on public.profiles from public, anonymous, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke all on function public.admin_update_user(uuid,text,text) from public;
grant execute on function public.admin_update_user(uuid,text,text) to authenticated;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;
revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;
