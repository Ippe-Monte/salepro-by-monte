# SalePro by Monte

แอปสำหรับ Sale Engineer (ลูกค้า/พิกัด, แผนเข้าพบ, Job Ticket, Quotation, Stock, DO + โซนจัดส่ง).
Expo (web/Android/iOS) + Neon Postgres (Managed Better Auth + Data API + RLS).
แผนงานและ milestone: โปรเจกต์ Monte App → `milestones/SE_APP_PLAN.md`.

## SE-M1 (this milestone)
Sign up / sign in / sign out, profile + role, admin approval, dashboard placeholder, user management (admin).
First user to register becomes the active admin; everyone else is `pending` until approved.

## Setup
1. `cp .env.example .env` (public Neon Auth + Data API URLs only).
2. Apply `db/migrations/0001_foundation.sql` to the Neon branch (already applied to project `aged-darkness-87617333`, branch `main`).
3. Neon Console → Auth → add the web origin to trusted domains; consider disabling open sign-up after the admin registers.
4. `npm ci && npm run web`

## Checks
`npm run typecheck` · `npm test` · `npm run export:web`

## Not yet verified
- Live sign-up/sign-in against Neon Auth (needs a browser session; not run from the build environment).
- RLS behaviour with real JWTs (policy/grant structure was inspected in the catalog only).
- Native (Android/iOS) session persistence: the Better Auth client is cookie-based (risk R1).
- Expo package versions were not cross-checked with `expo install --check` (Expo API unreachable).
