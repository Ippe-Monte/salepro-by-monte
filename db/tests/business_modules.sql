-- Business module tests (customers, stock, visits, job tickets, quotations, delivery orders, dashboard).
-- RUN ONLY ON A DISPOSABLE NEON BRANCH. Needs the current_uid()/current_email() overrides described in
-- tenancy_isolation.sql. The block always ends with an exception, so everything it created is rolled back:
-- 'ALL n TESTS PASSED' or 'FAIL: <name>' (or the raw database error if something unexpected happened).

do $t$
declare
  u_a uuid := gen_random_uuid(); u_s uuid := gen_random_uuid(); u_w uuid := gen_random_uuid();
  u_d uuid := gen_random_uuid(); u_v uuid := gen_random_uuid(); u_x uuid := gen_random_uuid();
  org1 uuid; org2 uuid; c_s text; c_w text; c_d text; c_v text;
  c1 uuid; a1 uuid; a2 uuid; z1 uuid; p1 uuid; x_cust uuid; x_addr uuid;
  v0 timestamptz := date_trunc('hour', now()) + interval '2 days';
  t1 uuid; q1 uuid; q2 uuid; do1 uuid; do2 uuid; do3 uuid;
  n int; m numeric; r text; passed int := 0; j jsonb; b public.stock_balances;
  sub numeric; vat numeric; tot numeric; lat numeric;
