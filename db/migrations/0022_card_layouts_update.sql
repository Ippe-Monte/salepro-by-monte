-- V1.19: a saved card format can be saved again under the same name (overwrite) by its creator or an owner/admin.
create policy card_layouts_update on public.card_layouts for update to authenticated
  using (created_by = public.current_uid() or public.has_org_role(org_id, array['owner','admin']))
  with check (created_by = public.current_uid() or public.has_org_role(org_id, array['owner','admin']));
grant update (name, layout) on public.card_layouts to authenticated;
