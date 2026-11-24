-- SALEPRO by MONTE — 0005 products, stock ledger, safety stock (SE-M3).
-- Stock quantities are never edited directly. Every change goes through apply_stock_movement(),
-- which locks the balance row, enforces the limits and appends one immutable ledger row.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null check (char_length(btrim(sku)) between 1 and 60),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  unit text not null default 'ชิ้น' check (char_length(btrim(unit)) between 1 and 30),
  price numeric(14,2) not null default 0 check (price >= 0),
  cost numeric(14,2) not null default 0 check (cost >= 0),
  min_qty numeric(14,3) not null default 0 check (min_qty >= 0),
  track_stock boolean not null default true,
  note text check (char_length(note) <= 1000),
  archived_at timestamptz,
  created_by uuid not null default public.current_uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku),
  unique (org_id, id)
);
create index products_org_name_idx on public.products (org_id, name);

create table public.stock_balances (
  product_id uuid primary key,
  org_id uuid not null,
  on_hand numeric(14,3) not null default 0 check (on_hand >= 0),
  reserved numeric(14,3) not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  check (reserved <= on_hand),
  foreign key (org_id, product_id) references public.products (org_id, id) on delete cascade
);
create index stock_balances_org_idx on public.stock_balances (org_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  kind text not null check (kind in ('receive','issue','adjust','reserve','release')),
  on_hand_delta numeric(14,3) not null default 0,
  reserved_delta numeric(14,3) not null default 0,
  on_hand_after numeric(14,3) not null,
  reserved_after numeric(14,3) not null,
  ref_type text check (char_length(ref_type) <= 40),
  ref_id uuid,
  note text check (char_length(note) <= 500),
  created_by uuid default public.current_uid(),
  created_at timestamptz not null default now(),
  foreign key (org_id, product_id) references public.products (org_id, id) on delete cascade
);
create index stock_movements_product_idx on public.stock_movements (org_id, product_id, created_at desc);

create function public.stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'stock ledger is append-only' using errcode = '42501';
end $$;

create trigger stock_movements_no_update before update or delete on public.stock_movements
  for each row execute function public.stock_movements_immutable();

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create function public.products_make_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_balances (product_id, org_id) values (new.id, new.org_id);
  return new;
end $$;

create trigger products_after_insert after insert on public.products
  for each row execute function public.products_make_balance();

create function public.apply_stock_movement(
  p_org uuid, p_product uuid, p_kind text, p_on_delta numeric, p_res_delta numeric,
  p_ref_type text, p_ref_id uuid, p_note text
) returns public.stock_balances
language plpgsql security definer set search_path = public as $$
declare b public.stock_balances;
begin
  perform 1 from public.products where id = p_product and org_id = p_org;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into b from public.stock_balances where product_id = p_product for update;
  if b.on_hand + p_on_delta < 0 or b.reserved + p_res_delta < 0 or b.reserved + p_res_delta > b.on_hand + p_on_delta then
    raise exception 'insufficient stock' using errcode = '23514';
  end if;
  update public.stock_balances
     set on_hand = on_hand + p_on_delta, reserved = reserved + p_res_delta, updated_at = now()
   where product_id = p_product
   returning * into b;
  insert into public.stock_movements
    (org_id, product_id, kind, on_hand_delta, reserved_delta, on_hand_after, reserved_after, ref_type, ref_id, note)
  values (p_org, p_product, p_kind, p_on_delta, p_res_delta, b.on_hand, b.reserved, p_ref_type, p_ref_id, p_note);
  return b;
end $$;

create function public.receive_stock(p_org uuid, p_product uuid, p_qty numeric, p_note text default null)
returns public.stock_balances
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  return public.apply_stock_movement(p_org, p_product, 'receive', p_qty, 0, 'manual', null, p_note);
end $$;

create function public.adjust_stock(p_org uuid, p_product uuid, p_new_on_hand numeric, p_note text)
returns public.stock_balances
language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  if not public.has_org_role(p_org, array['owner','admin','warehouse']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_new_on_hand is null or p_new_on_hand < 0 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if p_note is null or char_length(btrim(p_note)) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;
  select on_hand into cur from public.stock_balances where product_id = p_product and org_id = p_org;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.apply_stock_movement(p_org, p_product, 'adjust', p_new_on_hand - cur, 0, 'count', null, p_note);
end $$;

create view public.stock_levels with (security_invoker = true) as
select p.id as product_id, p.org_id, p.sku, p.name, p.unit, p.price, p.min_qty, p.track_stock, p.archived_at,
       b.on_hand, b.reserved, b.on_hand - b.reserved as available,
       (p.track_stock and p.min_qty > 0 and b.on_hand - b.reserved <= p.min_qty) as is_low
  from public.products p
  join public.stock_balances b on b.product_id = p.id;

alter table public.products enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;

create policy products_select on public.products
  for select to authenticated using (public.is_org_member(org_id));
create policy products_insert on public.products
  for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin','warehouse']));
create policy products_update on public.products
  for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin','warehouse']))
  with check (public.has_org_role(org_id, array['owner','admin','warehouse']));

create policy stock_balances_select on public.stock_balances
  for select to authenticated using (public.is_org_member(org_id));
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (public.is_org_member(org_id));

revoke all on public.products, public.stock_balances, public.stock_movements, public.stock_levels
  from public, anonymous, authenticated;
grant select on public.products, public.stock_balances, public.stock_movements, public.stock_levels to authenticated;
grant insert (org_id, sku, name, unit, price, cost, min_qty, track_stock, note) on public.products to authenticated;
grant update (sku, name, unit, price, cost, min_qty, track_stock, note, archived_at) on public.products to authenticated;

revoke all on function public.stock_movements_immutable() from public;
revoke all on function public.products_make_balance() from public;
revoke all on function public.apply_stock_movement(uuid, uuid, text, numeric, numeric, text, uuid, text) from public, anonymous, authenticated;
revoke all on function public.receive_stock(uuid, uuid, numeric, text) from public;
revoke all on function public.adjust_stock(uuid, uuid, numeric, text) from public;
grant execute on function public.receive_stock(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, text) to authenticated;
