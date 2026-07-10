create table if not exists public.mlb_team_strength_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  team_name text not null,
  offensive_score numeric,
  bullpen_quality numeric,
  bullpen_fatigue numeric,
  bullpen_readiness numeric,
  lineup_stability numeric,
  pitcher_status text not null default 'UNKNOWN',
  weather_confidence numeric,
  park_environment numeric,
  team_strength numeric,
  team_confidence jsonb not null default '{}'::jsonb,
  component_breakdown jsonb not null default '[]'::jsonb,
  score_version text not null,
  feature_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_team_strength_snapshots_team
  on public.mlb_team_strength_snapshots (team_id, captured_at desc);

create index if not exists idx_mlb_team_strength_snapshots_canonical
  on public.mlb_team_strength_snapshots (canonical)
  where canonical = true;

create index if not exists idx_mlb_team_strength_snapshots_captured_at
  on public.mlb_team_strength_snapshots (captured_at desc);

create index if not exists idx_mlb_team_strength_snapshots_feature_hash
  on public.mlb_team_strength_snapshots (feature_hash);
