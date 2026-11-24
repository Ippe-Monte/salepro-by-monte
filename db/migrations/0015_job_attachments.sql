-- SALEPRO by MONTE — 0015 attachments on job tickets (photos, drawings, PDFs).
create table public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ticket_id uuid not null,
  kind text not null default 'photo' check (kind in ('photo','drawing','file')),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  data bytea not null check (octet_length(data) between 1 and 2000000),
  byte_size int generated always as (octet_length(data)) stored,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, ticket_id) references public.job_tickets (org_id, id) on delete cascade,
  unique (org_id, id)
);
create index job_attachments_idx on public.job_attachments (org_id, ticket_id, created_at);
alter table public.job_attachments enable row level security;
create policy job_attachments_select on public.job_attachments
  for select to authenticated using (public.is_org_member(org_id));
create policy job_attachments_insert on public.job_attachments
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy job_attachments_delete on public.job_attachments
  for delete to authenticated using (public.has_org_role(org_id, array['owner','admin','sales']));
grant select, delete on public.job_attachments to authenticated;
grant insert (org_id, ticket_id, kind, file_name, mime, data) on public.job_attachments to authenticated;
