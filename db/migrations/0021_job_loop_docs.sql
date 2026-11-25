-- V1.18: DO / delivery note are created again from the Job loop (DO reserves stock, delivery note deducts it).
-- Already applied to Neon main through the SQL tool.
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
    select * from public.delivery_orders x
     where x.quotation_id = q.id and x.status <> 'cancelled' order by x.created_at desc limit 1) d on true
  left join lateral (
    select * from public.delivery_notes x where x.order_id = d.id order by x.created_at desc limit 1) n on true
  left join lateral (
    select * from public.invoices x
     where x.quotation_id = q.id and x.status <> 'cancelled' order by x.created_at desc limit 1) i on true;
;

-- Creating the delivery note dispatches a ready DO first (deducts the reserved stock).
create or replace function public.issue_delivery_note(p_do uuid) returns delivery_notes language plpgsql security definer set search_path to 'public' as $function$
declare d public.delivery_orders; n public.delivery_notes;
begin
  select * into d from public.delivery_orders where id = p_do for update;
  if not found or not public.has_org_role(d.org_id, array['owner','admin','dispatcher','warehouse']) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into n from public.delivery_notes where order_id = d.id;
  if found then return n; end if;
  if d.status = 'ready' then perform public.dispatch_do(d.id); select * into d from public.delivery_orders where id = p_do; end if;
  if d.status not in ('dispatched','delivered') then raise exception 'delivery order not dispatched' using errcode = '23514'; end if;
  insert into public.delivery_notes (org_id, order_id) values (d.org_id, d.id) returning * into n;
  return n;
end $function$;
