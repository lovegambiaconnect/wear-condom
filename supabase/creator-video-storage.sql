-- WEAR CONDOM private creator-video uploads.
-- Run this in the WEAR CONDOM Supabase SQL Editor only.
-- Files remain private; creators cannot publish their own videos.

-- Bring the existing media table up to the schema expected by this policy.
alter table public.adult_creator_media
  add column if not exists consent_confirmed boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-videos',
  'creator-videos',
  false,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']::text[];

-- Uploads are allowed only into the signed-in creator's own folder,
-- and only after age, identity, consent, account approval and active paid membership checks.
drop policy if exists "Approved creators upload their own videos" on storage.objects;
create policy "Approved creators upload their own videos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'creator-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
  and exists (
    select 1 from public.wear_active_memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.starts_at <= now()
      and m.expires_at > now()
  )
);

drop policy if exists "Creators view their own private videos" on storage.objects;
create policy "Creators view their own private videos"
on storage.objects for select to authenticated
using (
  bucket_id = 'creator-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Only verified adult creators with an active paid membership can submit videos for review.
drop policy if exists "Creators can submit their own media for review" on public.adult_creator_media;
drop policy if exists "Verified creators can submit video for review" on public.adult_creator_media;
drop policy if exists "Verified creators submit pending videos only" on public.adult_creator_media;
create policy "Verified creators submit pending videos only"
on public.adult_creator_media for insert to authenticated
with check (
  auth.uid() = creator_id
  and consent_confirmed = true
  and media_type = 'video'
  and moderation_status = 'pending'
  and storage_bucket = 'creator-videos'
  and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
  and exists (
    select 1 from public.wear_active_memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.starts_at <= now()
      and m.expires_at > now()
  )
);
