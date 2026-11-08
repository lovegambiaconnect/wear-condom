-- WEAR CONDOM creator schema starter. Run only in a dedicated WEAR CONDOM Supabase project.
-- Never run this in the Love Gambia Connect project.
create table if not exists public.creator_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 2 and 60),
 bio text not null default '' check(char_length(bio)<=500), avatar_path text, country text,
 is_adult_verified boolean not null default false, identity_verified boolean not null default false,
 consent_reviewed boolean not null default false,
 moderation_status text not null default 'pending' check(moderation_status in('pending','approved','rejected','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.creator_media (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creator_profiles(id) on delete cascade,
 storage_path text not null, media_type text not null check(media_type in('photo','video')),
 moderation_status text not null default 'pending' check(moderation_status in('pending','approved','rejected')),
 consent_confirmed boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.creator_tiers (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creator_profiles(id) on delete cascade,
 tier_name text not null check(char_length(tier_name) between 2 and 40),
 description text not null default '' check(char_length(description)<=300),
 price_minor integer not null default 0 check(price_minor>=0), currency char(3) not null default 'USD',
 is_active boolean not null default false, created_at timestamptz not null default now()
);
alter table public.creator_profiles enable row level security;
alter table public.creator_media enable row level security;
alter table public.creator_tiers enable row level security;
create policy "Public can view approved adult creator profiles" on public.creator_profiles for select using(is_adult_verified and identity_verified and consent_reviewed and moderation_status='approved');
create policy "Creators can insert their own profile" on public.creator_profiles for insert to authenticated with check(auth.uid()=id);
create policy "Creators can update their own profile" on public.creator_profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy "Creators can view their own pending media" on public.creator_media for select to authenticated using(auth.uid()=creator_id);
create policy "Creators can submit their own media for review" on public.creator_media for insert to authenticated with check(auth.uid()=creator_id and consent_confirmed);
create policy "Creators can view their own tiers" on public.creator_tiers for select to authenticated using(auth.uid()=creator_id);
create policy "Creators can manage their own tiers" on public.creator_tiers for all to authenticated using(auth.uid()=creator_id) with check(auth.uid()=creator_id);
-- Configure private storage, signed URLs, adult/identity verification and moderation before uploads.