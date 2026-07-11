create table if not exists public.atlas_core_mlb_signals (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  game_id text not null,
  away_team text not null,
  home_team text not null,
  start_time timestamptz,
  sport text not null default 'MLB',
  stage text not null default 'SIGNALS_DETECTED',
  morning_scan_at timestamptz not null,
  source_versions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  frozen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, game_id)
);

create index if not exists atlas_core_mlb_signals_date_idx
  on public.atlas_core_mlb_signals (date);

create index if not exists atlas_core_mlb_signals_game_idx
  on public.atlas_core_mlb_signals (game_id);

create table if not exists public.atlas_core_mlb_picks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  game_id text not null,
  away_team text not null,
  home_team text not null,
  start_time timestamptz,
  sport text not null default 'MLB',
  pick text not null,
  market text not null,
  line numeric,
  odds numeric,
  direction text not null,
  rank integer,
  status text not null default 'VALIDATED',
  is_top_signal boolean not null default false,
  pick_ranking numeric not null default 0,
  edge numeric,
  conviction_score numeric,
  conviction_grade text,
  consensus_score numeric,
  consensus_grade text,
  confidence numeric,
  validation_reasons jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  source_snapshot_hashes jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  final_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, game_id)
);

create index if not exists atlas_core_mlb_picks_date_idx
  on public.atlas_core_mlb_picks (date);

create index if not exists atlas_core_mlb_picks_rank_idx
  on public.atlas_core_mlb_picks (date, rank);

create index if not exists atlas_core_mlb_picks_status_idx
  on public.atlas_core_mlb_picks (status);

create index if not exists atlas_core_mlb_picks_top_signal_idx
  on public.atlas_core_mlb_picks (date, is_top_signal);

