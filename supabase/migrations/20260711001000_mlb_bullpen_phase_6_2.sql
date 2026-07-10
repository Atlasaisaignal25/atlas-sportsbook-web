alter table public.mlb_bullpen_feature_snapshots
  add column if not exists quality_score_v1 numeric,
  add column if not exists quality_score_v2 numeric,
  add column if not exists quality_confidence jsonb,
  add column if not exists season_quality_component numeric,
  add column if not exists last30_quality_component numeric,
  add column if not exists last14_quality_component numeric,
  add column if not exists last7_quality_component numeric,
  add column if not exists season_sample jsonb,
  add column if not exists recent_samples jsonb,
  add column if not exists relief_windows jsonb,
  add column if not exists baseline_version text;

create index if not exists mlb_bullpen_feature_snapshots_quality_v2_idx
  on public.mlb_bullpen_feature_snapshots (quality_score_v2);

create index if not exists mlb_bullpen_feature_snapshots_baseline_version_idx
  on public.mlb_bullpen_feature_snapshots (baseline_version);

create table if not exists public.mlb_bullpen_quality_baseline_snapshots (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  window text not null,
  metric text not null,
  team_count integer not null,
  mean numeric not null,
  standard_deviation numeric not null,
  median numeric not null,
  minimum numeric not null,
  maximum numeric not null,
  sample_quality_policy text not null,
  source text not null,
  as_of timestamptz not null,
  baseline_hash text not null,
  data_version text not null,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_bullpen_quality_baseline_hash_idx
  on public.mlb_bullpen_quality_baseline_snapshots (baseline_hash);

create index if not exists mlb_bullpen_quality_baseline_canonical_idx
  on public.mlb_bullpen_quality_baseline_snapshots (canonical);

create index if not exists mlb_bullpen_quality_baseline_window_metric_idx
  on public.mlb_bullpen_quality_baseline_snapshots (season, window, metric, canonical);
