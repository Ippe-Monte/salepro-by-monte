-- SALEPRO by MONTE — 0011 company branding, logo, product images, document settings, configurable numbering.
-- Images are stored resized in the database (max 300 KB each) so no extra storage service is needed.
-- Issued document numbers never change: settings only affect numbers issued afterwards.

create table public.org_branding (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  branch_name text check (char_length(branch_name) <= 120),
  email text check (char_length(email) <= 200),
  website text check (char_length(website) <= 200),
  tagline text check (char_length(tagline) <= 200),
  updated_at timestamptz not null default now()
);

create table public.org_logos (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 1 and 300000),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  position int not null check (position between 1 and 3),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 1 and 300000),
  byte_size int generated always as (octet_length(data)) stored,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, product_id) references public.products (org_id, id) on delete cascade,
  unique (product_id, position),
  unique (org_id, id)
);
create index product_images_idx on public.product_images (org_id, product_id, position);

create table public.doc_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null check (doc_type in ('quote','invoice','delivery_note','delivery_order')),
  title_th text check (char_length(title_th) <= 80),
  title_en text check (char_length(title_en) <= 80),
  prefix text not null check (prefix ~ '^[A-Z0-9]{1,6}$'),
  digits int not null default 4 check (digits between 3 and 6),
  year_fmt text not null default 'ce' check (year_fmt in ('ce','be','none')),
  separator text not null default '-' check (separator in ('-','/','')),
  logo_show boolean not null default true,
  logo_pos text not null default 'left' check (logo_pos in ('left','center','right')),
  header_color text not null default '#2563EB' check (header_color ~ '^#[0-9A-Fa-f]{6}$'),
  col_image boolean not null default false,
  col_code boolean not null default true,
  col_unit boolean not null default true,
  show_prices boolean not null default true,
  validity_days int check (validity_days between 0 and 365),
  credit_days int check (credit_days between 0 and 365),
  vat_rate numeric(5,2) check (vat_rate between 0 and 100),
  notes text check (char_length(notes) <= 1500),
  footer text check (char_length(footer) <= 500),
  sig_labels text[] not null default '{}' check (cardinality(sig_labels) <= 4 and char_length(array_to_string(sig_labels, '|')) <= 260),
  updated_at timestamptz not null default now(),
  primary key (org_id, doc_type)
);

create function public.doc_settings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.doc_type <> 'delivery_order' and new.show_prices is distinct from true and new.doc_type in ('quote','invoice') then
    new.show_prices := true;
  end if;
  if exists (select 1 from public.doc_settings d
              where d.org_id = new.org_id and d.doc_type <> new.doc_type and d.prefix = new.prefix) then
    raise exception 'prefix already used' using errcode = '23505';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger doc_settings_guard before insert or update on public.doc_settings
  for each row execute function public.doc_settings_guard();

create trigger org_branding_touch before update on public.org_branding
  for each row execute function public.touch_updated_at();
create trigger org_logos_touch before update on public.org_logos
  for each row execute function public.touch_updated_at();

alter table public.doc_counters drop constraint doc_counters_doc_type_check;
alter table public.doc_counters add constraint doc_counters_doc_type_check
  check (doc_type in ('JT','QT','DO','IV','DN'));

create or replace function public.next_doc_no(p_org uuid, p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  cy int := extract(year from (now() at time zone 'Asia/Bangkok'))::int;
  s public.doc_settings;
  kind text := case p_type when 'QT' then 'quote' when 'IV' then 'invoice' when 'DN' then 'delivery_note'
                           when 'DO' then 'delivery_order' else null end;
  pre text := p_type; dg int := 4; yf text := 'ce'; sp text := '-';
  cnt_year int; n int; ytxt text;
begin
  if kind is not null then
    select * into s from public.doc_settings where org_id = p_org and doc_type = kind;
    if found then pre := s.prefix; dg := s.digits; yf := s.year_fmt; sp := s.separator; end if;
  end if;
  cnt_year := case when yf = 'none' then 0 else cy end;
  insert into public.doc_counters (org_id, doc_type, year, last_no)
  values (p_org, p_type, cnt_year, 1)
  on conflict (org_id, doc_type, year) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into n;
  ytxt := case yf when 'ce' then cy::text when 'be' then (cy + 543)::text else '' end;
  return pre || case when yf = 'none' then sp else sp || ytxt || sp end || lpad(n::text, dg, '0');
end $$;

alter table public.org_branding enable row level security;
alter table public.org_logos enable row level security;
alter table public.product_images enable row level security;
alter table public.doc_settings enable row level security;

create policy org_branding_select on public.org_branding
  for select to authenticated using (public.is_org_member(org_id));
create policy org_branding_insert on public.org_branding
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin']));
create policy org_branding_update on public.org_branding
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));

create policy org_logos_select on public.org_logos
  for select to authenticated using (public.is_org_member(org_id));
create policy org_logos_insert on public.org_logos
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin']));
create policy org_logos_update on public.org_logos
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));
create policy org_logos_delete on public.org_logos
  for delete to authenticated using (public.has_org_role(org_id, array['owner','admin']));

create policy product_images_select on public.product_images
  for select to authenticated using (public.is_org_member(org_id));
create policy product_images_insert on public.product_images
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','warehouse']));
create policy product_images_update on public.product_images
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','warehouse']))
  with check (public.has_org_role(org_id, array['owner','admin','warehouse']));
create policy product_images_delete on public.product_images
  for delete to authenticated using (public.has_org_role(org_id, array['owner','admin','warehouse']));

create policy doc_settings_select on public.doc_settings
  for select to authenticated using (public.is_org_member(org_id));
create policy doc_settings_insert on public.doc_settings
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin']));
create policy doc_settings_update on public.doc_settings
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));

revoke all on public.org_branding, public.org_logos, public.product_images, public.doc_settings
  from public, anonymous, authenticated;
grant select on public.org_branding, public.org_logos, public.product_images, public.doc_settings to authenticated;
grant insert (org_id, branch_name, email, website, tagline) on public.org_branding to authenticated;
grant update (branch_name, email, website, tagline) on public.org_branding to authenticated;
grant insert (org_id, mime, data) on public.org_logos to authenticated;
grant update (mime, data) on public.org_logos to authenticated;
grant delete on public.org_logos to authenticated;
grant insert (org_id, product_id, position, mime, data) on public.product_images to authenticated;
grant update (position, mime, data) on public.product_images to authenticated;
grant delete on public.product_images to authenticated;
grant insert (org_id, doc_type, title_th, title_en, prefix, digits, year_fmt, separator, logo_show, logo_pos,
  header_color, col_image, col_code, col_unit, show_prices, validity_days, credit_days, vat_rate, notes, footer, sig_labels)
  on public.doc_settings to authenticated;
grant update (title_th, title_en, prefix, digits, year_fmt, separator, logo_show, logo_pos,
  header_color, col_image, col_code, col_unit, show_prices, validity_days, credit_days, vat_rate, notes, footer, sig_labels)
  on public.doc_settings to authenticated;

revoke all on function public.doc_settings_guard() from public;
revoke all on function public.next_doc_no(uuid, text) from public, anonymous, authenticated;
