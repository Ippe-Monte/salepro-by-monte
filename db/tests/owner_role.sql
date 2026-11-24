-- Owner/admin role tests. RUN ONLY ON A DISPOSABLE NEON BRANCH (needs the current_uid()/current_email()
-- test overrides described in tenancy_isolation.sql). Ends with an exception that rolls everything back:
-- 'ALL n TESTS PASSED' or 'FAIL: <name>'.

do $t$
declare
  u_o uuid := gen_random_uuid(); u_ad uuid := gen_random_uuid(); u_s uuid := gen_random_uuid();
  u_o2 uuid := gen_random_uuid(); u_t uuid := gen_random_uuid();
  org uuid; c_ad text; c_s text; c_o2 text; c_t text; c_q text; inv_q uuid; r text; n int; passed int := 0;
begin
  -- O creates the company: must be owner ---------------------------------------------------------
  perform set_config('test.uid', u_o::text, true); perform set_config('test.email', 'o@x.co', true);
  execute 'set local role authenticated';
  org := public.create_organization('Acme');
  select role into r from public.memberships where user_id = u_o and org_id = org;
  if r is distinct from 'owner' then raise exception 'FAIL: creator is % (want owner)', r; end if;
  passed := passed + 1;
  c_ad := public.create_invitation(org, 'ad@x.co', 'admin');
  c_s  := public.create_invitation(org, 's@x.co', 'sales');
  c_t  := public.create_invitation(org, 't@x.co', 'sales');
  c_o2 := public.create_invitation(org, 'o2@x.co', 'owner');
  c_q  := public.create_invitation(org, 'q@x.co', 'owner');
  select id into inv_q from public.invitations where code = c_q;
  -- sole owner cannot demote or leave
  begin perform public.update_member(org, u_o, 'admin', 'active'); raise exception 'FAIL: sole owner demoted';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin perform public.leave_organization(org); raise exception 'FAIL: sole owner left';
  exception when sqlstate '23514' then passed := passed + 1; end;
  reset role;

  -- members join ---------------------------------------------------------------------------------------
  perform set_config('test.uid', u_ad::text, true); perform set_config('test.email', 'ad@x.co', true);
  execute 'set local role authenticated'; perform public.accept_invitation(c_ad); reset role;
  perform set_config('test.uid', u_s::text, true); perform set_config('test.email', 's@x.co', true);
  execute 'set local role authenticated'; perform public.accept_invitation(c_s); reset role;
  perform set_config('test.uid', u_t::text, true); perform set_config('test.email', 't@x.co', true);
  execute 'set local role authenticated'; perform public.accept_invitation(c_t); reset role;

  -- admin powers and limits ------------------------------------------------------------------------------------
  perform set_config('test.uid', u_ad::text, true); perform set_config('test.email', 'ad@x.co', true);
  execute 'set local role authenticated';
  perform public.create_invitation(org, 'n@x.co', 'sales'); passed := passed + 1;
  begin perform public.create_invitation(org, 'n2@x.co', 'owner'); raise exception 'FAIL: admin invited an owner';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.update_member(org, u_o, 'viewer', 'active'); raise exception 'FAIL: admin demoted owner';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.update_member(org, u_o, 'owner', 'disabled'); raise exception 'FAIL: admin disabled owner';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.update_member(org, u_s, 'owner', 'active'); raise exception 'FAIL: admin granted ownership';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.revoke_invitation(inv_q); raise exception 'FAIL: admin revoked owner invite';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform public.update_member(org, u_s, 'warehouse', 'active'); passed := passed + 1;
  update public.organizations set name = 'Acme Ltd' where id = org;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot edit company'; end if; passed := passed + 1;
  select count(*) into n from public.invitations where org_id = org;
  if n = 0 then raise exception 'FAIL: admin cannot see invitations'; end if; passed := passed + 1;
  reset role;

  -- non-admin sees no invitations; member can leave ----------------------------------------------------------------------
  perform set_config('test.uid', u_t::text, true); perform set_config('test.email', 't@x.co', true);
  execute 'set local role authenticated';
  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'FAIL: sales sees invitations'; end if; passed := passed + 1;
  perform public.leave_organization(org);
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FAIL: member who left still sees org'; end if; passed := passed + 1;
  reset role;

  -- handover: second owner joins, first owner steps down then leaves ----------------------------------------------------
  perform set_config('test.uid', u_o2::text, true); perform set_config('test.email', 'o2@x.co', true);
  execute 'set local role authenticated'; perform public.accept_invitation(c_o2); reset role;
  perform set_config('test.uid', u_o::text, true); perform set_config('test.email', 'o@x.co', true);
  execute 'set local role authenticated';
  perform public.update_member(org, u_o, 'admin', 'active'); passed := passed + 1;   -- step down
  begin perform public.update_member(org, u_o2, 'viewer', 'active'); raise exception 'FAIL: ex-owner demoted owner';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform public.leave_organization(org); passed := passed + 1;
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FAIL: ex-owner still sees org'; end if; passed := passed + 1;
  reset role;

  -- new sole owner is protected too; ownership can be passed on ---------------------------------------------------------
  perform set_config('test.uid', u_o2::text, true); perform set_config('test.email', 'o2@x.co', true);
  execute 'set local role authenticated';
  begin perform public.update_member(org, u_o2, 'admin', 'active'); raise exception 'FAIL: new sole owner demoted';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform public.update_member(org, u_ad, 'owner', 'active'); passed := passed + 1;
  perform public.update_member(org, u_o2, 'admin', 'active'); passed := passed + 1;
  reset role;
  perform set_config('test.uid', u_ad::text, true); perform set_config('test.email', 'ad@x.co', true);
  execute 'set local role authenticated';
  select role into r from public.memberships where user_id = u_ad and org_id = org;
  if r is distinct from 'owner' then raise exception 'FAIL: ownership not passed on'; end if; passed := passed + 1;
  reset role;

  raise exception 'ALL % TESTS PASSED', passed;
end
$t$;
