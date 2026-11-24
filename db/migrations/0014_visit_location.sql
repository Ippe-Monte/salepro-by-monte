-- SALEPRO by MONTE — 0014 per-visit meeting place (calendar/map tabs).
-- Defaults to the customer's address; a visit may override it with its own point.
alter table public.visit_plans
  add column if not exists location_name text check (char_length(location_name) <= 300),
  add column if not exists location_lat numeric(9,6) check (location_lat between -90 and 90),
  add column if not exists location_lng numeric(9,6) check (location_lng between -180 and 180);
alter table public.visit_plans
  add constraint visit_plans_location_pair check ((location_lat is null) = (location_lng is null));
