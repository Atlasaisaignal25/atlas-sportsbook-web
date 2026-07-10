alter table public.mlb_offensive_form_snapshots
  add column if not exists data_version text not null default 'offensive_form_v1',
  add column if not exists canonical boolean not null default false,
  add column if not exists invalid_reason text,
  add column if not exists superseded_at timestamptz,
  add column if not exists score_version text,
  add column if not exists score_components jsonb,
  add column if not exists baseline_as_of timestamptz,
  add column if not exists baseline_version text;

create index if not exists mlb_offensive_form_snapshots_canonical_idx
  on public.mlb_offensive_form_snapshots (canonical);

create index if not exists mlb_offensive_form_snapshots_team_window_canonical_captured_idx
  on public.mlb_offensive_form_snapshots (team_id, window_games, canonical, captured_at desc);

create index if not exists mlb_offensive_form_snapshots_data_version_idx
  on public.mlb_offensive_form_snapshots (data_version);

create table if not exists public.mlb_offensive_baseline_snapshots (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  window_games integer not null check (window_games in (7, 14, 30)),
  metric text not null,
  team_count integer not null,
  sample_quality_policy text not null,
  mean numeric,
  standard_deviation numeric,
  median numeric,
  minimum numeric,
  maximum numeric,
  as_of timestamptz not null,
  source text not null,
  source_updated_at timestamptz,
  baseline_hash text not null,
  canonical boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_offensive_baseline_snapshots_hash_idx
  on public.mlb_offensive_baseline_snapshots (baseline_hash);

create index if not exists mlb_offensive_baseline_snapshots_season_window_metric_asof_idx
  on public.mlb_offensive_baseline_snapshots (season, window_games, metric, as_of desc);

create index if not exists mlb_offensive_baseline_snapshots_canonical_idx
  on public.mlb_offensive_baseline_snapshots (canonical);

create index if not exists mlb_offensive_baseline_snapshots_window_idx
  on public.mlb_offensive_baseline_snapshots (window_games);

create index if not exists mlb_offensive_baseline_snapshots_metric_idx
  on public.mlb_offensive_baseline_snapshots (metric);
