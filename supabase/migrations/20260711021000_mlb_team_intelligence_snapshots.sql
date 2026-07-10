create table if not exists public.mlb_team_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text,
  odds_event_id text,
  team_id text not null,
  team_name text not null,
  side text,
  team_quality_score numeric,
  team_quality_version text not null,
  team_quality_availability text not null,
  team_quality_confidence text not null,
  team_quality_coverage numeric,
  team_quality_components jsonb not null default '{}'::jsonb,
  game_readiness_score numeric,
  game_readiness_version text not null,
  game_readiness_availability text not null,
  game_readiness_confidence text not null,
  game_readiness_components jsonb not null default '{}'::jsonb,
  context_certainty_score numeric,
  context_certainty_version text not null,
  context_certainty_components jsonb not null default '[]'::jsonb,
  intelligence_confidence_score numeric,
  intelligence_confidence_tier text not null,
  confidence_components jsonb not null default '[]'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  feature_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_team_intelligence_snapshots_team
  on public.mlb_team_intelligence_snapshots (team_id, captured_at desc);

create index if not exists idx_mlb_team_intelligence_snapshots_game
  on public.mlb_team_intelligence_snapshots (official_game_id, side);

create index if not exists idx_mlb_team_intelligence_snapshots_canonical
  on public.mlb_team_intelligence_snapshots (canonical)
  where canonical = true;

create index if not exists idx_mlb_team_intelligence_snapshots_captured_at
  on public.mlb_team_intelligence_snapshots (captured_at desc);

create index if not exists idx_mlb_team_intelligence_snapshots_quality_availability
  on public.mlb_team_intelligence_snapshots (team_quality_availability);

create index if not exists idx_mlb_team_intelligence_snapshots_readiness_availability
  on public.mlb_team_intelligence_snapshots (game_readiness_availability);

create index if not exists idx_mlb_team_intelligence_snapshots_feature_hash
  on public.mlb_team_intelligence_snapshots (feature_hash);
