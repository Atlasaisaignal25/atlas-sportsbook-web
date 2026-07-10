alter table public.mlb_bullpen_feature_snapshots
  add column if not exists fatigue_score_v1 numeric,
  add column if not exists fatigue_score_v2 numeric,
  add column if not exists quality_score numeric,
  add column if not exists quality_score_version text,
  add column if not exists quality_components jsonb,
  add column if not exists effective_depth jsonb,
  add column if not exists quality_sample jsonb,
  add column if not exists data_version text not null default 'bullpen_features_v1',
  add column if not exists invalid_reason text,
  add column if not exists superseded_at timestamptz;

create index if not exists mlb_bullpen_feature_snapshots_data_version_idx
  on public.mlb_bullpen_feature_snapshots (data_version);

create index if not exists mlb_bullpen_feature_snapshots_quality_score_idx
  on public.mlb_bullpen_feature_snapshots (quality_score);

create index if not exists mlb_bullpen_feature_snapshots_fatigue_v2_idx
  on public.mlb_bullpen_feature_snapshots (fatigue_score_v2);

