-- V1.23: member visibility, customer archive guard, stock manager, customer account manager, creator-only edits.

-- 1.1 every active member of a company can see the other members
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = public.current_uid() or public.is_org_member(org_id));

-- 2 only owner/admin may archive ("delete") a customer; sales can still add and edit
create or replace function public.customers_archive_guard() returns trigger language plpgsql as $$
begin
  if new.archived_at is distinct from old.archived_at and not public.has_org_role(new.org_id, array['owner','admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists customers_archive_guard on public.customers;
create trigger customers_archive_guard before update on public.customers for each row execute function public.customers_archive_guard();

-- 3 extra permission "stock manager" (granted by owner/admin) for stock quantities
alter table public.memberships add column if not exists stock_manager boolean not null default false;
create or replace function public.can_manage_stock(o uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.memberships m join public.organizations g on g.id = m.org_id
    where m.org_id = o and m.user_id = public.current_uid() and m.status = 'active' and g.status = 'active'
      and (m.role in ('owner','admin','warehouse') or m.stock_manager))
$$;
create or replace function public.set_stock_manager(p_org uuid, p_user uuid, p_value boolean) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.memberships set stock_manager = coalesce(p_value, false) where org_id = p_org and user_id = p_user;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.can_manage_stock(uuid), public.set_stock_manager(uuid, uuid, boolean) from public, anonymous;
grant execute on function public.can_manage_stock(uuid), public.set_stock_manager(uuid, uuid, boolean) to authenticated;

create or replace function public.receive_stock(p_org uuid, p_product uuid, p_qty numeric, p_note text default null) returns stock_balances language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.can_manage_stock(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  return public.apply_stock_movement(p_org, p_product, 'receive', p_qty, 0, 'manual', null, p_note);
end $function$;
create or replace function public.issue_stock(p_org uuid, p_product uuid, p_qty numeric, p_note text default null) returns stock_balances language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.can_manage_stock(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  return public.apply_stock_movement(p_org, p_product, 'issue', -p_qty, 0, 'manual', null, p_note);
end $function$;
create or replace function public.adjust_stock(p_org uuid, p_product uuid, p_new_on_hand numeric, p_note text) returns stock_balances language plpgsql security definer set search_path to 'public' as $function$
declare cur numeric;
begin
  if not public.can_manage_stock(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_new_on_hand is null or p_new_on_hand < 0 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  if p_note is null or char_length(btrim(p_note)) = 0 then raise exception 'note required' using errcode = '22023'; end if;
  select on_hand into cur from public.stock_balances where product_id = p_product and org_id = p_org;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.apply_stock_movement(p_org, p_product, 'adjust', p_new_on_hand - cur, 0, 'count', null, p_note);
end $function$;

-- 4 account manager of a customer (a member of the same company)
alter table public.customers add column if not exists account_manager uuid references public.profiles(id) on delete set null;
update public.customers set account_manager = created_by where account_manager is null;
grant insert (account_manager), update (account_manager) on public.customers to authenticated;
create or replace function public.customers_manager_guard() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' and new.account_manager is null then new.account_manager := public.current_uid(); end if;
  if new.account_manager is not null and (tg_op = 'INSERT' or new.account_manager is distinct from old.account_manager)
     and not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.account_manager and m.status = 'active') then
    raise exception 'invalid account manager' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists customers_manager_guard on public.customers;
create trigger customers_manager_guard before insert or update on public.customers for each row execute function public.customers_manager_guard();

-- 5 Job Ticket and visit plans: only the member who opened them (or owner/admin) can change them
drop policy if exists job_tickets_update on public.job_tickets;
create policy job_tickets_update on public.job_tickets for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales']) and created_by = public.current_uid()))
  with check (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales']) and created_by = public.current_uid()));
drop policy if exists visit_plans_update on public.visit_plans;
create policy visit_plans_update on public.visit_plans for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales']) and created_by = public.current_uid()))
  with check (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales']) and created_by = public.current_uid()));
drop policy if exists job_attachments_insert on public.job_attachments;
create policy job_attachments_insert on public.job_attachments for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales'])
    and exists (select 1 from public.job_tickets t where t.id = ticket_id and t.org_id = job_attachments.org_id and t.created_by = public.current_uid())));
drop policy if exists job_attachments_delete on public.job_attachments;
create policy job_attachments_delete on public.job_attachments for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin']) or (public.has_org_role(org_id, array['sales'])
    and exists (select 1 from public.job_tickets t where t.id = ticket_id and t.org_id = job_attachments.org_id and t.created_by = public.current_uid())));
