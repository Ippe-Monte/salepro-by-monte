-- Platform usage monitor: counts and company names only. No product, customer or document content.
create or replace function public.platform_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'users_no_company', (select count(*) from profiles p where not exists (select 1 from memberships m where m.user_id = p.id and m.status = 'active')),
    'orgs', (select count(*) from organizations),
    'orgs_active', (select count(*) from organizations where status = 'active'),
    'members_active', (select count(*) from memberships where status = 'active'),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'status', o.status, 'created_at', o.created_at,
        'members', (select count(*) from memberships m where m.org_id = o.id and m.status = 'active'),
        'owner', (select p.display_name from memberships m join profiles p on p.id = m.user_id where m.org_id = o.id and m.role = 'owner' and m.status = 'active' limit 1),
        'last_activity', greatest(
          (select max(updated_at) from job_tickets t where t.org_id = o.id),
          (select max(updated_at) from customers t where t.org_id = o.id),
          (select max(updated_at) from quotations t where t.org_id = o.id),
          (select max(updated_at) from visit_plans t where t.org_id = o.id))
      ) order by o.created_at desc) from organizations o), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.platform_overview() from public;
grant execute on function public.platform_overview() to authenticated;
