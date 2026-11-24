-- SALEPRO by MONTE — 0018 job-ticket process flow, free card colour + shared card templates,
-- product datasheets, manual stock issue.

-- 1) Business card: any colour, and a company-shared template made from a photo of an existing card.
create table public.card_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 1 and 1500000),
  text_color text not null default 'dark' check (text_color in ('light','dark')),
  text_pos text not null default 'bl' check (text_pos in ('tl','tr','bl','br','center')),
  panel boolean not null default true,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create index card_templates_org_idx on public.card_templates (org_id, created_at);
alter table public.card_templates enable row level security;
create policy card_templates_select on public.card_templates
  for select to authenticated using (public.is_org_member(org_id));
create policy card_templates_insert on public.card_templates
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','sales','warehouse','dispatcher']));
create policy card_templates_delete on public.card_templates
  for delete to authenticated using (created_by = public.current_uid() or public.has_org_role(org_id, array['owner','admin']));
revoke all on public.card_templates from public, anonymous, authenticated;
grant select, delete on public.card_templates to authenticated;
grant insert (org_id, name, mime, data, text_color, text_pos, panel) on public.card_templates to authenticated;

alter table public.profiles
  add column if not exists card_color text check (card_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists card_template_id uuid references public.card_templates(id) on delete set null;
grant update (card_color, card_template_id) on public.profiles to authenticated;

-- 2) Product datasheets (PDF or image), several per product.
create table public.product_datasheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  data bytea not null check (octet_length(data) between 1 and 2000000),
  byte_size int generated always as (octet_length(data)) stored,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, product_id) references public.products (org_id, id) on delete cascade
);
create index product_datasheets_idx on public.product_datasheets (org_id, product_id, created_at);
alter table public.product_datasheets enable row level security;
create policy product_datasheets_select on public.product_datasheets
  for select to authenticated using (public.is_org_member(org_id));
create policy product_datasheets_insert on public.product_datasheets
  for insert to authenticated with check (public.has_org_role(org_id, array['owner','admin','warehouse']));
create policy product_datasheets_delete on public.product_datasheets
  for delete to authenticated using (public.has_org_role(org_id, array['owner','admin','warehouse']));
revoke all on public.product_datasheets from public, anonymous, authenticated;
grant select, delete on public.product_datasheets to authenticated;
grant insert (org_id, product_id, file_name, mime, data) on public.product_datasheets to authenticated;

-- 3) Manual stock issue (take stock out) next to receive/adjust.
create function public.issue_stock(p_org uuid, p_product uuid, p_qty numeric, p_note text default null)
returns public.stock_balances
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  return public.apply_stock_movement(p_org, p_product, 'issue', -p_qty, 0, 'manual', null, p_note);
end $$;
revoke all on function public.issue_stock(uuid, uuid, numeric, text) from public;
grant execute on function public.issue_stock(uuid, uuid, numeric, text) to authenticated;

-- 4) Process flow: Job Ticket -> quotation -> DO -> delivery note -> invoice.
-- One row per job ticket with the latest live document of each step.
create view public.job_pipeline with (security_invoker = true) as
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
    select * from public.delivery_orders x
     where x.quotation_id = q.id and x.status <> 'cancelled' order by x.created_at desc limit 1) d on true
  left join lateral (
    select * from public.delivery_notes x where x.order_id = d.id order by x.created_at desc limit 1) n on true
  left join lateral (
    select * from public.invoices x
     where x.quotation_id = q.id and x.status <> 'cancelled' order by x.created_at desc limit 1) i on true;
revoke all on public.job_pipeline from public, anonymous, authenticated;
grant select on public.job_pipeline to authenticated;

-- The job's own status follows its documents (the existing event trigger logs every change).
create function public.sync_ticket_from_quote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ticket_id is null then return new; end if;
  if tg_op = 'INSERT' then
    update public.job_tickets set status = 'in_progress'
     where id = new.ticket_id and org_id = new.org_id and status in ('open','waiting_customer');
  elsif new.status is distinct from old.status then
    if new.status = 'sent' then
      update public.job_tickets set status = 'waiting_customer'
       where id = new.ticket_id and org_id = new.org_id and status in ('open','in_progress');
    elsif new.status = 'accepted' then
      update public.job_tickets set status = 'in_progress'
       where id = new.ticket_id and org_id = new.org_id and status in ('open','waiting_customer');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.sync_ticket_from_quote() from public;
create trigger quotations_sync_ticket after insert or update on public.quotations
  for each row execute function public.sync_ticket_from_quote();

create function public.sync_ticket_from_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.job_tickets set status = 'done'
     where org_id = new.org_id and status not in ('done','cancelled')
       and id = (select ticket_id from public.quotations where id = new.quotation_id);
  end if;
  return new;
end $$;
revoke all on function public.sync_ticket_from_invoice() from public;
create trigger invoices_sync_ticket after update on public.invoices
  for each row execute function public.sync_ticket_from_invoice();
