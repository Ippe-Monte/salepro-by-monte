-- SALEPRO by MONTE — 0004 customers, addresses with coordinates, delivery zones (SE-M2).
-- Every row carries org_id. Cross-table references use composite keys (org_id, id) so a row can
-- never point at another company's row. Writes go straight through the Data API under RLS.

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  provinces text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  tax_id text check (char_length(tax_id) <= 40),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  note text check (char_length(note) <= 1000),
  archived_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);
create index customers_org_name_idx on public.customers (org_id, name);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid not null,
  label text not null default 'สำนักงานใหญ่' check (char_length(btrim(label)) between 1 and 80),
  address_line text not null check (char_length(btrim(address_line)) between 1 and 500),
  subdistrict text check (char_length(subdistrict) <= 120),
  district text check (char_length(district) <= 120),
  province text check (char_length(province) <= 120),
  postal_code text check (char_length(postal_code) <= 10),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  contact_name text check (char_length(contact_name) <= 120),
  contact_phone text check (char_length(contact_phone) <= 40),
  is_default boolean not null default false,
  zone_id uuid,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  foreign key (org_id, customer_id) references public.customers (org_id, id) on delete cascade,
  foreign key (org_id, zone_id) references public.delivery_zones (org_id, id),
  unique (org_id, id)
);
create index customer_addresses_customer_idx on public.customer_addresses (org_id, customer_id);
create unique index customer_addresses_one_default on public.customer_addresses (customer_id) where is_default;

create trigger delivery_zones_touch before update on public.delivery_zones
  for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger customer_addresses_touch before update on public.customer_addresses
  for each row execute function public.touch_updated_at();

-- Make one address the default for its customer (clears the previous default in the same statement).
create or replace function public.set_default_address(p_address uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.customer_addresses;
begin
  select * into a from public.customer_addresses where id = p_address;
  if not found or not public.has_org_role(a.org_id, array['owner','admin','sales']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.customer_addresses set is_default = false
   where customer_id = a.customer_id and is_default and id <> a.id;
  update public.customer_addresses set is_default = true where id = a.id;
end $$;

alter table public.delivery_zones enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

create policy delivery_zones_select on public.delivery_zones
  for select to authenticated using (public.is_org_member(org_id));
create policy delivery_zones_insert on public.delivery_zones
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher']));
create policy delivery_zones_update on public.delivery_zones
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','dispatcher']))
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher']));
create policy delivery_zones_delete on public.delivery_zones
  for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin','dispatcher']));

create policy customers_select on public.customers
  for select to authenticated using (public.is_org_member(org_id));
create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customers_update on public.customers
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','sales']));

create policy customer_addresses_select on public.customer_addresses
  for select to authenticated using (public.is_org_member(org_id));
create policy customer_addresses_insert on public.customer_addresses
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_addresses_update on public.customer_addresses
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_addresses_delete on public.customer_addresses
  for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']));

revoke all on public.delivery_zones, public.customers, public.customer_addresses
  from public, anonymous, authenticated;
grant select on public.delivery_zones, public.customers, public.customer_addresses to authenticated;
grant insert (org_id, code, name, provinces) on public.delivery_zones to authenticated;
grant update (code, name, provinces) on public.delivery_zones to authenticated;
grant delete on public.delivery_zones to authenticated;
grant insert (org_id, code, name, tax_id, phone, email, note) on public.customers to authenticated;
grant update (code, name, tax_id, phone, email, note, archived_at) on public.customers to authenticated;
grant insert (org_id, customer_id, label, address_line, subdistrict, district, province, postal_code,
              latitude, longitude, contact_name, contact_phone, zone_id, note)
  on public.customer_addresses to authenticated;
grant update (label, address_line, subdistrict, district, province, postal_code,
              latitude, longitude, contact_name, contact_phone, zone_id, note)
  on public.customer_addresses to authenticated;
grant delete on public.customer_addresses to authenticated;

revoke all on function public.set_default_address(uuid) from public;
grant execute on function public.set_default_address(uuid) to authenticated;
