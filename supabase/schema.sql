-- ============================================================================
-- CornTrack — Supabase database schema
-- ----------------------------------------------------------------------------
-- Run this whole file in the Supabase SQL Editor (Dashboard → SQL Editor →
-- New query → paste → Run). It is idempotent: running it again recreates the
-- tables from scratch (existing CornTrack data will be dropped).
--
-- Design notes
--   * Private tables (expenses, incomes, budgets, budget_items, price_alerts,
--     profiles) are locked to their owner by Row Level Security.
--   * Shared tables (product_prices, buyers, farmer_listings, community_posts)
--     are readable by every signed-in farmer; writes are limited to your own
--     rows. Farmer-submitted price reports are forced to is_verified = false —
--     only the service role (admin) can mark a report verified.
--   * The app never stores a password — authentication is handled by Supabase
--     Auth (auth.users). A trigger copies the signup metadata into profiles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Clean start (drops are safe on a fresh project)
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.handle_updated_at();

drop table if exists public.community_posts;
drop table if exists public.farmer_listings;
drop table if exists public.buyers;
drop table if exists public.price_alerts;
drop table if exists public.product_prices;
drop table if exists public.budget_items;
drop table if exists public.budgets;
drop table if exists public.incomes;
drop table if exists public.expenses;
drop table if exists public.profiles;

-- ---------------------------------------------------------------------------
-- 1. profiles — one row per signed-up farmer (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '',
  phone         text not null default '',
  province      text not null default '',
  municipality  text not null default '',
  farm_name     text not null default '',
  farm_size_ha  numeric(10, 2) not null default 0 check (farm_size_ha >= 0),
  corn_variety  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Farmer profile — private to each account.';

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keep updated_at fresh
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create a profile when a farmer signs up (copies the signup form data)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, province, municipality)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'province', ''),
    coalesce(new.raw_user_meta_data ->> 'municipality', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. expenses — Farm Expenses & Profit Tracker (private)
--    Categories: Seeds, Fertilizer, Pesticides, Land preparation, Labor,
--    Irrigation or fuel, Harvesting, Transportation, Other farming expenses.
-- ---------------------------------------------------------------------------
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category     text not null default 'Other farming expenses',
  amount       numeric(12, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

comment on table public.expenses is 'Individual farm expense entries (private).';

alter table public.expenses enable row level security;

create policy "expenses: read own"
  on public.expenses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "expenses: insert own"
  on public.expenses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "expenses: update own"
  on public.expenses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "expenses: delete own"
  on public.expenses for delete
  to authenticated
  using (auth.uid() = user_id);

create index expenses_user_date_idx on public.expenses (user_id, expense_date desc);

-- ---------------------------------------------------------------------------
-- 3. incomes — harvest income entries (private)
--    total_amount = quantity_kg * price_per_kg - deductions (computed by app)
-- ---------------------------------------------------------------------------
create table public.incomes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  selling_date  date not null default current_date,
  quantity_kg   numeric(12, 2) not null check (quantity_kg >= 0),
  price_per_kg  numeric(10, 2) not null default 0 check (price_per_kg >= 0),
  deductions    numeric(12, 2) not null default 0 check (deductions >= 0),
  total_amount  numeric(12, 2) not null default 0 check (total_amount >= 0),
  buyer_name    text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

comment on table public.incomes is 'Harvest income entries — quantity, price/kg, deductions (private).';

alter table public.incomes enable row level security;

create policy "incomes: read own"
  on public.incomes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "incomes: insert own"
  on public.incomes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "incomes: update own"
  on public.incomes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "incomes: delete own"
  on public.incomes for delete
  to authenticated
  using (auth.uid() = user_id);

create index incomes_user_date_idx on public.incomes (user_id, selling_date desc);

-- ---------------------------------------------------------------------------
-- 4. budgets + budget_items — CornCost Planner (private)
-- ---------------------------------------------------------------------------
create table public.budgets (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  season_name            text not null default 'New planting season',
  farm_area_ha           numeric(10, 2) not null default 0 check (farm_area_ha >= 0),
  planned_planting_date  date,
  available_budget       numeric(12, 2) not null default 0 check (available_budget >= 0),
  expected_yield_kg      numeric(12, 2) not null default 0 check (expected_yield_kg >= 0),
  expected_price_per_kg  numeric(10, 2) not null default 0 check (expected_price_per_kg >= 0),
  status                 text not null default 'active' check (status in ('active', 'archived')),
  created_at             timestamptz not null default now()
);

comment on table public.budgets is 'Planting-season budgets (private).';

alter table public.budgets enable row level security;

create policy "budgets: read own"
  on public.budgets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "budgets: insert own"
  on public.budgets for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "budgets: update own"
  on public.budgets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budgets: delete own"
  on public.budgets for delete
  to authenticated
  using (auth.uid() = user_id);

create index budgets_user_idx on public.budgets (user_id, created_at desc);

create table public.budget_items (
  id              uuid primary key default gen_random_uuid(),
  budget_id       uuid not null references public.budgets (id) on delete cascade,
  category        text not null,
  planned_amount  numeric(12, 2) not null default 0 check (planned_amount >= 0),
  notes           text not null default ''
);

comment on table public.budget_items is 'Planned amount per expense category for a budget (private via parent budget).';

alter table public.budget_items enable row level security;

create policy "budget_items: read own"
  on public.budget_items for select
  to authenticated
  using (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and b.user_id = auth.uid()
    )
  );

create policy "budget_items: insert own"
  on public.budget_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and b.user_id = auth.uid()
    )
  );

