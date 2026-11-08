-- WEAR CONDOM: allow each signed-in member to create and update only their own creator profile.
-- Run this in Supabase Dashboard > SQL Editor for project cxqijbdtcaqyttbfzqds.
alter table public.adult_creator_profiles enable row level security;

drop policy if exists "creator_profiles_select_own" on public.adult_creator_profiles;
create policy "creator_profiles_select_own"
on public.adult_creator_profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "creator_profiles_insert_own" on public.adult_creator_profiles;
create policy "creator_profiles_insert_own"
on public.adult_creator_profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "creator_profiles_update_own" on public.adult_creator_profiles;
create policy "creator_profiles_update_own"
on public.adult_creator_profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Approved profiles are visible publicly only after all review flags are true.
drop policy if exists "creator_profiles_public_approved" on public.adult_creator_profiles;
create policy "creator_profiles_public_approved"
on public.adult_creator_profiles for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and is_adult_verified = true
  and identity_verified = true
  and consent_reviewed = true
);
