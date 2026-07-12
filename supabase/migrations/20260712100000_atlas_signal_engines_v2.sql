alter table public.atlas_core_mlb_picks
  add column if not exists engine_product text not null default 'PREMIUM_TOP5',
  add column if not exists ranking_frozen_at timestamptz;

alter table public.atlas_core_mlb_picks
  drop constraint if exists atlas_core_mlb_picks_date_game_id_key;

create unique index if not exists atlas_core_mlb_picks_date_game_engine_idx
  on public.atlas_core_mlb_picks (date, game_id, engine_product);

create table if not exists public.signals_detected_history (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  slate_date date not null,
  engine text not null,
  game_id text not null,
  away_team text not null,
  home_team text not null,
  start_time timestamptz,
  pick text,
  market text,
  line numeric,
  odds numeric,
  direction text,
  rank integer,
  status text not null,
  atlas_probability numeric,
  edge numeric,
  score numeric,
  source_snapshot_hashes jsonb not null default '{}'::jsonb,
  frozen boolean not null default true,
  published boolean not null default true,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists signals_detected_history_slate_engine_game_idx
  on public.signals_detected_history (slate_date, engine, game_id);

create table if not exists public.top5_history (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  slate_date date not null,
  engine text not null,
  run_type text not null,
  game_id text not null,
  away_team text not null,
  home_team text not null,
  start_time timestamptz,
  pick text not null,
  market text not null,
  line numeric,
  odds numeric,
  direction text not null,
  rank integer not null,
  status text not null,
  atlas_probability numeric,
  edge numeric,
  score numeric,
  source_snapshot_hashes jsonb not null default '{}'::jsonb,
  frozen boolean not null default false,
  published boolean not null default false,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists top5_history_slate_engine_run_game_idx
  on public.top5_history (slate_date, engine, run_type, game_id);

create table if not exists public.top_signal_history (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  slate_date date not null,
  engine text not null,
  game_id text not null,
  away_team text not null,
  home_team text not null,
  start_time timestamptz,
  pick text not null,
  market text not null,
  line numeric,
  odds numeric,
  direction text not null,
  atlas_probability numeric,
  edge numeric,
  score numeric,
  consecutive_leader_hours integer not null default 1,
  status text not null,
  source_snapshot_hashes jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists top_signal_history_slate_run_idx
  on public.top_signal_history (slate_date, run_at desc);

create index if not exists top_signal_history_published_idx
  on public.top_signal_history (slate_date, published, run_at desc);