begin
  execute $f$create function pg_temp.u(p_uid uuid, p_email text) returns void language plpgsql as $g$
    begin
      reset role;
      perform set_config('test.uid', p_uid::text, true);
      perform set_config('test.email', p_email, true);
      set local role authenticated;
    end $g$$f$;

  -- setup: A owns Alpha; S sales, W warehouse, D dispatcher, V viewer; X owns Beta -------------------
  perform pg_temp.u(u_a, 'a@x.co');
  org1 := public.create_organization('Alpha Co');
  c_s := public.create_invitation(org1, 's@x.co', 'sales');
  c_w := public.create_invitation(org1, 'w@x.co', 'warehouse');
  c_d := public.create_invitation(org1, 'd@x.co', 'dispatcher');
  c_v := public.create_invitation(org1, 'v@x.co', 'viewer');
  perform pg_temp.u(u_s, 's@x.co'); perform public.accept_invitation(c_s); perform public.ensure_profile();
  perform pg_temp.u(u_w, 'w@x.co'); perform public.accept_invitation(c_w); perform public.ensure_profile();
  perform pg_temp.u(u_d, 'd@x.co'); perform public.accept_invitation(c_d); perform public.ensure_profile();
  perform pg_temp.u(u_v, 'v@x.co'); perform public.accept_invitation(c_v); perform public.ensure_profile();
  perform pg_temp.u(u_x, 'x@x.co'); org2 := public.create_organization('Beta Co'); perform public.ensure_profile();

  -- customers and addresses --------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.customers (org_id, code, name) values (org1, 'C001', 'Acme Customer') returning id into c1;
  passed := passed + 1;
  begin insert into public.customers (org_id, code, name) values (org1, 'C001', 'Dup'); raise exception 'FAIL: duplicate code';
  exception when sqlstate '23505' then passed := passed + 1; end;
  perform pg_temp.u(u_v, 'v@x.co');
  begin insert into public.customers (org_id, code, name) values (org1, 'C002', 'Viewer made'); raise exception 'FAIL: viewer wrote customer';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.customer_addresses (org_id, customer_id, address_line, latitude) values (org1, c1, 'x', 13.7);
    raise exception 'FAIL: lat without lng';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin insert into public.customer_addresses (org_id, customer_id, address_line, latitude, longitude) values (org1, c1, 'x', 91, 100);
    raise exception 'FAIL: lat 91';
  exception when sqlstate '23514' then passed := passed + 1; end;
  insert into public.customer_addresses (org_id, customer_id, label, address_line, province, latitude, longitude)
    values (org1, c1, 'HQ', '1 Main Rd', 'Bangkok', 13.7563, 100.5018) returning id into a1;
  insert into public.customer_addresses (org_id, customer_id, label, address_line) values (org1, c1, 'Branch', '2 Side Rd') returning id into a2;
  perform public.set_default_address(a1);
  perform public.set_default_address(a2);
  select count(*) into n from public.customer_addresses where customer_id = c1 and is_default;
  if n <> 1 then raise exception 'FAIL: % defaults', n; end if; passed := passed + 1;
  perform public.set_default_address(a1);
  perform pg_temp.u(u_v, 'v@x.co');
  begin perform public.set_default_address(a2); raise exception 'FAIL: viewer set default';
  exception when sqlstate '42501' then passed := passed + 1; end;

  -- zones --------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.delivery_zones (org_id, code, name) values (org1, 'N1', 'North'); raise exception 'FAIL: sales made zone';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_d, 'd@x.co');
  insert into public.delivery_zones (org_id, code, name, provinces) values (org1, 'N1', 'North', array['Bangkok']) returning id into z1;
  passed := passed + 1;
  perform pg_temp.u(u_s, 's@x.co');
  update public.customer_addresses set zone_id = z1 where id = a1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: sales could not set zone on address'; end if; passed := passed + 1;

  -- cross-company isolation for customers -----------------------------------------------------------------
  perform pg_temp.u(u_x, 'x@x.co');
  select count(*) into n from public.customers where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha customers'; end if; passed := passed + 1;
  begin insert into public.customers (org_id, code, name) values (org1, 'X1', 'Intruder'); raise exception 'FAIL: X wrote into Alpha';
  exception when sqlstate '42501' then passed := passed + 1; end;
  insert into public.customers (org_id, code, name) values (org2, 'C001', 'Beta Customer') returning id into x_cust;
  passed := passed + 1;
  insert into public.customer_addresses (org_id, customer_id, address_line) values (org2, x_cust, 'Beta St') returning id into x_addr;
  begin insert into public.customer_addresses (org_id, customer_id, address_line) values (org2, c1, 'cross'); raise exception 'FAIL: cross-org customer FK';
  exception when sqlstate '23503' then passed := passed + 1; end;
  reset role; set local role anonymous;
  begin perform count(*) from public.customers; raise exception 'FAIL: anonymous read customers';
  exception when sqlstate '42501' then passed := passed + 1; end;

  -- products and stock ---------------------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.products (org_id, sku, name) values (org1, 'P1', 'Pump'); raise exception 'FAIL: sales made product';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_w, 'w@x.co');
  insert into public.products (org_id, sku, name, price, cost, min_qty) values (org1, 'P1', 'Pump', 1000, 700, 5) returning id into p1;
  select on_hand into m from public.stock_balances where product_id = p1;
  if m is distinct from 0 then raise exception 'FAIL: new product has no zero balance'; end if; passed := passed + 1;
  begin perform public.receive_stock(org1, p1, 0, 'x'); raise exception 'FAIL: receive 0';
  exception when sqlstate '22023' then passed := passed + 1; end;
  b := public.receive_stock(org1, p1, 10, 'first batch');
  if b.on_hand <> 10 then raise exception 'FAIL: on_hand %', b.on_hand; end if; passed := passed + 1;
  begin perform public.adjust_stock(org1, p1, 8, ''); raise exception 'FAIL: adjust without note';
  exception when sqlstate '22023' then passed := passed + 1; end;
  b := public.adjust_stock(org1, p1, 8, 'cycle count');
  if b.on_hand <> 8 then raise exception 'FAIL: adjust result %', b.on_hand; end if; passed := passed + 1;
  select on_hand_delta into m from public.stock_movements where product_id = p1 and kind = 'adjust';
  if m <> -2 then raise exception 'FAIL: adjust delta %', m; end if; passed := passed + 1;
  begin update public.stock_balances set on_hand = 999 where product_id = p1; raise exception 'FAIL: direct balance update';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin insert into public.stock_movements (org_id, product_id, kind, on_hand_after, reserved_after) values (org1, p1, 'receive', 1, 0);
    raise exception 'FAIL: direct ledger insert';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.apply_stock_movement(org1, p1, 'receive', 1, 0, null, null, null); raise exception 'FAIL: internal fn callable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  begin perform public.receive_stock(org1, p1, 1, null); raise exception 'FAIL: sales received stock';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  begin perform public.receive_stock(org1, p1, 1, null); raise exception 'FAIL: X received into Alpha';
  exception when sqlstate '42501' then passed := passed + 1; end;
  select count(*) into n from public.stock_levels where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha stock levels'; end if; passed := passed + 1;
  reset role;
  begin update public.stock_movements set note = 'tamper' where product_id = p1; raise exception 'FAIL: ledger mutable';
  exception when sqlstate '42501' then passed := passed + 1; end;

  -- visits -------------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_s, 'Visit 1', v0, v0 + interval '1 hour');
  passed := passed + 1;
  begin insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_s, 'Overlap', v0 + interval '30 minutes', v0 + interval '90 minutes'); raise exception 'FAIL: overlap allowed';
  exception when sqlstate '23P01' then passed := passed + 1; end;
  insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_s, 'Back to back', v0 + interval '1 hour', v0 + interval '2 hours');
  passed := passed + 1;
  begin insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_d, 'For D', v0 + interval '5 hours', v0 + interval '6 hours'); raise exception 'FAIL: sales assigned another person';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_s, 'Bad range', v0 + interval '8 hours', v0 + interval '7 hours'); raise exception 'FAIL: end before start';
  exception when sqlstate '23514' then passed := passed + 1; end;
  update public.visit_plans set status = 'cancelled' where title = 'Visit 1';
  insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_s, 'Reuse slot', v0, v0 + interval '1 hour');
  passed := passed + 1;
  perform pg_temp.u(u_a, 'a@x.co');
  begin insert into public.visit_plans (org_id, customer_id, assignee, title, starts_at, ends_at)
    values (org1, c1, u_x, 'Outsider', v0 + interval '9 hours', v0 + interval '10 hours'); raise exception 'FAIL: assigned a non-member';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  select count(*) into n from public.visit_plans where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha visits'; end if; passed := passed + 1;

  -- job tickets ----------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_v, 'v@x.co');
  begin insert into public.job_tickets (org_id, customer_id, title) values (org1, c1, 'Viewer job'); raise exception 'FAIL: viewer opened ticket';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.job_tickets (org_id, customer_id, title) values (org1, c1, 'Pump noise') returning id into t1;
  select doc_no into r from public.job_tickets where id = t1;
  if r !~ '^JT-[0-9]{4}-0001$' then raise exception 'FAIL: doc_no %', r; end if; passed := passed + 1;
  insert into public.job_tickets (org_id, customer_id, title) values (org1, c1, 'Second');
  select doc_no into r from public.job_tickets where org_id = org1 and title = 'Second';
  if r !~ '-0002$' then raise exception 'FAIL: second doc_no %', r; end if; passed := passed + 1;
  begin update public.job_tickets set doc_no = 'JT-HACK' where id = t1; raise exception 'FAIL: doc_no editable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  select count(*) into n from public.job_ticket_events where ticket_id = t1 and kind = 'created';
  if n <> 1 then raise exception 'FAIL: created events %', n; end if; passed := passed + 1;
  update public.job_tickets set status = 'in_progress' where id = t1;
  select count(*) into n from public.job_ticket_events where ticket_id = t1 and kind = 'status' and to_status = 'in_progress';
  if n <> 1 then raise exception 'FAIL: status events %', n; end if; passed := passed + 1;
  insert into public.job_ticket_events (org_id, ticket_id, body) values (org1, t1, 'Called customer');
  passed := passed + 1;
  begin insert into public.job_ticket_events (org_id, ticket_id, body) values (org1, t1, '   '); raise exception 'FAIL: blank comment';
  exception when sqlstate '23514' then passed := passed + 1; end;
  update public.job_tickets set status = 'done' where id = t1;
  select count(*) into n from public.job_tickets where id = t1 and closed_at is not null;
  if n <> 1 then raise exception 'FAIL: closed_at not stamped'; end if; passed := passed + 1;
  reset role;
  begin update public.job_ticket_events set body = 'tamper' where ticket_id = t1; raise exception 'FAIL: ticket history mutable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  insert into public.job_tickets (org_id, customer_id, title) values (org2, x_cust, 'Beta job');
  select doc_no into r from public.job_tickets where org_id = org2;
  if r !~ '-0001$' then raise exception 'FAIL: Beta numbering not independent: %', r; end if; passed := passed + 1;
  select count(*) into n from public.job_tickets where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha tickets'; end if; passed := passed + 1;

  -- quotations -------------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.quotations (org_id, customer_id, ticket_id) values (org1, c1, t1) returning id into q1;
  select doc_no into r from public.quotations where id = q1;
  if r !~ '^QT-[0-9]{4}-0001$' then raise exception 'FAIL: quote doc_no %', r; end if; passed := passed + 1;
  insert into public.quotation_items (org_id, quotation_id, product_id, line_no, description, qty, unit_price)
    values (org1, q1, p1, 1, 'Pump', 2, 1000.50);
  insert into public.quotation_items (org_id, quotation_id, line_no, description, qty, unit_price)
    values (org1, q1, 2, 'Install', 1, 99.99);
  select subtotal into sub from public.quotations where id = q1;
  if sub is distinct from 2100.99 then raise exception 'FAIL: subtotal %', sub; end if; passed := passed + 1;
  update public.quotations set discount = 100 where id = q1;
  select subtotal, vat_amount, total into sub, vat, tot from public.quotations where id = q1;
  if sub <> 2100.99 or vat <> 140.07 or tot <> 2141.06 then raise exception 'FAIL: totals % % %', sub, vat, tot; end if; passed := passed + 1;
  begin update public.quotations set total = 1 where id = q1; raise exception 'FAIL: total writable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  insert into public.quotations (org_id, customer_id) values (org1, c1) returning id into q2;
  begin update public.quotations set status = 'sent' where id = q2; raise exception 'FAIL: empty quote sent';
  exception when sqlstate '23514' then passed := passed + 1; end;
  update public.quotations set status = 'sent' where id = q1;
  select count(*) into n from public.quotations where id = q1 and sent_at is not null;
  if n <> 1 then raise exception 'FAIL: sent_at not stamped'; end if; passed := passed + 1;
  begin insert into public.quotation_items (org_id, quotation_id, line_no, description, qty, unit_price) values (org1, q1, 3, 'late', 1, 1);
    raise exception 'FAIL: item added after send';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin update public.quotations set discount = 5 where id = q1; raise exception 'FAIL: discount changed after send';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin update public.quotations set status = 'draft' where id = q1; raise exception 'FAIL: sent back to draft';
  exception when sqlstate '23514' then passed := passed + 1; end;
  update public.quotations set status = 'accepted' where id = q1;
  passed := passed + 1;
  begin update public.quotations set status = 'sent' where id = q1; raise exception 'FAIL: accepted re-sent';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  select count(*) into n from public.quotations where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha quotations'; end if; passed := passed + 1;
  begin insert into public.quotations (org_id, customer_id) values (org2, c1); raise exception 'FAIL: quote for another company customer';
  exception when sqlstate '23503' then passed := passed + 1; end;

  -- delivery orders ------------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_d, 'd@x.co');
  insert into public.delivery_orders (org_id, customer_id, address_id, planned_date) values (org1, c1, a1, current_date) returning id into do1;
  select doc_no, zone_id, ship_lat into r, z1, lat from public.delivery_orders where id = do1;
  if r !~ '^DO-[0-9]{4}-0001$' then raise exception 'FAIL: DO doc_no %', r; end if; passed := passed + 1;
  if z1 is null or lat is distinct from 13.7563 then raise exception 'FAIL: snapshot zone/lat'; end if; passed := passed + 1;
  begin insert into public.delivery_orders (org_id, customer_id, address_id, status) values (org1, c1, a1, 'dispatched'); raise exception 'FAIL: client set status';
  exception when sqlstate '42501' then passed := passed + 1; end;
  insert into public.delivery_order_items (org_id, order_id, product_id, description, qty) values (org1, do1, p1, 'Pump', 5);
  perform pg_temp.u(u_s, 's@x.co');
  update public.customer_addresses set address_line = 'MOVED' where id = a1;
  perform pg_temp.u(u_d, 'd@x.co');
  select ship_address into r from public.delivery_orders where id = do1;
  if r not like '1 Main Rd%' then raise exception 'FAIL: DO snapshot changed: %', r; end if; passed := passed + 1;
  perform pg_temp.u(u_s, 's@x.co');
  begin perform public.mark_do_ready(do1); raise exception 'FAIL: sales marked DO ready';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_d, 'd@x.co');
  perform public.mark_do_ready(do1);
  select status into r from public.delivery_orders where id = do1;
  select reserved, on_hand into m, sub from public.stock_balances where product_id = p1;
  if r <> 'ready' or m <> 5 or sub <> 8 then raise exception 'FAIL: ready state % reserved % on_hand %', r, m, sub; end if; passed := passed + 1;
  begin insert into public.delivery_order_items (org_id, order_id, product_id, description, qty) values (org1, do1, p1, 'late', 1);
    raise exception 'FAIL: item added after ready';
  exception when sqlstate '23514' then passed := passed + 1; end;
  insert into public.delivery_orders (org_id, customer_id, address_id) values (org1, c1, a1) returning id into do2;
  insert into public.delivery_order_items (org_id, order_id, product_id, description, qty) values (org1, do2, p1, 'Pump', 4);
  begin perform public.mark_do_ready(do2); raise exception 'FAIL: reserved more than available';
  exception when sqlstate '23514' then passed := passed + 1; end;
  select status into r from public.delivery_orders where id = do2;
  if r <> 'draft' then raise exception 'FAIL: failed reserve changed status to %', r; end if; passed := passed + 1;
  perform public.cancel_do(do2);
  insert into public.delivery_orders (org_id, customer_id, address_id) values (org1, c1, a1) returning id into do3;
  insert into public.delivery_order_items (org_id, order_id, product_id, description, qty) values (org1, do3, p1, 'Pump', 2);
  perform public.mark_do_ready(do3);
  perform public.cancel_do(do3);
  select reserved into m from public.stock_balances where product_id = p1;
  if m <> 5 then raise exception 'FAIL: cancel did not release reservation, reserved %', m; end if; passed := passed + 1;
  perform pg_temp.u(u_x, 'x@x.co');
  begin perform public.dispatch_do(do1); raise exception 'FAIL: X dispatched Alpha DO';
  exception when sqlstate '42501' then passed := passed + 1; end;
  select count(*) into n from public.delivery_orders where org_id = org1;
  if n <> 0 then raise exception 'FAIL: X sees Alpha DOs'; end if; passed := passed + 1;
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.delivery_orders (org_id, customer_id, address_id) values (org1, c1, x_addr); raise exception 'FAIL: DO used another company address';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_w, 'w@x.co');
  begin perform public.mark_do_delivered(do1); raise exception 'FAIL: delivered before dispatch';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform public.dispatch_do(do1);
  select on_hand, reserved into m, sub from public.stock_balances where product_id = p1;
  if m <> 3 or sub <> 0 then raise exception 'FAIL: after dispatch on_hand % reserved %', m, sub; end if; passed := passed + 1;
  select count(*) into n from public.stock_movements where product_id = p1 and kind = 'issue' and ref_id = do1;
  if n <> 1 then raise exception 'FAIL: issue movement count %', n; end if; passed := passed + 1;
  begin perform public.cancel_do(do1); raise exception 'FAIL: cancelled a dispatched DO';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_d, 'd@x.co');
  perform public.mark_do_delivered(do1);
  select count(*) into n from public.delivery_orders where id = do1 and status = 'delivered' and delivered_at is not null;
  if n <> 1 then raise exception 'FAIL: delivered state'; end if; passed := passed + 1;
  begin update public.delivery_orders set driver = 'late edit' where id = do1; raise exception 'FAIL: delivered DO editable';
  exception when sqlstate '23514' then passed := passed + 1; end;

  -- dashboard ------------------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_a, 'a@x.co');
  j := public.dashboard_summary(org1);
  if (j->>'low_stock')::int <> 1 then raise exception 'FAIL: dashboard low_stock %', j; end if; passed := passed + 1;
  if (j->>'visits_week')::int < 1 then raise exception 'FAIL: dashboard visits %', j; end if; passed := passed + 1;
  if (j->>'do_in_transit')::int <> 0 or (j->>'do_pending')::int <> 0 then raise exception 'FAIL: dashboard DO %', j; end if; passed := passed + 1;
  if (j->>'quotes_won_30d')::numeric <> 2141.06 then raise exception 'FAIL: dashboard won %', j; end if; passed := passed + 1;
  perform pg_temp.u(u_x, 'x@x.co');
  j := public.dashboard_summary(org1);
  if (j->>'low_stock')::int <> 0 or (j->>'open_jobs')::int <> 0 or (j->>'quotes_won_30d')::numeric <> 0 then
    raise exception 'FAIL: X sees Alpha dashboard numbers %', j;
  end if; passed := passed + 1;

  raise exception 'ALL % TESTS PASSED', passed;
end
$t$;
