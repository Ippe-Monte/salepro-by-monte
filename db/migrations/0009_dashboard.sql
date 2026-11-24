-- SALEPRO by MONTE — 0009 dashboard summary (SE-M7).
-- Runs as the caller (security invoker), so row level security limits every count to the caller's own company.

create function public.dashboard_summary(p_org uuid) returns jsonb
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
    'do_in_transit', (select count(*) from public.delivery_orders where org_id = p_org and status = 'dispatched')
  )
$$;

revoke all on function public.dashboard_summary(uuid) from public, anonymous;
grant execute on function public.dashboard_summary(uuid) to authenticated;
