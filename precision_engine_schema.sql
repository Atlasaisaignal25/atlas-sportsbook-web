create extension if not exists pgcrypto;

create table if not exists public.precision_snapshots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  sport text not null,
  product_type text not null check (product_type in ('top_signal', 'top_play')),
  game_id text,
  start_time timestamptz,
  release_at timestamptz,
  locked_at timestamptz,
  lifecycle_status text not null check (
    lifecycle_status in (
      'scanning',
      'validating',
      'strong_candidate',
      'final_review',
      'available_now',
      'locked',
      'no_play'
    )
  ),
  pick_label text,
  market text,
  selection text,
  line numeric,
  odds numeric,
  confidence numeric,
  value_priority numeric,
  precision_score numeric,
  progress_percent numeric,
  can_purchase boolean not null default false,
  can_reveal_pick boolean not null default false,
  no_play_reason text,
  reasons jsonb,
  source_signal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists precision_snapshots_unique_daily_product
  on public.precision_snapshots(date, sport, product_type);

create index if not exists precision_snapshots_date_idx
  on public.precision_snapshots(date);

create index if not exists precision_snapshots_sport_idx
  on public.precision_snapshots(sport);

create index if not exists precision_snapshots_product_type_idx
  on public.precision_snapshots(product_type);

create index if not exists precision_snapshots_lifecycle_status_idx
  on public.precision_snapshots(lifecycle_status);

create index if not exists precision_snapshots_release_at_idx
  on public.precision_snapshots(release_at);

create index if not exists precision_snapshots_locked_at_idx
  on public.precision_snapshots(locked_at);
