-- SALEPRO by MONTE — 0008 delivery orders (DO), delivery plan by zone, stock reservation and issue (SE-M6).
-- Status changes happen only through the functions below, so stock and status always move together.
-- The ship-to address is copied onto the DO when it is created, so later edits to the customer do not rewrite history.

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_no text not null,
  customer_id uuid not null,
  address_id uuid not null,
  quotation_id uuid,
  zone_id uuid,
  status text not null default 'draft' check (status in ('draft','ready','dispatched','delivered','cancelled')),
  planned_date date,
  driver text check (char_length(driver) <= 120),
  vehicle text check (char_length(vehicle) <= 60),
  route_seq int check (route_seq > 0),
  ship_address text,
  ship_lat numeric(9,6),
  ship_lng numeric(9,6),
  contact_name text,
  contact_phone text,
  note text check (char_length(note) <= 1000),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, customer_id) references public.customers (org_id, id),
  foreign key (org_id, address_id) references public.customer_addresses (org_id, id),
  foreign key (org_id, quotation_id) references public.quotations (org_id, id),
  foreign key (org_id, zone_id) references public.delivery_zones (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id)
);
create index delivery_orders_plan_idx on public.delivery_orders (org_id, planned_date, zone_id, route_seq);
create index delivery_orders_status_idx on public.delivery_orders (org_id, status);

create table public.delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  qty numeric(14,3) not null check (qty > 0),
  unit text not null default 'ชิ้น' check (char_length(btrim(unit)) between 1 and 30),
  foreign key (org_id, order_id) references public.delivery_orders (org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.products (org_id, id)
);
create index delivery_order_items_idx on public.delivery_order_items (org_id, order_id);

create trigger delivery_orders_doc_no before insert on public.delivery_orders
  for each row execute function public.set_doc_no('DO');
create trigger delivery_orders_touch before update on public.delivery_orders
  for each row execute function public.touch_updated_at();

create function public.delivery_orders_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.customer_addresses;
begin
  select * into a from public.customer_addresses
   where id = new.address_id and org_id = new.org_id and customer_id = new.customer_id;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  new.ship_address := concat_ws(' ', a.address_line, a.subdistrict, a.district, a.province, a.postal_code);
  new.ship_lat := a.latitude;
  new.ship_lng := a.longitude;
  new.contact_name := a.contact_name;
  new.contact_phone := a.contact_phone;
  new.zone_id := coalesce(new.zone_id, a.zone_id);
  new.status := 'draft';
  return new;
end $$;

create trigger delivery_orders_snap before insert on public.delivery_orders
  for each row execute function public.delivery_orders_snapshot();

create function public.delivery_orders_guard() returns trigger
language plpgsql as $$
begin
  if old.status in ('delivered','cancelled') and (
       new.zone_id is distinct from old.zone_id or new.planned_date is distinct from old.planned_date
    or new.driver is distinct from old.driver or new.vehicle is distinct from old.vehicle
    or new.route_seq is distinct from old.route_seq or new.note is distinct from old.note) then
    raise exception 'document is locked' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger delivery_orders_lock before update on public.delivery_orders
  for each row execute function public.delivery_orders_guard();

create function public.delivery_order_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  v_order := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  if (select status from public.delivery_orders where id = v_order) <> 'draft' then
    raise exception 'document is locked' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger delivery_order_items_lock before insert or update or delete on public.delivery_order_items
  for each row execute function public.delivery_order_items_guard();

create function public.mark_do_ready(p_do uuid) returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare d public.delivery_orders; r record;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status <> 'draft' then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  if not exists (select 1 from public.delivery_order_items where order_id = d.id) then
    raise exception 'delivery order empty' using errcode = '23514';
  end if;
  for r in
    select i.product_id, sum(i.qty) as qty
      from public.delivery_order_items i
      join public.products p on p.id = i.product_id
     where i.order_id = d.id and p.track_stock
     group by i.product_id
     order by i.product_id
  loop
    perform public.apply_stock_movement(d.org_id, r.product_id, 'reserve', 0, r.qty, 'DO', d.id, d.doc_no);
  end loop;
  update public.delivery_orders set status = 'ready' where id = d.id returning * into d;
  return d;