create policy "budget_items: update own"
  on public.budget_items for update
  to authenticated
  using (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and b.user_id = auth.uid()
    )
  );

create policy "budget_items: delete own"
  on public.budget_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and b.user_id = auth.uid()
    )
  );

create index budget_items_budget_idx on public.budget_items (budget_id);

-- ---------------------------------------------------------------------------
-- 5. product_prices — CornPrice Watch (shared read)
--    Farmer-submitted reports are always is_verified = false; only the
--    service role (admin / dashboard) can mark a report verified.
-- ---------------------------------------------------------------------------
create table public.product_prices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  product_name    text not null,
  category        text not null default 'Other supplies',
  price           numeric(12, 2) not null check (price >= 0),
  unit            text not null default 'unit',
  store_or_market text not null default '',
  location        text not null default '',
  source          text not null default 'Farmer-submitted report',
  is_verified     boolean not null default false,
  reported_at     date not null default current_date,
  created_at      timestamptz not null default now()
);

comment on table public.product_prices is 'Shared supply price reports — readable by all farmers.';

alter table public.product_prices enable row level security;

create policy "product_prices: read all"
  on public.product_prices for select
  to authenticated
  using (true);

create policy "product_prices: insert own unverified"
  on public.product_prices for insert
  to authenticated
  with check (auth.uid() = user_id and is_verified = false);

create policy "product_prices: update own unverified"
  on public.product_prices for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_verified = false);

create policy "product_prices: delete own"
  on public.product_prices for delete
  to authenticated
  using (auth.uid() = user_id);

create index product_prices_reported_idx on public.product_prices (reported_at desc);
create index product_prices_category_idx on public.product_prices (category);
create index product_prices_location_idx on public.product_prices (location);

-- ---------------------------------------------------------------------------
-- 6. price_alerts — target prices the farmer is watching (private)
-- ---------------------------------------------------------------------------
create table public.price_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  product_name  text not null,
  target_price  numeric(12, 2) not null check (target_price >= 0),
  unit          text not null default 'kg',
  location      text not null default '',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.price_alerts is 'Price alerts — a product + target price the farmer watches (private).';

alter table public.price_alerts enable row level security;

