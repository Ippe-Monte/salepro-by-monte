-- SALEPRO by MONTE — 0020: free-layout business card formats shared by the whole company.
create table public.card_layouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  layout jsonb not null check (jsonb_typeof(layout) = 'object' and octet_length(layout::text) <= 20000),
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create index card_layouts_org_idx on public.card_layouts (org_id, created_at);
alter table public.card_layouts enable row level security;
create policy card_layouts_select on public.card_layouts for select to authenticated using (public.is_org_member(org_id));
create policy card_layouts_insert on public.card_layouts for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales','warehouse','dispatcher']));
create policy card_layouts_delete on public.card_layouts for delete to authenticated
  using (created_by = public.current_uid() or public.has_org_role(org_id, array['owner','admin']));
revoke all on public.card_layouts from public, anonymous, authenticated;
grant select, delete on public.card_layouts to authenticated;
grant insert (org_id, name, layout) on public.card_layouts to authenticated;
alter table public.profiles add column if not exists card_layout_id uuid references public.card_layouts(id) on delete set null;
grant update (card_layout_id) on public.profiles to authenticated;
