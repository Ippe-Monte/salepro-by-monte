-- Fix: the Data API role "authenticated" has no USAGE on schema "auth" (owned by cloud_admin, cannot be granted by the
-- database owner), so every RLS policy that called current_uid()/current_email() failed with "permission denied for schema auth".
-- The two helpers now run as their owner, who can read the caller's JWT. They only return the caller's own identity.
create or replace function public.current_uid() returns uuid
language sql stable security definer set search_path = ''
as $$ select auth.user_id()::uuid $$;

create or replace function public.current_email() returns text
language sql stable security definer set search_path = ''
as $$ select lower(auth.jwt() ->> 'email') $$;
