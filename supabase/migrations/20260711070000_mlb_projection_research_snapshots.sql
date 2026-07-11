create table if not exists public.mlb_projection_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  home_team_id text not null,
  home_team_name text not null,
  away_team_id text not null,
  away_team_name text not null,
  projected_home_runs numeric,
  projected_away_runs numeric,
  projected_total_runs numeric,
  home_win_probability numeric,
  away_win_probability numeric,
  fair_moneyline_home integer,
  fair_moneyline_away integer,
  projection_confidence_score numeric,
  projection_confidence_tier text not null,
  projection_availability text not null,
  component_breakdown jsonb not null default '{}'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  model_version text not null,
  warnings jsonb not null default '[]'::jsonb,
  feature_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_projection_research_game
  on public.mlb_projection_research_snapshots (official_game_id, model_version, canonical);

create index if not exists idx_mlb_projection_research_model_canonical
  on public.mlb_projection_research_snapshots (model_version, canonical, captured_at desc);

create index if not exists idx_mlb_projection_research_availability
  on public.mlb_projection_research_snapshots (projection_availability);

create index if not exists idx_mlb_projection_research_feature_hash
  on public.mlb_projection_research_snapshots (feature_hash);
