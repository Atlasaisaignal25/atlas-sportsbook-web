create table if not exists public.mlb_pitcher_quality_baseline_snapshots (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  baseline_window text not null,
  metric text not null,
  pitcher_count integer not null,
  mean numeric,
  standard_deviation numeric,
  sample_quality_policy text not null,
  source text not null default 'MLB_OFFICIAL',
  as_of timestamptz not null default now(),
  baseline_hash text not null unique,
  canonical boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_pitcher_quality_baselines_lookup
  on public.mlb_pitcher_quality_baseline_snapshots (season, baseline_window, metric, canonical);

create table if not exists public.mlb_starting_pitcher_quality_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text not null,
  team_id text,
  team_name text,
  official_game_id text,
  odds_event_id text,
  side text,
  quality_score numeric,
  quality_version text not null,
  quality_components jsonb not null default '[]'::jsonb,
  quality_confidence jsonb not null default '{}'::jsonb,
  readiness_score numeric,
  readiness_version text not null,
  readiness_components jsonb not null default '[]'::jsonb,
  season_window jsonb,
  last30_window jsonb,
  last5_starts jsonb,
  last3_starts jsonb,
  advanced_metrics jsonb not null default '{}'::jsonb,
  sample_quality jsonb not null default '{}'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  feature_hash text not null unique,
  canonical boolean not null default true,
  superseded_at timestamptz,
  invalid_reason text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_starting_pitcher_quality_player
  on public.mlb_starting_pitcher_quality_snapshots (player_id, captured_at desc);

create index if not exists idx_mlb_starting_pitcher_quality_game
  on public.mlb_starting_pitcher_quality_snapshots (official_game_id, side);

create index if not exists idx_mlb_starting_pitcher_quality_canonical
  on public.mlb_starting_pitcher_quality_snapshots (canonical)
  where canonical = true;

create index if not exists idx_mlb_starting_pitcher_quality_captured_at
  on public.mlb_starting_pitcher_quality_snapshots (captured_at desc);

create index if not exists idx_mlb_starting_pitcher_quality_feature_hash
  on public.mlb_starting_pitcher_quality_snapshots (feature_hash);
