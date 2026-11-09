-- WEAR CONDOM private creator-video uploads.
-- Run this in the WEAR CONDOM Supabase SQL Editor only.
-- Files remain private; creators cannot publish their own videos.

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
-- and only after age, identity, consent and account approval checks.
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
);

drop policy if exists "Creators view their own private videos" on storage.objects;
create policy "Creators view their own private videos"
on storage.objects for select to authenticated
using (
  bucket_id = 'creator-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Tighten metadata insertion to approved, verified adult creators.
drop policy if exists "Creators can submit their own media for review" on public.adult_creator_media;
create policy "Verified creators can submit video for review"
on public.adult_creator_media for insert to authenticated
with check (
  auth.uid() = creator_id
  and consent_confirmed = true
  and media_type = 'video'
  and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
);
