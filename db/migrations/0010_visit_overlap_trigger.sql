-- SALEPRO by MONTE — 0010 replace the btree_gist exclusion constraint with a trigger.
-- btree_gist installs hundreds of functions into the public schema, where the Data API could expose them,
-- and Neon does not let us move that extension. The trigger gives the same rule: one assignee cannot have
-- two planned visits that overlap in the same company. An advisory lock makes it safe under concurrency.

alter table public.visit_plans drop constraint visit_plans_org_id_assignee_tstzrange_excl;
drop extension btree_gist;

create function public.visit_plans_no_overlap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'planned' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || ':' || new.assignee::text, 0));
  if exists (
    select 1 from public.visit_plans v
     where v.org_id = new.org_id and v.assignee = new.assignee and v.status = 'planned'
       and v.id <> new.id
       and tstzrange(v.starts_at, v.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'overlapping visit' using errcode = '23P01';
  end if;
  return new;
end $$;

create trigger visit_plans_overlap before insert or update of status, assignee, starts_at, ends_at on public.visit_plans
  for each row execute function public.visit_plans_no_overlap();

revoke all on function public.visit_plans_no_overlap() from public;
