-- Tenancy isolation tests. RUN ONLY ON A DISPOSABLE NEON BRANCH, never on production.
-- Step 1 (once per branch): replace the JWT readers so the test can impersonate users.
--   create or replace function public.current_uid() returns uuid language sql stable
--     as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
--   create or replace function public.current_email() returns text language sql stable
--     as $$ select lower(nullif(current_setting('test.email', true), '')) $$;
-- Step 2: run the block below. It always ends with an exception (rolls everything back);
-- the message is either 'ALL n TESTS PASSED' or 'FAIL: <name>'.

do $t$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); p uuid := gen_random_uuid();
  org1 uuid; org2 uuid; v_code1 text; v_code2 text; n int; passed int := 0; ok boolean;
begin
  -- A creates Alpha, B creates Beta -------------------------------------------------------
  perform set_config('test.uid', a::text, true); perform set_config('test.email', 'a@x.co', true);
  execute 'set local role authenticated';
  org1 := public.create_organization('Alpha Co');
  reset role;
  perform set_config('test.uid', b::text, true); perform set_config('test.email', 'b@x.co', true);
  execute 'set local role authenticated';
  org2 := public.create_organization('Beta Co');
  reset role;

  -- T1/T2: each admin sees only their own company --------------------------------------
  perform set_config('test.uid', a::text, true); perform set_config('test.email', 'a@x.co', true);
  execute 'set local role authenticated';
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'FAIL: A sees % orgs (want 1)', n; end if; passed := passed + 1;
  select count(*) into n from public.organizations where id = org2;
  if n <> 0 then raise exception 'FAIL: A sees Beta org'; end if; passed := passed + 1;
  -- T3: memberships of another company invisible
  select count(*) into n from public.memberships where org_id = org2;
  if n <> 0 then raise exception 'FAIL: A sees Beta memberships'; end if; passed := passed + 1;
  -- T4: cannot update another company
  update public.organizations set name = 'hacked' where id = org2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A updated Beta'; end if; passed := passed + 1;
  -- T5: cannot insert memberships directly
  begin
    insert into public.memberships (org_id, user_id, role) values (org2, a, 'admin');
    raise exception 'FAIL: direct membership insert allowed';
  exception when insufficient_privilege then passed := passed + 1; end;
  -- T6: cannot invite into another company / change its members
  begin
    perform public.create_invitation(org2, 'z@x.co', 'sales');
    raise exception 'FAIL: A invited into Beta';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin
    perform public.update_member(org2, b, 'viewer', 'active');
    raise exception 'FAIL: A changed Beta member';
  exception when sqlstate '42501' then passed := passed + 1; end;
  -- T7: last-admin guard
  begin
    perform public.update_member(org1, a, 'viewer', 'active');
    raise exception 'FAIL: last admin demoted';
  exception when sqlstate '23514' then passed := passed + 1; end;
  -- A invites C (sales) and E
  v_code1 := public.create_invitation(org1, 'c@x.co', 'sales');
  v_code2 := public.create_invitation(org1, 'e@x.co', 'sales');
  reset role;

  -- T8: wrong person cannot use the v_code1 (B has a different email) ---------------------
  perform set_config('test.uid', b::text, true); perform set_config('test.email', 'b@x.co', true);
  execute 'set local role authenticated';
  begin
    perform public.accept_invitation(v_code1);
    raise exception 'FAIL: B accepted C invite';
  exception when sqlstate '22023' then passed := passed + 1; end;
  reset role;

  -- T9: C accepts; sees Alpha only, not Beta ---------------------------------------------
  perform set_config('test.uid', c::text, true); perform set_config('test.email', 'c@x.co', true);
  execute 'set local role authenticated';
  if public.accept_invitation(v_code1) <> org1 then raise exception 'FAIL: C wrong org'; end if;
  passed := passed + 1;
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'FAIL: C sees % orgs', n; end if; passed := passed + 1;
  -- T10: sales member has no admin powers
  begin perform public.create_invitation(org1, 'q@x.co', 'sales'); raise exception 'FAIL: sales invited';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.update_member(org1, c, 'admin', 'active'); raise exception 'FAIL: sales self-promoted';
  exception when sqlstate '42501' then passed := passed + 1; end;
  update public.organizations set name = 'hacked' where id = org1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: sales edited company'; end if; passed := passed + 1;
  -- T11: profiles visible only inside shared companies (C sees A and self, not B)
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'FAIL: C sees % profiles (want 2)', n; end if; passed := passed + 1;
  -- T12: replayed v_code1 fails
  begin perform public.accept_invitation(v_code1); raise exception 'FAIL: v_code1 replay';
  exception when sqlstate '22023' then passed := passed + 1; end;
  reset role;

  -- T13: expired invite fails -------------------------------------------------------------
  update public.invitations set expires_at = now() - interval '1 hour' where code = v_code2;
  perform set_config('test.uid', e::text, true); perform set_config('test.email', 'e@x.co', true);
  execute 'set local role authenticated';
  begin perform public.accept_invitation(v_code2); raise exception 'FAIL: expired invite accepted';
  exception when sqlstate '22023' then passed := passed + 1; end;
  -- T14: user without company sees nothing
  perform public.ensure_profile();
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FAIL: loner sees orgs'; end if; passed := passed + 1;
  reset role;

  -- T15: platform admin sees counts, can suspend; sees no business rows ----------------------
  insert into public.profiles (id, email) values (p, 'p@x.co');
  insert into public.platform_admins (user_id) values (p);
  perform set_config('test.uid', p::text, true); perform set_config('test.email', 'p@x.co', true);
  execute 'set local role authenticated';
  select count(*) into n from public.platform_list_orgs();
  if n <> 2 then raise exception 'FAIL: platform sees % orgs', n; end if; passed := passed + 1;
  select count(*) into n from public.memberships;
  if n <> 0 then raise exception 'FAIL: platform sees memberships'; end if; passed := passed + 1;
  perform public.set_org_status(org1, 'suspended');
  reset role;

  -- T16: non-platform cannot suspend; suspended company loses data access ---------------------
  perform set_config('test.uid', a::text, true); perform set_config('test.email', 'a@x.co', true);
  execute 'set local role authenticated';
  begin perform public.set_org_status(org2, 'suspended'); raise exception 'FAIL: A suspended org';
  exception when sqlstate '42501' then passed := passed + 1; end;
  if public.is_org_member(org1) then raise exception 'FAIL: suspended org still member'; end if;
  passed := passed + 1;
  begin perform public.create_invitation(org1, 'r@x.co', 'sales'); raise exception 'FAIL: invite in suspended org';
  exception when sqlstate '42501' then passed := passed + 1; end;
  reset role;
  perform set_config('test.uid', p::text, true); perform set_config('test.email', 'p@x.co', true);
  execute 'set local role authenticated';
  perform public.set_org_status(org1, 'active');
  reset role;

  -- T17: disabling a member removes access ------------------------------------------------------
  perform set_config('test.uid', a::text, true); perform set_config('test.email', 'a@x.co', true);
  execute 'set local role authenticated';
  perform public.update_member(org1, c, 'sales', 'disabled');
  reset role;
  perform set_config('test.uid', c::text, true); perform set_config('test.email', 'c@x.co', true);
  execute 'set local role authenticated';
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FAIL: disabled member sees org'; end if; passed := passed + 1;
  if public.is_org_member(org1) then raise exception 'FAIL: disabled member is member'; end if;
  passed := passed + 1;
  reset role;

  -- T18: anonymous role has no access --------------------------------------------------------------
  execute 'set local role anonymous';
  begin perform count(*) from public.organizations; raise exception 'FAIL: anonymous select';
  exception when insufficient_privilege then passed := passed + 1; end;
  begin perform public.ensure_profile(); raise exception 'FAIL: anonymous rpc';
  exception when insufficient_privilege then passed := passed + 1; end;
  reset role;

  raise exception 'ALL % TESTS PASSED', passed;
end
$t$;
