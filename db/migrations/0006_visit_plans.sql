-- SALEPRO by MONTE — 0006 customer visit plans with schedule (SE-M4).
-- One assignee cannot have two planned visits that overlap in time inside the same company.

create extension if not exists btree_gist;

create table public.visit_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  address_id uuid,
  assignee uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  purpose text check (char_length(purpose) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  outcome text check (char_length(outcome) <= 2000),
  checked_in_at timestamptz,
  check_in_lat numeric(9,6) check (check_in_lat between -90 and 90),
  check_in_lng numeric(9,6) check (check_in_lng between -180 and 180),
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((check_in_lat is null) = (check_in_lng is null)),
  foreign key (org_id, customer_id) references public.customers (org_id, id),
  foreign key (org_id, address_id) references public.customer_addresses (org_id, id),
  unique (org_id, id),
  exclude using gist (
    org_id with =,
    assignee with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'planned')
);
create index visit_plans_org_start_idx on public.visit_plans (org_id, starts_at);
create index visit_plans_assignee_idx on public.visit_plans (org_id, assignee, starts_at);

create trigger visit_plans_touch before update on public.visit_plans
  for each row execute function public.touch_updated_at();

create function public.visit_plans_check_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.memberships m
     where m.org_id = new.org_id and m.user_id = new.assignee and m.status = 'active'
  ) then
    raise exception 'assignee is not an active member' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger visit_plans_assignee_ck before insert or update of assignee, org_id on public.visit_plans
  for each row execute function public.visit_plans_check_assignee();

alter table public.visit_plans enable row level security;

create policy visit_plans_select on public.visit_plans
  for select to authenticated using (public.is_org_member(org_id));
create policy visit_plans_insert on public.visit_plans
  for insert to authenticated
  with check (
    public.has_org_role(org_id, array['owner','admin'])
    or (public.has_org_role(org_id, array['sales']) and assignee = public.current_uid())
  );
create policy visit_plans_update on public.visit_plans
  for update to authenticated
  using (
    public.has_org_role(org_id, array['owner','admin'])
    or (public.has_org_role(org_id, array['sales']) and assignee = public.current_uid())
  )
  with check (
    public.has_org_role(org_id, array['owner','admin'])
    or (public.has_org_role(org_id, array['sales']) and assignee = public.current_uid())
  );

revoke all on public.visit_plans from public, anonymous, authenticated;
grant select on public.visit_plans to authenticated;
grant insert (org_id, customer_id, address_id, assignee, title, purpose, starts_at, ends_at)
  on public.visit_plans to authenticated;
grant update (address_id, assignee, title, purpose, starts_at, ends_at, status, outcome,
              checked_in_at, check_in_lat, check_in_lng)
  on public.visit_plans to authenticated;
revoke all on function public.visit_plans_check_assignee() from public;
