# MENARC POS (v2)

Fresh rebuild of the offline POS / inventory / dashboard app, wired
correctly against the real Supabase schema (`inventory`, `sales`,
`sale_items`, `profiles`, `returns`).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL and anon/publishable key (Supabase dashboard → Settings → API).
3. Run `supabase.sql` in the Supabase SQL Editor — enables RLS and creates
   the `record_sale()` function checkout depends on.
4. Create at least one staff login: Supabase dashboard → Authentication →
   Add user, then insert a matching row in `profiles` with that user's id.
5. `npm run dev`

## Pages

- `/` — POS Checkout. No login required (shared shop-floor terminal), but
  has zero direct write access to `sales`/`sale_items`/`inventory` at the
  database level — every sale goes through the `record_sale()` RPC, which
  validates stock and writes everything atomically.
- `/inventory` — full catalog CRUD. Requires login.
- `/dashboard` — sales analytics, date-range CSV export. Requires login.
- `/auth/login` — staff sign-in. There's no self-serve sign-up; create staff
  accounts directly in the Supabase dashboard.

## What's different from the old repo

- One env var convention throughout (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`),
  no ANON_KEY/PUBLISHABLE_KEY split.
- Every page uses the real session-aware Supabase client — a logged-in user
  is actually recognized as `authenticated` by RLS, not just by page routing.
- `middleware.ts` denies access to `/inventory` and `/dashboard` by default
  if the Supabase env isn't configured, instead of silently letting everyone
  through.
- Checkout writes to the real `sales` (header) + `sale_items` (lines) tables
  via one atomic RPC, instead of inserting into a shape that doesn't exist.
- `inventory.low_stock_threshold` is a real per-item setting now, not a
  hardcoded `15` sprinkled across three files.
