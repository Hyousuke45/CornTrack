# CornTrack 🌽

**Plan your costs. Track your money. Understand your profit.**

CornTrack is a mobile-first web app that helps corn farmers manage farming finances, watch supply
prices, plan planting budgets, coordinate with other farmers, and compare corn buyers — with all
data stored safely in your own **Supabase** project.

Built with React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase.

---

## Features

| Feature | What it does |
| --- | --- |
| **Login / Sign up** | Email + password accounts via Supabase Auth. Each farmer's data is protected by Row Level Security. |
| **Home** | Estimated profit/loss, quick totals, and the four main features. |
| **Farm Expenses & Profit** | Record expenses by category and harvest income (kg, ₱/kg, deductions). Totals and estimated profit update automatically. |
| **CornCost Planner** | Create planting budgets with planned amounts per category, compare **planned vs actual** spending, and see your **break-even price** per kg. |
| **CornPrice Watch** | Browse and share supply price reports (source + date always shown), view price history charts, and set price alerts. |
| **CornBulk Connect** | Find other farmers for group selling (with a combined-volume calculator), browse buyer listings, estimate transport costs, and compare buyers by estimated amount remaining. |
| **Reports** | Monthly income vs expenses, expense breakdown by category, and CSV export. |
| **Community** | Shared tips, announcements and questions between farmers. |

## 1. Set up the database (one time)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   This creates all tables, Row Level Security policies, indexes and triggers.

## 2. Connect the app

1. Copy `.env.example` to `.env`:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

2. Get both values from **Supabase → Project Settings → API** (Project URL + anon public key).

## 3. Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Sign up with your name, email, password and farm location, then start recording.

## 4. Deploy

The app is a static site (`npm run build` → `dist/`). Works out of the box with:

- **Vercel** — import the repo; `vercel.json` (SPA rewrites) is included.
- **Netlify** — build command `npm run build`, publish directory `dist`; `_redirects` is included.
- Any static host — upload `dist/` with a SPA fallback to `index.html`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in your host's
dashboard, then run the build there.

> **Note on email confirmation:** by default Supabase asks new users to confirm their email. To
> let farmers log in immediately during a demo, turn off **Authentication → Providers → Email →
> Confirm email** in the Supabase dashboard.

## Security model

- The **anon key** is public by design; every table is locked down with **Row Level Security**:
  - Private tables (`expenses`, `incomes`, `budgets`, `budget_items`, `price_alerts`, `profiles`)
    are readable/writable **only by their owner**.
  - Shared tables (`product_prices`, `buyers`, `farmer_listings`, `community_posts`) are readable
    by all signed-in farmers, but editable only by their author.
  - Farmer-submitted price reports are always saved as **unverified**; only the service role can
    mark a report verified.
- Passwords never touch the app — Supabase Auth handles them.

## Project structure

```
src/
  App.tsx            Router, providers, auth gate
  auth/              AuthContext (session, sign in / up / out)
  components/        AppShell (header + bottom nav), shared UI, toasts
  lib/               supabase client, DB types, react-query data hooks, formatting
  pages/             Login, Signup, Home, Records, Planner, Prices, Bulk,
                     Reports, Community, Profile, More, Setup, NotFound
supabase/schema.sql  Complete database schema (run in Supabase SQL Editor)
```

## CornTrack does not guarantee lower costs or higher profits

It gives farmers organized records and useful estimates to make better-informed decisions.
