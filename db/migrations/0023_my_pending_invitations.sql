-- V1.22: lets a signed-in user see which companies invited their e-mail (without the code, which is still required to join).
create or replace function public.my_pending_invitations()
returns table (org_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select g.name, i.role::text, i.expires_at
  from public.invitations i join public.organizations g on g.id = i.org_id
  where i.email = public.current_email() and i.status = 'pending' and i.expires_at > now() and g.status = 'active'
  order by i.created_at desc
$$;
revoke all on function public.my_pending_invitations() from public, anonymous;
grant execute on function public.my_pending_invitations() to authenticated;
