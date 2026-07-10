create table if not exists public.mlb_bullpen_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  team_name text not null,
  as_of timestamptz not null,
  games_included integer not null,
  total_appearances_last_3_days integer,
  total_pitches_last_3_days integer,
  total_innings_last_3_days numeric,
  relievers_used_last_1_day integer,
  relievers_used_last_2_days integer,
  relievers_used_last_3_days integer,
  relievers_on_consecutive_days integer,
  relievers_with_heavy_workload integer,
  closer_candidate jsonb,
  high_leverage_relievers jsonb,
  reliever_workloads jsonb,
  fatigue_score numeric,
  fatigue_score_version text,
  fatigue_components jsonb,
  availability text not null,
  source text not null,
  source_updated_at timestamptz,
  feature_hash text not null,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_bullpen_feature_snapshots_feature_hash_idx
  on public.mlb_bullpen_feature_snapshots (feature_hash);

create index if not exists mlb_bullpen_feature_snapshots_team_idx
  on public.mlb_bullpen_feature_snapshots (team_id);

create index if not exists mlb_bullpen_feature_snapshots_team_captured_idx
  on public.mlb_bullpen_feature_snapshots (team_id, captured_at desc);

create index if not exists mlb_bullpen_feature_snapshots_canonical_idx
  on public.mlb_bullpen_feature_snapshots (canonical);

create index if not exists mlb_bullpen_feature_snapshots_availability_idx
  on public.mlb_bullpen_feature_snapshots (availability);

