-- SALEPRO by MONTE — 0007 document numbering, job tickets, quotations (SE-M5).
-- Document numbers are assigned by the database (never by the client) and are unique per company and year.
-- Quotation totals are computed by triggers; clients cannot write them. Items are locked once a quotation is sent.

create table public.doc_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null check (doc_type in ('JT','QT','DO')),
  year int not null,
  last_no int not null default 0,
  primary key (org_id, doc_type, year)
);

create function public.next_doc_no(p_org uuid, p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from (now() at time zone 'Asia/Bangkok'))::int;
  n int;
begin
  insert into public.doc_counters (org_id, doc_type, year, last_no)
  values (p_org, p_type, y, 1)
  on conflict (org_id, doc_type, year) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into n;
  return p_type || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;

create function public.set_doc_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.doc_no := public.next_doc_no(new.org_id, tg_argv[0]);
  return new;
end $$;

create table public.job_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_no text not null,
  customer_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 4000),
  source text not null default 'other' check (source in ('phone','email','line','visit','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','done','cancelled')),
  assignee uuid references public.profiles(id),
  due_date date,
  closed_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, customer_id) references public.customers (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id)
);
create index job_tickets_org_status_idx on public.job_tickets (org_id, status, due_date);

create trigger job_tickets_doc_no before insert on public.job_tickets
  for each row execute function public.set_doc_no('JT');
create trigger job_tickets_touch before update on public.job_tickets
  for each row execute function public.touch_updated_at();

create function public.job_tickets_before_update() returns trigger
language plpgsql as $$
begin
  if new.status in ('done','cancelled') and old.status not in ('done','cancelled') then
    new.closed_at := now();
  elsif new.status not in ('done','cancelled') then
    new.closed_at := null;
  end if;
  return new;
end $$;

create trigger job_tickets_status_stamp before update on public.job_tickets
  for each row execute function public.job_tickets_before_update();

create table public.job_ticket_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ticket_id uuid not null,
  kind text not null default 'comment' check (kind in ('created','status','comment')),
  from_status text,
  to_status text,
  body text check (char_length(body) <= 2000),
  created_by uuid default public.current_uid(),
  created_at timestamptz not null default now(),
  check (kind <> 'comment' or char_length(btrim(coalesce(body, ''))) > 0),
  foreign key (org_id, ticket_id) references public.job_tickets (org_id, id) on delete cascade
);
create index job_ticket_events_idx on public.job_ticket_events (org_id, ticket_id, created_at);

create function public.job_ticket_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_ticket_events (org_id, ticket_id, kind, to_status, body)
    values (new.org_id, new.id, 'created', new.status, null);
  elsif new.status is distinct from old.status then
    insert into public.job_ticket_events (org_id, ticket_id, kind, from_status, to_status)
    values (new.org_id, new.id, 'status', old.status, new.status);
  end if;
  return null;
end $$;

create trigger job_tickets_log after insert or update on public.job_tickets
  for each row execute function public.job_ticket_log();

create function public.job_ticket_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'ticket history is append-only' using errcode = '42501';
end $$;

create trigger job_ticket_events_no_change before update or delete on public.job_ticket_events
  for each row execute function public.job_ticket_events_immutable();

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_no text not null,
  customer_id uuid not null,
  address_id uuid,
  ticket_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired','cancelled')),
  valid_until date,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  vat_rate numeric(5,2) not null default 7 check (vat_rate between 0 and 100),
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  note text check (char_length(note) <= 2000),
  terms text check (char_length(terms) <= 2000),
  sent_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, customer_id) references public.customers (org_id, id),
  foreign key (org_id, address_id) references public.customer_addresses (org_id, id),
  foreign key (org_id, ticket_id) references public.job_tickets (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id)
);
create index quotations_org_status_idx on public.quotations (org_id, status, created_at desc);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  quotation_id uuid not null,
  product_id uuid,
  line_no int not null default 1 check (line_no > 0),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  qty numeric(14,3) not null check (qty > 0),
  unit text not null default 'ชิ้น' check (char_length(btrim(unit)) between 1 and 30),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  foreign key (org_id, quotation_id) references public.quotations (org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products (org_id, id)
);
create index quotation_items_idx on public.quotation_items (org_id, quotation_id, line_no);

create trigger quotations_doc_no before insert on public.quotations
  for each row execute function public.set_doc_no('QT');
