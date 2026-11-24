-- SALEPRO by MONTE — 0019: DO and delivery notes are now *records* attached to a Job Ticket
-- (issued outside the app, kept here for follow-up); a quotation without a job opens one automatically.

create table public.job_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ticket_id uuid not null,
  kind text not null check (kind in ('do','dn')),
  doc_no text not null check (char_length(btrim(doc_no)) between 1 and 60),
  doc_date date not null default current_date,
  status text not null default 'recorded' check (status in ('recorded','received')),
  receiver_name text check (receiver_name is null or char_length(receiver_name) <= 120),
  note text check (note is null or char_length(note) <= 1000),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  mime text check (mime is null or mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  data bytea check (data is null or octet_length(data) between 1 and 2000000),
  byte_size int generated always as (octet_length(data)) stored,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, ticket_id) references public.job_tickets (org_id, id) on delete cascade,
  unique (org_id, kind, doc_no),
  check ((data is null) = (mime is null))
);
create index job_docs_ticket_idx on public.job_docs (org_id, ticket_id, kind, created_at);
create trigger job_docs_touch before update on public.job_docs for each row execute function public.touch_updated_at();
alter table public.job_docs enable row level security;
create policy job_docs_select on public.job_docs for select to authenticated using (public.is_org_member(org_id));
create policy job_docs_insert on public.job_docs for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales','warehouse','dispatcher']));
create policy job_docs_update on public.job_docs for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales','warehouse','dispatcher']))
  with check (public.has_org_role(org_id, array['owner','admin','sales','warehouse','dispatcher']));
create policy job_docs_delete on public.job_docs for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin']));
revoke all on public.job_docs from public, anonymous, authenticated;
grant select (id, org_id, ticket_id, kind, doc_no, doc_date, status, receiver_name, note, file_name, mime, byte_size, created_by, created_at, updated_at) on public.job_docs to authenticated;
grant select (data) on public.job_docs to authenticated;
grant delete on public.job_docs to authenticated;
grant insert (org_id, ticket_id, kind, doc_no, doc_date, status, receiver_name, note, file_name, mime, data) on public.job_docs to authenticated;
grant update (doc_no, doc_date, status, receiver_name, note, file_name, mime, data) on public.job_docs to authenticated;

-- The pipeline now reads steps 3 and 4 from the records of the job itself.
create or replace view public.job_pipeline with (security_invoker = true) as
select t.id as ticket_id, t.org_id,
       q.id as quote_id, q.doc_no as quote_no, q.status as quote_status, q.total as quote_total,
       d.id as do_id, d.doc_no as do_no, d.status as do_status,
       n.id as dn_id, n.doc_no as dn_no, n.status as dn_status,
       i.id as inv_id, i.doc_no as inv_no, i.status as inv_status, i.total as inv_total, i.due_date as inv_due
  from public.job_tickets t
  left join lateral (
    select * from public.quotations x
     where x.ticket_id = t.id and x.org_id = t.org_id and x.status not in ('cancelled','rejected','expired')
     order by (x.status = 'accepted') desc, x.created_at desc limit 1) q on true
  left join lateral (
    select id, doc_no, status from public.job_docs x
     where x.ticket_id = t.id and x.org_id = t.org_id and x.kind = 'do' order by x.created_at desc limit 1) d on true
  left join lateral (
    select id, doc_no, status from public.job_docs x
     where x.ticket_id = t.id and x.org_id = t.org_id and x.kind = 'dn' order by x.created_at desc limit 1) n on true
  left join lateral (
    select * from public.invoices x
     where x.quotation_id = q.id and x.status <> 'cancelled' order by x.created_at desc limit 1) i on true;

-- A quotation asked for directly by a customer opens its own Job Ticket (fewer steps for the user).
create function public.quotations_auto_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if new.ticket_id is null then
    insert into public.job_tickets (org_id, customer_id, title, source)
    values (new.org_id, new.customer_id, 'ลูกค้าขอใบเสนอราคา', 'other')
    returning id into t;
    new.ticket_id := t;
  end if;
  return new;
end $$;
revoke all on function public.quotations_auto_ticket() from public;
create trigger quotations_auto_ticket before insert on public.quotations
  for each row execute function public.quotations_auto_ticket();
