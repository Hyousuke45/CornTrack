-- ============================================================================
-- CornTrack — Migration 2026-11-16 (Release 1.3)
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor if your database was created with an
-- earlier schema (you have saved data you want to keep). It adds the barangay
-- column to profiles and nothing else — all changes are additive and safe to
-- run once. On a brand-new project just run schema.sql instead (it already
-- includes this column).
-- ============================================================================

-- 1. Separate barangay field on the farm profile (client request: barangay
--    and municipality are distinct address parts in the Philippines).
--    Existing rows get the empty string — farmers fill it in on the Profile
--    screen at their leisure.
alter table public.profiles
  add column if not exists barangay text not null default '';

-- 2. Recreate the signup trigger so new signups copy the barangay metadata
--    too. The drop+create mirrors schema.sql; it does not touch data.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, province, municipality, barangay)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'province', ''),
    coalesce(new.raw_user_meta_data ->> 'municipality', ''),
    coalesce(new.raw_user_meta_data ->> 'barangay', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