create trigger quotations_touch before update on public.quotations
  for each row execute function public.touch_updated_at();

create function public.quotations_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare s numeric(14,2);
begin
  if old.status <> 'draft' and (
       new.customer_id is distinct from old.customer_id or new.address_id is distinct from old.address_id
    or new.ticket_id is distinct from old.ticket_id or new.valid_until is distinct from old.valid_until
    or new.discount is distinct from old.discount or new.vat_rate is distinct from old.vat_rate) then
    raise exception 'document is locked' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft' and new.status in ('sent','cancelled'))
      or (old.status = 'sent' and new.status in ('accepted','rejected','expired','cancelled'))
    ) then
      raise exception 'invalid status' using errcode = '23514';
    end if;
  end if;
  select coalesce(sum(line_total), 0) into s from public.quotation_items where quotation_id = new.id;
  new.subtotal := s;
  new.vat_amount := round(greatest(s - new.discount, 0) * new.vat_rate / 100, 2);
  new.total := greatest(s - new.discount, 0) + new.vat_amount;
  if new.status = 'sent' and old.status = 'draft' then
    if s <= 0 or new.discount > s then
      raise exception 'quotation incomplete' using errcode = '23514';
    end if;
    new.sent_at := now();
  end if;
  return new;
end $$;

create trigger quotations_calc before update on public.quotations
  for each row execute function public.quotations_before_update();

create function public.quotation_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare qid uuid;
begin
  qid := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  if (select status from public.quotations where id = qid) <> 'draft' then
    raise exception 'document is locked' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger quotation_items_lock before insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_guard();

create function public.quotation_items_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare qid uuid;
begin
  qid := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  update public.quotations set updated_at = now() where id = qid;
  return null;
end $$;

create trigger quotation_items_after after insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_recalc();

alter table public.doc_counters enable row level security;
alter table public.job_tickets enable row level security;
alter table public.job_ticket_events enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

create policy job_tickets_select on public.job_tickets
  for select to authenticated using (public.is_org_member(org_id));
create policy job_tickets_insert on public.job_tickets
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy job_tickets_update on public.job_tickets
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','sales']));

create policy job_ticket_events_select on public.job_ticket_events
  for select to authenticated using (public.is_org_member(org_id));
create policy job_ticket_events_insert on public.job_ticket_events
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));

create policy quotations_select on public.quotations
  for select to authenticated using (public.is_org_member(org_id));
create policy quotations_insert on public.quotations
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy quotations_update on public.quotations
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','sales']));

create policy quotation_items_select on public.quotation_items
  for select to authenticated using (public.is_org_member(org_id));
create policy quotation_items_insert on public.quotation_items
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy quotation_items_update on public.quotation_items
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','sales']));
create policy quotation_items_delete on public.quotation_items
  for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin','sales']));

revoke all on public.doc_counters, public.job_tickets, public.job_ticket_events, public.quotations, public.quotation_items
  from public, anonymous, authenticated;
grant select on public.job_tickets, public.job_ticket_events, public.quotations, public.quotation_items to authenticated;
grant insert (org_id, customer_id, title, description, source, priority, assignee, due_date)
  on public.job_tickets to authenticated;
grant update (title, description, source, priority, status, assignee, due_date)
  on public.job_tickets to authenticated;
grant insert (org_id, ticket_id, body) on public.job_ticket_events to authenticated;
grant insert (org_id, customer_id, address_id, ticket_id, valid_until, discount, vat_rate, note, terms)
  on public.quotations to authenticated;
grant update (address_id, ticket_id, valid_until, discount, vat_rate, note, terms, status)
  on public.quotations to authenticated;
grant insert (org_id, quotation_id, product_id, line_no, description, qty, unit, unit_price)
  on public.quotation_items to authenticated;
grant update (product_id, line_no, description, qty, unit, unit_price) on public.quotation_items to authenticated;
grant delete on public.quotation_items to authenticated;

revoke all on function public.next_doc_no(uuid, text) from public, anonymous, authenticated;
revoke all on function public.set_doc_no() from public;
revoke all on function public.job_tickets_before_update() from public;
revoke all on function public.job_ticket_log() from public;
revoke all on function public.job_ticket_events_immutable() from public;
revoke all on function public.quotations_before_update() from public;
revoke all on function public.quotation_items_guard() from public;
revoke all on function public.quotation_items_recalc() from public;
