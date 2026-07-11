alter table public.mlb_pitcher_quality_baseline_snapshots
  add column if not exists median numeric,
  add column if not exists minimum numeric,
  add column if not exists maximum numeric,
  add column if not exists source_updated_at timestamptz,
  add column if not exists baseline_version text not null default 'starting_pitcher_baseline_v1';

create index if not exists idx_mlb_pitcher_quality_baselines_version
  on public.mlb_pitcher_quality_baseline_snapshots (baseline_version, canonical);

alter table public.mlb_starting_pitcher_quality_snapshots
  add column if not exists baseline_version text,
  add column if not exists baseline_source text,
  add column if not exists baseline_as_of timestamptz,
  add column if not exists data_version text;

update public.mlb_starting_pitcher_quality_snapshots
set
  baseline_version = coalesce(baseline_version, 'starting_pitcher_baseline_v1'),
  baseline_source = coalesce(baseline_source, 'INITIAL_PRIOR_FALLBACK'),
  data_version = coalesce(data_version, quality_version)
where baseline_version is null
   or baseline_source is null
   or data_version is null;

create index if not exists idx_mlb_starting_pitcher_quality_baseline
  on public.mlb_starting_pitcher_quality_snapshots (baseline_version, baseline_source, canonical);
