-- SALEPRO by MONTE — 0017 customer contacts (typed, scanned from a business card or e-card) and customer logos.
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  position text check (char_length(position) <= 120),
  department text check (char_length(department) <= 120),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  line_id text check (char_length(line_id) <= 80),
  source text not null default 'typed' check (source in ('typed','card_photo','qr')),
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, customer_id) references public.customers (org_id, id) on delete cascade,
  unique (org_id, id)
);
create index customer_contacts_idx on public.customer_contacts (org_id, customer_id);

create table public.customer_logos (
  customer_id uuid primary key,
  org_id uuid not null,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 1 and 300000),
  updated_at timestamptz not null default now(),
  foreign key (org_id, customer_id) references public.customers (org_id, id) on delete cascade
);
create trigger customer_logos_touch before update on public.customer_logos
  for each row execute function public.touch_updated_at();

alter table public.customer_contacts enable row level security;
alter table public.customer_logos enable row level security;
create policy customer_contacts_select on public.customer_contacts for select to authenticated using (public.is_org_member(org_id));
create policy customer_contacts_insert on public.customer_contacts for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_contacts_delete on public.customer_contacts for delete to authenticated using (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_logos_select on public.customer_logos for select to authenticated using (public.is_org_member(org_id));
create policy customer_logos_insert on public.customer_logos for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_logos_update on public.customer_logos for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales'])) with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy customer_logos_delete on public.customer_logos for delete to authenticated using (public.has_org_role(org_id, array['owner','admin','sales']));
grant select, delete on public.customer_contacts, public.customer_logos to authenticated;
grant insert (org_id, customer_id, name, position, department, phone, email, line_id, source) on public.customer_contacts to authenticated;
grant insert (customer_id, org_id, mime, data) on public.customer_logos to authenticated;
grant update (mime, data) on public.customer_logos to authenticated;
