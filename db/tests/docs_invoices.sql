-- Tests for 0011/0012: branding, logo, product images, document settings and numbering, delivery notes, invoices.
-- RUN ONLY ON A DISPOSABLE NEON BRANCH (needs the current_uid()/current_email() overrides from tenancy_isolation.sql).
-- Always ends with an exception: 'ALL n TESTS PASSED' or 'FAIL: <name>'.

do $t$
declare
  u_a uuid := gen_random_uuid(); u_s uuid := gen_random_uuid(); u_w uuid := gen_random_uuid();
  u_d uuid := gen_random_uuid(); u_v uuid := gen_random_uuid(); u_x uuid := gen_random_uuid();
  org1 uuid; org2 uuid; c_s text; c_w text; c_d text; c_v text;
  c1 uuid; a1 uuid; p1 uuid; p2 uuid; q1 uuid; q2 uuid; do1 uuid; do2 uuid; dn1 uuid; iv1 uuid; iv2 uuid;
  n int; r text; passed int := 0; st text; ts timestamptz; tot numeric; img uuid;
begin
  execute $f$create function pg_temp.u(p_uid uuid, p_email text) returns void language plpgsql as $g$
    begin
      reset role;
      perform set_config('test.uid', p_uid::text, true);
      perform set_config('test.email', p_email, true);
      set local role authenticated;
    end $g$$f$;

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

  -- branding and logo ----------------------------------------------------------------------------------------------
  perform pg_temp.u(u_a, 'a@x.co');
  insert into public.org_branding (org_id, email, tagline) values (org1, 'info@alpha.co', 'We deliver');
  insert into public.org_logos (org_id, mime, data) values (org1, 'image/png', '\x89504e47'::bytea);
  passed := passed + 1;
  begin insert into public.org_logos (org_id, mime, data) values (org2, 'image/png', '\x89'::bytea); raise exception 'FAIL: logo for other org';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  begin update public.org_logos set mime = 'image/jpeg' where org_id = org1; get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: sales changed logo'; end if; passed := passed + 1;
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_a, 'a@x.co');
  begin update public.org_logos set data = repeat('a', 300001)::bytea where org_id = org1; raise exception 'FAIL: oversize logo';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin update public.org_logos set mime = 'image/gif' where org_id = org1; raise exception 'FAIL: gif logo';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  select count(*) into n from public.org_logos; if n <> 0 then raise exception 'FAIL: X sees Alpha logo'; end if; passed := passed + 1;

  -- product images -------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_a, 'a@x.co');
  insert into public.products (org_id, sku, name, price) values (org1, 'P1', 'Pump', 1000) returning id into p1;
  insert into public.products (org_id, sku, name, price) values (org1, 'P2', 'Valve', 10) returning id into p2;
  perform pg_temp.u(u_w, 'w@x.co');
  insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 1, 'image/jpeg', '\xffd8ff'::bytea) returning id into img;
  insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 2, 'image/jpeg', '\xffd8ff'::bytea);
  insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 3, 'image/jpeg', '\xffd8ff'::bytea);
  passed := passed + 1;
  begin insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 4, 'image/jpeg', '\xff'::bytea); raise exception 'FAIL: 4th image';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 1, 'image/jpeg', '\xff'::bytea); raise exception 'FAIL: dup position';
  exception when sqlstate '23505' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.product_images (org_id, product_id, position, mime, data) values (org1, p1, 1, 'image/png', '\xff'::bytea); raise exception 'FAIL: sales added image';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  begin insert into public.product_images (org_id, product_id, position, mime, data) values (org2, p2, 1, 'image/png', '\xff'::bytea); raise exception 'FAIL: image on other org product';
  exception when sqlstate '23503' then passed := passed + 1; end;

  -- document settings and numbering --------------------------------------------------------------------------------
  perform pg_temp.u(u_s, 's@x.co');
  begin insert into public.doc_settings (org_id, doc_type, prefix) values (org1, 'quote', 'QQ'); raise exception 'FAIL: sales wrote settings';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_a, 'a@x.co');
  begin insert into public.doc_settings (org_id, doc_type, prefix) values (org1, 'quote', 'q-1'); raise exception 'FAIL: bad prefix';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin insert into public.doc_settings (org_id, doc_type, prefix, digits) values (org1, 'quote', 'QQ', 7); raise exception 'FAIL: 7 digits';
  exception when sqlstate '23514' then passed := passed + 1; end;
  begin insert into public.doc_settings (org_id, doc_type, prefix, header_color) values (org1, 'quote', 'QQ', 'blue'); raise exception 'FAIL: bad colour';
  exception when sqlstate '23514' then passed := passed + 1; end;
  insert into public.doc_settings (org_id, doc_type, prefix, digits, year_fmt, separator) values (org1, 'quote', 'QQ', 5, 'be', '/');
  begin insert into public.doc_settings (org_id, doc_type, prefix) values (org1, 'invoice', 'QQ'); raise exception 'FAIL: dup prefix';
  exception when sqlstate '23505' then passed := passed + 1; end;
  insert into public.doc_settings (org_id, doc_type, prefix, credit_days) values (org1, 'invoice', 'INV', 45);
  begin insert into public.doc_settings (org_id, doc_type, prefix, sig_labels) values (org1, 'delivery_note', 'DNT', array['a','b','c','d','e']);
    raise exception 'FAIL: 5 signatures';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.customers (org_id, code, name) values (org1, 'C001', 'Acme') returning id into c1;
  insert into public.customer_addresses (org_id, customer_id, label, address_line, latitude, longitude)
    values (org1, c1, 'HQ', '1 Main Rd', 13.75, 100.5) returning id into a1;
  insert into public.quotations (org_id, customer_id) values (org1, c1) returning id into q1;
  select doc_no into r from public.quotations where id = q1;
  if r !~ '^QQ/25[0-9]{2}/00001$' then raise exception 'FAIL: custom quote number %', r; end if; passed := passed + 1;
  insert into public.quotations (org_id, customer_id) values (org1, c1) returning id into q2;
  select doc_no into r from public.quotations where id = q2;
  if r !~ '/00002$' then raise exception 'FAIL: quote counter %', r; end if; passed := passed + 1;
  insert into public.job_tickets (org_id, customer_id, title) values (org1, c1, 'x');
  select doc_no into r from public.job_tickets where org_id = org1;
  if r !~ '^JT-[0-9]{4}-0001$' then raise exception 'FAIL: JT default numbering %', r; end if; passed := passed + 1;
  perform pg_temp.u(u_a, 'a@x.co');
  update public.doc_settings set year_fmt = 'none', separator = '-', digits = 3 where org_id = org1 and doc_type = 'quote';
  perform pg_temp.u(u_s, 's@x.co');
  insert into public.quotations (org_id, customer_id) values (org1, c1) returning id into q2;
  select doc_no into r from public.quotations where id = q2;
  if r <> 'QQ-001' then raise exception 'FAIL: no-year numbering %', r; end if; passed := passed + 1;
  select doc_no into r from public.quotations where id = q1;
  if r !~ '^QQ/' then raise exception 'FAIL: issued number changed %', r; end if; passed := passed + 1;

  -- invoice from quotation ----------------------------------------------------------------------------------------
  insert into public.quotation_items (org_id, quotation_id, product_id, line_no, description, qty, unit_price)
    values (org1, q1, p1, 1, 'Pump', 2, 1000);
  update public.quotations set discount = 100 where id = q1;
  begin perform public.issue_invoice(q1); raise exception 'FAIL: invoice from draft';
  exception when sqlstate '42501' then passed := passed + 1; end;
  update public.quotations set status = 'sent' where id = q1;
  update public.quotations set status = 'accepted' where id = q1;
  begin perform public.issue_invoice(q1); raise exception 'FAIL: sales issued invoice';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_a, 'a@x.co');
  begin perform public.issue_invoice(q2); raise exception 'FAIL: invoice from non-accepted';
  exception when sqlstate '23514' then passed := passed + 1; end;
  iv1 := (public.issue_invoice(q1, 'thanks')).id;
  select doc_no, total, credit_days, (due_date - issue_date) into r, tot, n, st from public.invoices where id = iv1;
  if r !~ '^INV-[0-9]{4}-0001$' then raise exception 'FAIL: invoice number %', r; end if; passed := passed + 1;
  if tot <> 2033.00 then raise exception 'FAIL: invoice total %', tot; end if; passed := passed + 1;
  if n <> 45 or st::int <> 45 then raise exception 'FAIL: credit days % %', n, st; end if; passed := passed + 1;
  select count(*) into n from public.invoice_items where invoice_id = iv1;
  if n <> 1 then raise exception 'FAIL: invoice items %', n; end if; passed := passed + 1;
  begin perform public.issue_invoice(q1); raise exception 'FAIL: second active invoice';
  exception when sqlstate '23505' then passed := passed + 1; end;
  begin update public.invoices set total = 1 where id = iv1; raise exception 'FAIL: invoice total writable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin update public.invoice_items set qty = 99 where invoice_id = iv1; raise exception 'FAIL: invoice item writable';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  select count(*) into n from public.invoices; if n <> 0 then raise exception 'FAIL: X sees invoices'; end if; passed := passed + 1;
  begin perform public.mark_invoice_paid(iv1); raise exception 'FAIL: X paid Alpha invoice';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_s, 's@x.co');
  select count(*) into n from public.invoices; if n <> 1 then raise exception 'FAIL: sales cannot read invoices'; end if; passed := passed + 1;
  begin perform public.mark_invoice_paid(iv1); raise exception 'FAIL: sales paid invoice';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_a, 'a@x.co');
  perform public.mark_invoice_paid(iv1, 'transfer');
  select status into st from public.invoices where id = iv1;
  if st <> 'paid' then raise exception 'FAIL: not paid'; end if; passed := passed + 1;
  begin perform public.cancel_invoice(iv1); raise exception 'FAIL: cancelled a paid invoice';
  exception when sqlstate '23514' then passed := passed + 1; end;

  -- cancelled invoice allows re-issue -----------------------------------------------------------------------------
  update public.quotations set status = 'cancelled' where id = q2;
  iv2 := null;

  -- delivery note ------------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_w, 'w@x.co');
  perform public.receive_stock(org1, p1, 10, 'in');
  perform pg_temp.u(u_d, 'd@x.co');
  insert into public.delivery_orders (org_id, customer_id, address_id, planned_date) values (org1, c1, a1, current_date) returning id into do1;
  insert into public.delivery_order_items (org_id, order_id, product_id, description, qty) values (org1, do1, p1, 'Pump', 2);
  begin perform public.issue_delivery_note(do1); raise exception 'FAIL: DN before dispatch';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform public.mark_do_ready(do1);
  perform public.dispatch_do(do1);
  perform pg_temp.u(u_v, 'v@x.co');
  begin perform public.issue_delivery_note(do1); raise exception 'FAIL: viewer issued DN';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_d, 'd@x.co');
  dn1 := (public.issue_delivery_note(do1)).id;
  select doc_no into r from public.delivery_notes where id = dn1;
  if r !~ '^DN-[0-9]{4}-0001$' then raise exception 'FAIL: DN number %', r; end if; passed := passed + 1;
  if (public.issue_delivery_note(do1)).id <> dn1 then raise exception 'FAIL: second DN created'; end if; passed := passed + 1;
  begin update public.delivery_notes set status = 'received' where id = dn1; raise exception 'FAIL: client updated DN';
  exception when sqlstate '42501' then passed := passed + 1; end;
  begin perform public.receive_delivery_note(dn1, '  '); raise exception 'FAIL: received without name';
  exception when sqlstate '23514' then passed := passed + 1; end;
  perform pg_temp.u(u_x, 'x@x.co');
  begin perform public.receive_delivery_note(dn1, 'Hacker'); raise exception 'FAIL: X received Alpha DN';
  exception when sqlstate '42501' then passed := passed + 1; end;
  perform pg_temp.u(u_d, 'd@x.co');
  perform public.receive_delivery_note(dn1, 'Somchai', 'all good');
  select status into st from public.delivery_orders where id = do1;
  if st <> 'delivered' then raise exception 'FAIL: DO not delivered after receipt (%)', st; end if; passed := passed + 1;
  select status, receiver_name into st, r from public.delivery_notes where id = dn1;
  if st <> 'received' or r <> 'Somchai' then raise exception 'FAIL: DN not received'; end if; passed := passed + 1;
  begin perform public.receive_delivery_note(dn1, 'Again'); raise exception 'FAIL: received twice';
  exception when sqlstate '23514' then passed := passed + 1; end;

  -- dashboard keys ---------------------------------------------------------------------------------------------------
  perform pg_temp.u(u_a, 'a@x.co');
  if (public.dashboard_summary(org1) ->> 'dn_waiting')::int <> 0 then raise exception 'FAIL: dn_waiting'; end if; passed := passed + 1;
  if (public.dashboard_summary(org1) ->> 'invoices_unpaid_value')::numeric <> 0 then raise exception 'FAIL: unpaid value'; end if; passed := passed + 1;

  raise exception 'ALL % TESTS PASSED', passed;
end
$t$;
