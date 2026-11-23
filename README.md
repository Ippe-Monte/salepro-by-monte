# SalePro by Monte

แอปสำหรับ Sale Engineer (ลูกค้า/พิกัด, แผนเข้าพบ, Job Ticket, Quotation, Stock, DO + โซนจัดส่ง).
Expo (web/Android/iOS) + Neon Postgres (Managed Better Auth + Data API + RLS).
แผนงานและ milestone: โปรเจกต์ Monte App → `milestones/SE_APP_PLAN.md`.

## SE-M1 (this milestone)
Multi-company (multi-tenant) from day one. Each company's data is isolated by `org_id` + Postgres RLS.
- Sign up / sign in / sign out; a new user either **creates a company** (becomes its admin) or **joins with an invite code**.
- Invite: a company admin enters the invitee's email + role and gets a 7-day code. The invitee must be signed in with that same email.
- One user can belong to several companies and switch between them (Account tab).
- Company roles: admin, sales, warehouse, dispatcher, viewer. Admin manages members and company settings.
- Platform admin screen (list companies + member counts, suspend/reactivate). Platform admins see no business data.
- Dashboard is a placeholder until SE-M7.

**Tenancy rule for every later table:** `org_id uuid not null references organizations(id)`, RLS on, policies via `is_org_member(org_id)` / `has_org_role(org_id, ...)`, business keys unique per `(org_id, key)`.

## Setup
1. `cp .env.example .env` (public Neon Auth + Data API URLs only).
2. Apply `db/migrations/0001_foundation.sql` then `0002_multi_tenant.sql` (both already applied to Neon project `aged-darkness-87617333`, branch `main`). `db/tools/split_sql.py` turns a migration into a statement list.
3. Make yourself platform admin after you register (SQL): `insert into platform_admins select id from profiles where email = 'you@example.com';`
4. Neon Console → Auth → add the web origin to trusted domains; consider disabling open sign-up after the admin registers.
5. `npm ci && npm run web`

## Checks
`npm run typecheck` · `npm test` · `npm run export:web`
Database isolation: `db/tests/tenancy_isolation.sql` (27 checks; run only on a disposable Neon branch, see header). Last run: ALL 27 TESTS PASSED.

## Not yet verified
- Live sign-up/sign-in against Neon Auth (needs a browser session; not run from the build environment).
- RLS with real Neon Auth JWTs. The 27 isolation tests impersonate users on a disposable branch by replacing `current_uid()/current_email()`; production reads `auth.user_id()` / `auth.jwt()`.
- Invite security relies on the code AND the signed-in email matching; Neon Auth email verification status was not checked.
- Native (Android/iOS) session persistence: the Better Auth client is cookie-based (risk R1).
- Expo package versions were not cross-checked with `expo install --check` (Expo API unreachable).
