-- SALEPRO by MONTE — 0012 delivery notes (ใบส่งของ) and invoices (อินวอยซ์).
-- A delivery note travels with the goods and is signed by the customer on receipt; one per delivery order.
-- An invoice is a billing document created from an accepted quotation. Clients can only read these tables:
-- every change goes through the security definer functions below, which check company and role.

create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_no text not null,
  order_id uuid not null,
  status text not null default 'issued' check (status in ('issued','received')),
  receiver_name text check (char_length(btrim(receiver_name)) between 1 and 120),
  receiver_note text check (char_length(receiver_note) <= 1000),
  received_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, order_id) references public.delivery_orders (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, order_id),
  unique (org_id, id),
  check ((status = 'received') = (received_at is not null and receiver_name is not null))
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_no text not null,
  quotation_id uuid not null,
  customer_id uuid not null,
  address_id uuid,
  status text not null default 'issued' check (status in ('issued','paid','cancelled')),
  issue_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  credit_days int not null default 30 check (credit_days between 0 and 365),
  due_date date not null,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  vat_rate numeric(5,2) not null check (vat_rate between 0 and 100),
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  note text check (char_length(note) <= 2000),
  paid_at timestamptz,
  pay_note text check (char_length(pay_note) <= 500),
  cancel_reason text check (char_length(cancel_reason) <= 500),
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, quotation_id) references public.quotations (org_id, id),
  foreign key (org_id, customer_id) references public.customers (org_id, id),
  foreign key (org_id, address_id) references public.customer_addresses (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id)
);
create unique index invoices_one_active_per_quotation on public.invoices (org_id, quotation_id) where status <> 'cancelled';
create index invoices_status_idx on public.invoices (org_id, status, due_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  invoice_id uuid not null,
  product_id uuid,
  line_no int not null check (line_no > 0),
  description text not null,
  qty numeric(14,3) not null check (qty > 0),
  unit text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products (org_id, id)
);
create index invoice_items_idx on public.invoice_items (org_id, invoice_id, line_no);

create trigger delivery_notes_doc_no before insert on public.delivery_notes
  for each row execute function public.set_doc_no('DN');
create trigger invoices_doc_no before insert on public.invoices
  for each row execute function public.set_doc_no('IV');
create trigger delivery_notes_touch before update on public.delivery_notes
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

create function public.invoices_guard() returns trigger
language plpgsql as $$
begin
  if new.quotation_id is distinct from old.quotation_id or new.customer_id is distinct from old.customer_id
     or new.address_id is distinct from old.address_id or new.discount is distinct from old.discount
     or new.vat_rate is distinct from old.vat_rate or new.subtotal is distinct from old.subtotal
     or new.vat_amount is distinct from old.vat_amount or new.total is distinct from old.total
     or new.issue_date is distinct from old.issue_date or new.due_date is distinct from old.due_date
     or new.doc_no is distinct from old.doc_no then
    raise exception 'document is locked' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (old.status = 'issued' and new.status in ('paid','cancelled')) then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger invoices_lock before update on public.invoices
  for each row execute function public.invoices_guard();

create function public.invoice_items_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'document is locked' using errcode = '23514';
end $$;

create trigger invoice_items_lock before update on public.invoice_items
  for each row execute function public.invoice_items_immutable();

create function public.issue_delivery_note(p_do uuid) returns public.delivery_notes
language plpgsql security definer set search_path = public as $$
declare d public.delivery_orders; n public.delivery_notes;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status not in ('dispatched','delivered') then
    raise exception 'delivery order not dispatched' using errcode = '23514';
  end if;
  select * into n from public.delivery_notes where order_id = d.id;
  if found then return n; end if;
  insert into public.delivery_notes (org_id, order_id) values (d.org_id, d.id) returning * into n;
  return n;
end $$;

