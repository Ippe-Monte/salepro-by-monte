-- SALEPRO by MONTE — 0016 personal profile + electronic business card fields, and profile photo.
alter table public.profiles
  add column if not exists phone text check (char_length(phone) <= 40),
  add column if not exists position text check (char_length(position) <= 120),
  add column if not exists department text check (char_length(department) <= 120),
  add column if not exists line_id text check (char_length(line_id) <= 80),
  add column if not exists website text check (char_length(website) <= 200),
  add column if not exists card_theme text not null default 'blue' check (card_theme in ('blue','dark','green','orange','purple')),
  add column if not exists card_show_logo boolean not null default true,
  add column if not exists card_show_photo boolean not null default true;

grant update (phone, position, department, line_id, website, card_theme, card_show_logo, card_show_photo) on public.profiles to authenticated;

create table public.profile_avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  data bytea not null check (octet_length(data) between 1 and 300000),
  updated_at timestamptz not null default now()
);
alter table public.profile_avatars enable row level security;
create policy profile_avatars_select on public.profile_avatars
  for select to authenticated using (user_id = public.current_uid());
create policy profile_avatars_insert on public.profile_avatars
  for insert to authenticated with check (user_id = public.current_uid());
create policy profile_avatars_update on public.profile_avatars
  for update to authenticated using (user_id = public.current_uid()) with check (user_id = public.current_uid());
create policy profile_avatars_delete on public.profile_avatars
  for delete to authenticated using (user_id = public.current_uid());
grant select, delete on public.profile_avatars to authenticated;
grant insert (user_id, mime, data) on public.profile_avatars to authenticated;
grant update (mime, data) on public.profile_avatars to authenticated;
create trigger profile_avatars_touch before update on public.profile_avatars
  for each row execute function public.touch_updated_at();
