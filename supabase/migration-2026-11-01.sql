-- ============================================================================
-- CornTrack migration — 2026-11-01
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor if you ALREADY ran the original
-- corntrack schema and have data you want to keep. It adds the new columns
-- and the subscriptions table required by this release WITHOUT dropping or
-- changing any existing row.
--
--   • profiles  + farm_latitude / farm_longitude   (commute estimates)
--   • buyers    + latitude / longitude             (commute estimates)
--   • subscriptions table                          (₱29/month CornTrack Plus)
--
-- Safe to run more than once (everything is IF NOT EXISTS / guarded).
-- ============================================================================

-- 1. Farm GPS coordinates on profiles --------------------------------------
alter table public.profiles
  add column if not exists farm_latitude numeric(9, 6);

alter table public.profiles
  add column if not exists farm_longitude numeric(9, 6);

comment on column public.profiles.farm_latitude is 'Optional GPS latitude of the farm — powers buyer commute distance estimates. Private, never shown to other farmers.';
comment on column public.profiles.farm_longitude is 'Optional GPS longitude of the farm — powers buyer commute distance estimates. Private, never shown to other farmers.';

-- 2. Buyer GPS coordinates on buyers ----------------------------------------
alter table public.buyers
  add column if not exists latitude numeric(9, 6);

alter table public.buyers
  add column if not exists longitude numeric(9, 6);

comment on column public.buyers.latitude is 'Optional approximate GPS latitude of the buyer''s trading post — used for commute distance estimates.';
comment on column public.buyers.longitude is 'Optional approximate GPS longitude of the buyer''s trading post — used for commute distance estimates.';

-- 3. subscriptions table -----------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  plan                   text not null default 'plus',
  status                 text not null default 'active'
                           check (status in ('active', 'canceled', 'past_due', 'incomplete')),
  price_php              numeric(10, 2) not null default 29 check (price_php >= 0),
  currency               text not null default 'PHP',
  billing_interval       text not null default 'monthly',
  paypal_subscription_id text not null default '',
  current_period_start   timestamptz not null default now(),
  current_period_end     timestamptz not null default now() + interval '30 days',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.subscriptions is 'CornTrack Plus memberships (₱29/month) — private to each account. paypal_subscription_id is empty for placeholder test activations.';

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "subscriptions: insert own" on public.subscriptions;
create policy "subscriptions: insert own"
  on public.subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "subscriptions: update own" on public.subscriptions;
create policy "subscriptions: update own"
  on public.subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "subscriptions: delete own" on public.subscriptions;
create policy "subscriptions: delete own"
  on public.subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

-- Done. Rebuild and redeploy the app after running this file.