create policy "price_alerts: read own"
  on public.price_alerts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "price_alerts: insert own"
  on public.price_alerts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "price_alerts: update own"
  on public.price_alerts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "price_alerts: delete own"
  on public.price_alerts for delete
  to authenticated
  using (auth.uid() = user_id);

create index price_alerts_user_idx on public.price_alerts (user_id);

-- ---------------------------------------------------------------------------
-- 7. buyers — CornBulk Connect buyer listings (shared read)
-- ---------------------------------------------------------------------------
create table public.buyers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  buyer_name           text not null,
  contact_name         text not null default '',
  phone                text not null default '',
  email                text not null default '',
  location             text not null default '',
  offered_price_per_kg numeric(10, 2) not null default 0 check (offered_price_per_kg >= 0),
  quantity_kg          numeric(12, 2) not null default 0 check (quantity_kg >= 0),
  min_quantity_kg      numeric(12, 2) not null default 0 check (min_quantity_kg >= 0),
  status               text not null default 'Accepting corn',
  payment_terms        text not null default '',
  deductions_note      text not null default '',
  valid_until          date,
  notes                text not null default '',
  created_at           timestamptz not null default now()
);

comment on table public.buyers is 'Shared corn buyer listings — offers contributed by farmers.';

alter table public.buyers enable row level security;

create policy "buyers: read all"
  on public.buyers for select
  to authenticated
  using (true);

create policy "buyers: insert own"
  on public.buyers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "buyers: update own"
  on public.buyers for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "buyers: delete own"
  on public.buyers for delete
  to authenticated
  using (auth.uid() = user_id);

create index buyers_created_idx on public.buyers (created_at desc);

-- ---------------------------------------------------------------------------
-- 8. farmer_listings — Find Other Farmers for group selling (shared read)
--    Only the info the farmer chose to share is stored — no exact address.
-- ---------------------------------------------------------------------------
create table public.farmer_listings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  farmer_name           text not null,
  location              text not null default '',
  expected_harvest_kg   numeric(12, 2) not null default 0 check (expected_harvest_kg >= 0),
  harvest_date          date,
  preferred_arrangement text not null default 'Group sale',
  contact_info          text not null default '',
  status                text not null default 'Open to group sale',
  notes                 text not null default '',
  created_at            timestamptz not null default now()
);

comment on table public.farmer_listings is 'Shared farmer listings for group selling — general location only.';

alter table public.farmer_listings enable row level security;

create policy "farmer_listings: read all"
  on public.farmer_listings for select
  to authenticated
  using (true);

create policy "farmer_listings: insert own"
  on public.farmer_listings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "farmer_listings: update own"
  on public.farmer_listings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "farmer_listings: delete own"
  on public.farmer_listings for delete
  to authenticated
  using (auth.uid() = user_id);

create index farmer_listings_created_idx on public.farmer_listings (created_at desc);

-- ---------------------------------------------------------------------------
-- 9. community_posts — community board (shared read)
-- ---------------------------------------------------------------------------
create table public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  author_name text not null default '',
  location    text not null default '',
  kind        text not null default 'Tip' check (kind in ('Tip', 'Announcement', 'Question')),
  created_at  timestamptz not null default now()
);

comment on table public.community_posts is 'Shared community posts — tips, announcements, questions.';

alter table public.community_posts enable row level security;

create policy "community_posts: read all"
  on public.community_posts for select
  to authenticated
  using (true);

create policy "community_posts: insert own"
  on public.community_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "community_posts: update own"
  on public.community_posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "community_posts: delete own"
  on public.community_posts for delete
  to authenticated
  using (auth.uid() = user_id);

create index community_posts_created_idx on public.community_posts (created_at desc);

-- ---------------------------------------------------------------------------
-- Done. No sample data is inserted on purpose — the app is designed for real
-- farmer-submitted data. Sign up in the app and everything you enter is
-- stored in these tables.
-- ---------------------------------------------------------------------------
