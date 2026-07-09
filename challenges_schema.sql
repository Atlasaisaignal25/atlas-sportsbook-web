create extension if not exists pgcrypto;

create table if not exists public.challenge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_type text not null check (challenge_type in ('daily_streak', 'triple_play', 'mega_5')),
  status text not null default 'active' check (status in ('active', 'completed', 'failed', 'expired')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  completed_at timestamptz,
  failed_at timestamptz,
  reward_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists challenge_runs_one_active_per_user_type
  on public.challenge_runs (user_id, challenge_type)
  where status = 'active';

create index if not exists challenge_runs_user_status_idx
  on public.challenge_runs (user_id, status, started_at desc);

create table if not exists public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.challenge_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_type text not null check (challenge_type in ('daily_streak', 'triple_play', 'mega_5')),
  attempt_date date not null,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'push', 'void')),
  result text check (result in ('pending', 'won', 'lost', 'push', 'void')),
  created_at timestamptz not null default now(),
  graded_at timestamptz
);

create unique index if not exists challenge_attempts_one_per_day
  on public.challenge_attempts (user_id, challenge_type, attempt_date);

create index if not exists challenge_attempts_pending_idx
  on public.challenge_attempts (status, created_at);

create table if not exists public.challenge_attempt_picks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.challenge_attempts(id) on delete cascade,
  signal_id text not null,
  sport text not null,
  game_id text,
  pick_label text not null,
  market text,
  selection text,
  line numeric,
  odds numeric,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'push', 'void')),
  result text check (result in ('pending', 'won', 'lost', 'push', 'void')),
  created_at timestamptz not null default now()
);

create unique index if not exists challenge_attempt_picks_no_duplicate_signal
  on public.challenge_attempt_picks (attempt_id, signal_id);

create index if not exists challenge_attempt_picks_attempt_idx
  on public.challenge_attempt_picks (attempt_id);

create table if not exists public.challenge_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null check (reward_type in ('premium_sport_30_days', 'elite_30_days')),
  sport text,
  plan_code text not null check (plan_code in ('premium_reward', 'elite_reward')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  source_challenge text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists challenge_rewards_no_duplicate_source
  on public.challenge_rewards (user_id, source_challenge, reward_type)
  where status in ('active', 'expired');

create index if not exists challenge_rewards_active_idx
  on public.challenge_rewards (user_id, status, expires_at desc);

alter table public.challenge_runs
  add column if not exists guest_id text;

alter table public.challenge_attempts
  add column if not exists guest_id text;

alter table public.challenge_rewards
  add column if not exists guest_id text;

alter table public.challenge_runs
  alter column user_id drop not null;

alter table public.challenge_attempts
  alter column user_id drop not null;

alter table public.challenge_rewards
  alter column user_id drop not null;

create unique index if not exists challenge_runs_one_active_per_guest_type
  on public.challenge_runs (guest_id, challenge_type)
  where status = 'active' and guest_id is not null;

create index if not exists challenge_runs_guest_status_idx
  on public.challenge_runs (guest_id, status, started_at desc)
  where guest_id is not null;

create unique index if not exists challenge_attempts_one_per_guest_day
  on public.challenge_attempts (guest_id, challenge_type, attempt_date)
  where guest_id is not null;

create unique index if not exists challenge_rewards_no_duplicate_guest_source
  on public.challenge_rewards (guest_id, source_challenge, reward_type)
  where status in ('active', 'expired') and guest_id is not null;

create index if not exists challenge_rewards_guest_active_idx
  on public.challenge_rewards (guest_id, status, expires_at desc)
  where guest_id is not null;
