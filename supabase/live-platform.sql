-- WEAR CONDOM live platform foundation
-- Run this only in Supabase project cxqijbdtcaqyttbfzqds.
-- No service-role or payment-provider secrets belong in browser code.

create extension if not exists pgcrypto;

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.adult_creator_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','blocked')),
  provider text not null default 'cloudflare',
  provider_live_id text,
  playback_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists live_streams_status_started_idx on public.live_streams(status, started_at desc);

create table if not exists public.live_stream_secrets (
  stream_id uuid primary key references public.live_streams(id) on delete cascade,
  ingest_url text,
  stream_key_ciphertext text,
  updated_at timestamptz not null default now()
);

create table if not exists public.live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null default 'main',
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists live_chat_room_created_idx on public.live_chat_messages(room_slug, created_at desc);

create table if not exists public.creator_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_balance bigint not null default 0 check (token_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tips (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id),
  creator_id uuid not null references public.adult_creator_profiles(id),
  tokens bigint not null check (tokens between 1 and 100000),
  action_label text not null default 'Direct tip' check (char_length(action_label) between 1 and 80),
  message text check (message is null or char_length(message) <= 120),
  created_at timestamptz not null default now(),
  check (sender_id <> creator_id)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid not null references auth.users(id) on delete cascade,
  tip_id uuid references public.creator_tips(id) on delete set null,
  entry_type text not null check (entry_type in ('payment_credit','creator_tip_debit','creator_tip_credit','refund','admin_adjustment')),
  token_delta bigint not null check (token_delta <> 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(wallet_user_id, created_at desc);

-- Payment provider events are written only by a verified server webhook.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

alter table public.live_streams enable row level security;
alter table public.live_stream_secrets enable row level security;
alter table public.live_chat_messages enable row level security;
alter table public.creator_wallets enable row level security;
alter table public.creator_tips enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists "Public can view live approved creator streams" on public.live_streams;
create policy "Public can view live approved creator streams"
on public.live_streams for select to anon, authenticated
using (
  status = 'live' and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = creator_id
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
);

drop policy if exists "Creators can create their own live stream" on public.live_streams;
create policy "Creators can create their own live stream"
on public.live_streams for insert to authenticated
with check (
  creator_id = auth.uid() and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
);

drop policy if exists "Creators can update their own live stream" on public.live_streams;
create policy "Creators can update their own live stream"
on public.live_streams for update to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid());

-- Stream credentials are never readable or writable from the public browser client.
revoke all on public.live_stream_secrets from anon, authenticated;
drop policy if exists "No browser access to stream secrets" on public.live_stream_secrets;
create policy "No browser access to stream secrets"
on public.live_stream_secrets for all to anon, authenticated using (false) with check (false);

drop policy if exists "Anyone can read live chat" on public.live_chat_messages;
create policy "Anyone can read live chat"
on public.live_chat_messages for select to anon, authenticated using (true);
drop policy if exists "Signed-in adults can post chat" on public.live_chat_messages;
create policy "Signed-in adults can post chat"
on public.live_chat_messages for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.moderation_status = 'approved'
  )
);

drop policy if exists "Users can read their own wallet" on public.creator_wallets;
create policy "Users can read their own wallet"
on public.creator_wallets for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.creator_wallets from anon, authenticated;

drop policy if exists "Users can read their own ledger" on public.wallet_ledger;
create policy "Users can read their own ledger"
on public.wallet_ledger for select to authenticated using (wallet_user_id = auth.uid());
revoke insert, update, delete on public.wallet_ledger from anon, authenticated;

drop policy if exists "Users can read tips they sent or received" on public.creator_tips;
create policy "Users can read tips they sent or received"
on public.creator_tips for select to authenticated using (
  sender_id = auth.uid() or creator_id = auth.uid()
);
revoke insert, update, delete on public.creator_tips from anon, authenticated;

-- Atomic wallet-to-creator tip. Wallet funding is intentionally not client-callable;
-- only a verified payment webhook/admin server may credit tokens.
create or replace function public.send_creator_tip(
  p_creator_id uuid,
  p_tokens bigint,
  p_action_label text default 'Direct tip',
  p_message text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_tip_id uuid;
  v_balance bigint;
begin
  if v_sender is null then raise exception 'Sign in before tipping'; end if;
  if p_creator_id = v_sender then raise exception 'You cannot tip yourself'; end if;
  if p_tokens is null or p_tokens < 1 or p_tokens > 100000 then raise exception 'Invalid token amount'; end if;
  if p_message is not null and char_length(p_message) > 120 then raise exception 'Tip message is too long'; end if;
  if not exists (
    select 1 from public.adult_creator_profiles p
    where p.id = p_creator_id
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  ) then raise exception 'Creator is not approved for live tipping'; end if;

  insert into public.creator_wallets(user_id, token_balance)
  values (v_sender, 0) on conflict (user_id) do nothing;
  insert into public.creator_wallets(user_id, token_balance)
  values (p_creator_id, 0) on conflict (user_id) do nothing;

  select token_balance into v_balance
  from public.creator_wallets where user_id = v_sender for update;
  if v_balance < p_tokens then raise exception 'Insufficient token balance'; end if;

  update public.creator_wallets
  set token_balance = token_balance - p_tokens, updated_at = now()
  where user_id = v_sender;
  update public.creator_wallets
  set token_balance = token_balance + p_tokens, updated_at = now()
  where user_id = p_creator_id;

  insert into public.creator_tips(sender_id, creator_id, tokens, action_label, message)
  values (v_sender, p_creator_id, p_tokens, coalesce(nullif(left(p_action_label,80),''),'Direct tip'), p_message)
  returning id into v_tip_id;

  insert into public.wallet_ledger(wallet_user_id, tip_id, entry_type, token_delta, note)
  values
    (v_sender, v_tip_id, 'creator_tip_debit', -p_tokens, 'Tip sent'),
    (p_creator_id, v_tip_id, 'creator_tip_credit', p_tokens, 'Tip received');

  return v_tip_id;
end;
$$;

revoke all on function public.send_creator_tip(uuid,bigint,text,text) from public, anon;
grant execute on function public.send_creator_tip(uuid,bigint,text,text) to authenticated;

-- Enable Realtime delivery for persistent chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_chat_messages'
  ) then
    alter publication supabase_realtime add table public.live_chat_messages;
  end if;
end $$;


-- Harden stream state: only trusted server functions/webhooks may create or publish streams.
drop policy if exists "Creators can create their own live stream" on public.live_streams;
drop policy if exists "Creators can update their own live stream" on public.live_streams;
revoke insert, update, delete on public.live_streams from anon, authenticated;

-- Require all adult, identity and consent checks before a member can post chat.
drop policy if exists "Signed-in adults can post chat" on public.live_chat_messages;
create policy "Signed-in approved adults can post chat"
on public.live_chat_messages for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.adult_creator_profiles p
    where p.id = auth.uid()
      and p.is_adult_verified = true
      and p.identity_verified = true
      and p.consent_reviewed = true
      and p.moderation_status = 'approved'
  )
);