create function public.receive_delivery_note(p_dn uuid, p_receiver text, p_note text default null)
returns public.delivery_notes
language plpgsql security definer set search_path = public as $$
declare n public.delivery_notes;
begin
  select * into n from public.delivery_notes where id = p_dn for update;
  if not found or not public.has_org_role(n.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if n.status <> 'issued' then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  if p_receiver is null or char_length(btrim(p_receiver)) = 0 then
    raise exception 'receiver name required' using errcode = '23514';
  end if;
  update public.delivery_notes
     set status = 'received', receiver_name = btrim(p_receiver), receiver_note = nullif(btrim(coalesce(p_note, '')), ''),
         received_at = now()
   where id = n.id returning * into n;
  update public.delivery_orders set status = 'delivered', delivered_at = now()
   where id = n.order_id and status = 'dispatched';
  return n;
end $$;

create function public.issue_invoice(p_quotation uuid, p_note text default null) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare q public.quotations; s public.doc_settings; i public.invoices; cd int; sub numeric(14,2); vat numeric(14,2);
begin
  select * into q from public.quotations where id = p_quotation for update;
  if not found or not public.has_org_role(q.org_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if q.status <> 'accepted' then
    raise exception 'quotation not accepted' using errcode = '23514';
  end if;
  if exists (select 1 from public.invoices where quotation_id = q.id and status <> 'cancelled') then
    raise exception 'invoice already issued' using errcode = '23505';
  end if;
  select * into s from public.doc_settings where org_id = q.org_id and doc_type = 'invoice';
  cd := coalesce(s.credit_days, 30);
  select coalesce(sum(line_total), 0) into sub from public.quotation_items where quotation_id = q.id;
  vat := round(greatest(sub - q.discount, 0) * q.vat_rate / 100, 2);
  insert into public.invoices (org_id, quotation_id, customer_id, address_id, credit_days, due_date, discount, vat_rate,
                               subtotal, vat_amount, total, note)
  values (q.org_id, q.id, q.customer_id, q.address_id, cd, ((now() at time zone 'Asia/Bangkok')::date) + cd, q.discount,
          q.vat_rate, sub, vat, greatest(sub - q.discount, 0) + vat, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into i;
  insert into public.invoice_items (org_id, invoice_id, product_id, line_no, description, qty, unit, unit_price)
  select q.org_id, i.id, product_id, line_no, description, qty, unit, unit_price
    from public.quotation_items where quotation_id = q.id;
  return i;
end $$;

create function public.mark_invoice_paid(p_invoice uuid, p_note text default null) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_org_role(i.org_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invoices set status = 'paid', paid_at = now(), pay_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = i.id returning * into i;
  return i;
end $$;

create function public.cancel_invoice(p_invoice uuid, p_reason text default null) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_org_role(i.org_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invoices set status = 'cancelled', cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = i.id returning * into i;
  return i;
end $$;

create or replace function public.dashboard_summary(p_org uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'low_stock', (select count(*) from public.stock_levels where org_id = p_org and is_low and archived_at is null),
    'open_jobs', (select count(*) from public.job_tickets where org_id = p_org and status not in ('done','cancelled')),
    'overdue_jobs', (select count(*) from public.job_tickets
                      where org_id = p_org and status not in ('done','cancelled')
                        and due_date < (now() at time zone 'Asia/Bangkok')::date),
    'quotes_open_value', (select coalesce(sum(total), 0) from public.quotations where org_id = p_org and status = 'sent'),
    'quotes_won_30d', (select coalesce(sum(total), 0) from public.quotations
                        where org_id = p_org and status = 'accepted' and updated_at > now() - interval '30 days'),
    'visits_today', (select count(*) from public.visit_plans
                      where org_id = p_org and status = 'planned'
                        and starts_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
                        and starts_at < (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') + interval '1 day'),
    'visits_week', (select count(*) from public.visit_plans
                     where org_id = p_org and status = 'planned'
                       and starts_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
                       and starts_at < (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') + interval '7 days'),
    'do_pending', (select count(*) from public.delivery_orders where org_id = p_org and status in ('draft','ready')),
    'do_in_transit', (select count(*) from public.delivery_orders where org_id = p_org and status = 'dispatched'),
    'invoices_unpaid_value', (select coalesce(sum(total), 0) from public.invoices where org_id = p_org and status = 'issued'),
    'invoices_overdue', (select count(*) from public.invoices
                          where org_id = p_org and status = 'issued' and due_date < (now() at time zone 'Asia/Bangkok')::date),
    'dn_waiting', (select count(*) from public.delivery_notes where org_id = p_org and status = 'issued')
  )
$$;

alter table public.delivery_notes enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy delivery_notes_select on public.delivery_notes
  for select to authenticated using (public.is_org_member(org_id));
create policy invoices_select on public.invoices
  for select to authenticated using (public.is_org_member(org_id));
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (public.is_org_member(org_id));

revoke all on public.delivery_notes, public.invoices, public.invoice_items from public, anonymous, authenticated;
grant select on public.delivery_notes, public.invoices, public.invoice_items to authenticated;

revoke all on function public.invoices_guard() from public;
revoke all on function public.invoice_items_immutable() from public;
revoke all on function public.issue_delivery_note(uuid) from public, anonymous;
revoke all on function public.receive_delivery_note(uuid, text, text) from public, anonymous;
revoke all on function public.issue_invoice(uuid, text) from public, anonymous;
revoke all on function public.mark_invoice_paid(uuid, text) from public, anonymous;
revoke all on function public.cancel_invoice(uuid, text) from public, anonymous;
grant execute on function public.issue_delivery_note(uuid) to authenticated;
grant execute on function public.receive_delivery_note(uuid, text, text) to authenticated;
grant execute on function public.issue_invoice(uuid, text) to authenticated;
grant execute on function public.mark_invoice_paid(uuid, text) to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
