# CornTrack 🌽

**Plan your costs. Track your money. Understand your profit.**

CornTrack is a mobile-first web app that helps corn farmers manage farming finances, watch supply
prices, plan planting budgets, coordinate with other farmers, and compare corn buyers — with all
data stored safely in your own **Supabase** project.

Built with React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase.

**Installable + offline-first:** CornTrack is a Progressive Web App — install it from Chrome onto
your phone or desktop, and record expenses and income even with no signal. Everything you save is
kept on the device first and pushed to Supabase automatically when you reconnect.

---

## Features

| Feature | What it does |
| --- | --- |
| **Login / Sign up** | Email + password accounts via Supabase Auth. Each farmer's data is protected by Row Level Security. |
| **Home** | Estimated profit/loss, quick totals, and the four main features. |
| **Farm Expenses & Profit** | Record expenses by category and harvest income (kg, ₱/kg, deductions). Totals and estimated profit update automatically. |
| **CornCost Planner** | Create planting budgets with planned amounts per category, compare **planned vs actual** spending, and see your **break-even price** per kg. |
| **CornPrice Watch** | Browse and share supply price reports (source + date always shown), view price history charts, and set price alerts. |
| **CornBulk Connect** | Find other farmers for group selling (with a combined-volume calculator), browse buyer listings, **estimate commute costs from GPS distance**, and compare buyers by estimated amount remaining. |
| **Commute expense** | With your farm coordinates and a buyer's coordinates, CornTrack shows both locations, computes the distance (straight line × road factor) and the estimated hauling cost — and saves it as a **Transportation expense** in one tap. |
| **Reports** | Monthly income vs expenses, expense breakdown by category, and CSV export. |
| **Community** | Shared tips, announcements and questions between farmers. |
| **CornTrack Plus** | Voluntary ₱29/month supporter membership via PayPal (placeholder until you connect your PayPal account). **Not a paywall — everything, offline mode included, is free.** |
| **Works offline** | Every record is written to the device first (IndexedDB), shown immediately, and pushed to Supabase when online. A sync banner shows what is waiting; failed pushes can be retried or discarded. |

## 1. Set up the database (one time)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**.
3. Pick the file that matches your situation:
   - **Fresh project** — paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   - **Already ran an earlier CornTrack schema** — paste all of
     [`supabase/migration-2026-11-01.sql`](supabase/migration-2026-11-01.sql) instead. It adds the
     new GPS columns and the `subscriptions` table **without dropping your data**.

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

## 4. Deploy to Vercel

1. Push this folder to a Git repository (GitHub / GitLab / Bitbucket).
2. In Vercel: **Add New → Project → Import** the repo.
3. Framework preset **Vite** is detected automatically (build `npm run build`, output `dist`).
4. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project → Settings → Environment Variables), then **Deploy**.
5. `vercel.json` already contains the SPA rewrite so deep links like `/records` work.

> **Important:** the Supabase keys are baked into the bundle at build time. If you change them
> later, redeploy so the new values are picked up.

After the deploy, open the site in **Chrome**:

- **Android/desktop:** menu ⋮ → **Install app** (or the Install button in More → Install on this device).
- **iOS Safari:** Share → **Add to Home Screen**.

The app must be served over HTTPS (Vercel is) for installation and offline mode to work.

## 5. Offline mode & sync (how it works)

- **Reads:** every successful fetch is cached on the device. Offline, screens show the last saved
  copy instantly (a banner reminds you that you are offline).
- **Writes:** every insert / update / delete goes into a local queue first — the record is safe on
  the device the moment you tap Save, even with zero signal. Rows created offline get a
  client-generated UUID, so the server later stores them under the same id.
- **Sync:** the queue drains automatically on reconnect (plus on app focus and every 20 s).
  Network problems retry later; if the database rejects a change (e.g. a policy issue) it is
  marked failed and shown in the sync banner where you can **retry or discard** it.
- **Install once:** the service worker keeps the app shell cached, so the app opens offline. Open
  each screen once while online so its data is cached too.

## 6. CornTrack Plus subscription (₱29/month)

CornTrack Plus is a **voluntary supporter membership, not a paywall**. Every feature — recording,
reports, prices, buyers, the commute calculator, and **offline mode with automatic sync** — is free
for every farmer, subscribed or not. The ₱29/month exists so users who want to can fund hosting and
development.

The subscription screen (More → CornTrack Plus) shows the plan, records the membership in your own
Supabase (`subscriptions` table) and supports cancel/reactivate.

**PayPal is a placeholder by default** — no money can be collected until you connect an account:

1. Create a business account at [developer.paypal.com](https://developer.paypal.com) and a REST app.
2. In **Subscriptions → Plans**, create a recurring plan: **₱29 PHP / month** and copy its **Plan ID**.
3. Paste both into `src/lib/subscription.ts`:
   - `PAYPAL_CLIENT_ID = "..."` (the REST app's client id)
   - `PAYPAL_PLAN_ID = "..."` (the ₱29/month plan id)
4. Redeploy. The subscribe screen then loads the real PayPal buttons and records the PayPal
   subscription id on approval.

Until then, the button opens a setup sheet with a **test activation** that writes the same
subscription row a real approval would, so you can review the full flow.

## Security model

- The **anon key** is public by design; every table is locked down with **Row Level Security**:
  - Private tables (`expenses`, `incomes`, `budgets`, `budget_items`, `price_alerts`, `profiles`,
    `subscriptions`) are readable/writable **only by their owner**.
  - Shared tables (`product_prices`, `buyers`, `farmer_listings`, `community_posts`) are readable
    by all signed-in farmers, but editable only by their author.
  - Farmer-submitted price reports are always saved as **unverified**; only the service role can
    mark a report verified.
- Passwords never touch the app — Supabase Auth handles them.
- Farm GPS coordinates live only in your private `profiles` row and are never shown to other
  farmers; buyer coordinates are approximate positions contributed with the listing.

## Project structure

```
src/
  App.tsx            Router, providers, auth gate, sync bridge
  auth/              AuthContext (session, sign in / up / out)
  components/        AppShell (header + bottom nav + sync banner), shared UI, toasts
  lib/
    supabase.ts      Supabase client
    offline.ts       Offline-first sync engine (IndexedDB cache + mutation queue)
    idb.ts           Minimal IndexedDB wrapper
    geo.ts           Haversine distance + GPS helpers (commute estimates)
    subscription.ts  ₱29/month plan constants + PayPal ids
    data.ts          React-Query hooks (offline-aware reads and writes)
    types.ts         Database row types (mirror supabase/schema.sql)
    pwa.ts           Install-prompt hook
  pages/             Login, Signup, Home, Records, Planner, Prices, Bulk,
                     Reports, Community, Profile, Subscribe, More, Setup, NotFound
public/
  manifest.webmanifest  PWA manifest
  sw.js                 Service worker (offline app shell)
  icons/                PWA icons (192/512 + maskable)
supabase/
  schema.sql            Complete database schema (fresh projects)
  migration-2026-11-01.sql  Adds GPS columns + subscriptions (keeps existing data)
```

## CornTrack does not guarantee lower costs or higher profits

It gives farmers organized records and useful estimates to make better-informed decisions.