end $$;

create function public.dispatch_do(p_do uuid) returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare d public.delivery_orders; r record;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status <> 'ready' then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  for r in
    select i.product_id, sum(i.qty) as qty
      from public.delivery_order_items i
      join public.products p on p.id = i.product_id
     where i.order_id = d.id and p.track_stock
     group by i.product_id
     order by i.product_id
  loop
    perform public.apply_stock_movement(d.org_id, r.product_id, 'issue', -r.qty, -r.qty, 'DO', d.id, d.doc_no);
  end loop;
  update public.delivery_orders set status = 'dispatched', dispatched_at = now() where id = d.id returning * into d;
  return d;
end $$;

create function public.mark_do_delivered(p_do uuid) returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare d public.delivery_orders;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status <> 'dispatched' then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  update public.delivery_orders set status = 'delivered', delivered_at = now() where id = d.id returning * into d;
  return d;
end $$;

create function public.cancel_do(p_do uuid) returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare d public.delivery_orders; r record;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status not in ('draft','ready') then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  if d.status = 'ready' then
    for r in
      select i.product_id, sum(i.qty) as qty
        from public.delivery_order_items i
        join public.products p on p.id = i.product_id
       where i.order_id = d.id and p.track_stock
       group by i.product_id
       order by i.product_id
    loop
      perform public.apply_stock_movement(d.org_id, r.product_id, 'release', 0, -r.qty, 'DO', d.id, d.doc_no);
    end loop;
  end if;
  update public.delivery_orders set status = 'cancelled' where id = d.id returning * into d;
  return d;
end $$;

alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

create policy delivery_orders_select on public.delivery_orders
  for select to authenticated using (public.is_org_member(org_id));
create policy delivery_orders_insert on public.delivery_orders
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse','sales']));
create policy delivery_orders_update on public.delivery_orders
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse']))
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse']));

create policy delivery_order_items_select on public.delivery_order_items
  for select to authenticated using (public.is_org_member(org_id));
create policy delivery_order_items_insert on public.delivery_order_items
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse','sales']));
create policy delivery_order_items_update on public.delivery_order_items
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse','sales']))
  with check (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse','sales']));
create policy delivery_order_items_delete on public.delivery_order_items
  for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin','dispatcher','warehouse','sales']));

revoke all on public.delivery_orders, public.delivery_order_items from public, anonymous, authenticated;
grant select on public.delivery_orders, public.delivery_order_items to authenticated;
grant insert (org_id, customer_id, address_id, quotation_id, zone_id, planned_date, driver, vehicle, note)
  on public.delivery_orders to authenticated;
grant update (zone_id, planned_date, driver, vehicle, route_seq, note) on public.delivery_orders to authenticated;
grant insert (org_id, order_id, product_id, description, qty, unit) on public.delivery_order_items to authenticated;
grant update (product_id, description, qty, unit) on public.delivery_order_items to authenticated;
grant delete on public.delivery_order_items to authenticated;

revoke all on function public.delivery_orders_snapshot() from public;
revoke all on function public.delivery_orders_guard() from public;
revoke all on function public.delivery_order_items_guard() from public;
revoke all on function public.mark_do_ready(uuid) from public;
revoke all on function public.dispatch_do(uuid) from public;
revoke all on function public.mark_do_delivered(uuid) from public;
revoke all on function public.cancel_do(uuid) from public;
grant execute on function public.mark_do_ready(uuid) to authenticated;
grant execute on function public.dispatch_do(uuid) to authenticated;
grant execute on function public.mark_do_delivered(uuid) to authenticated;
grant execute on function public.cancel_do(uuid) to authenticated;
