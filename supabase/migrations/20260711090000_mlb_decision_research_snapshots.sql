create table if not exists public.mlb_decision_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  home_team_id text not null,
  home_team_name text not null,
  away_team_id text not null,
  away_team_name text not null,
  consensus_grade text not null,
  consensus_side text not null,
  consensus_score numeric not null,
  module_agreement numeric not null,
  conviction_grade text not null,
  conviction_score numeric not null,
  decision text not null,
  no_pick boolean not null default false,
  no_pick_reasons jsonb not null default '[]'::jsonb,
  decision_confidence_score numeric,
  decision_confidence_tier text not null,
  input_coverage numeric not null,
  component_breakdown jsonb not null default '{}'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  model_version text not null,
  feature_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mlb_decision_research_game
  on public.mlb_decision_research_snapshots (official_game_id, model_version, canonical);

create index if not exists idx_mlb_decision_research_model_canonical
  on public.mlb_decision_research_snapshots (model_version, canonical, captured_at desc);

create index if not exists idx_mlb_decision_research_consensus
  on public.mlb_decision_research_snapshots (consensus_grade);

create index if not exists idx_mlb_decision_research_conviction
  on public.mlb_decision_research_snapshots (conviction_grade);

create index if not exists idx_mlb_decision_research_no_pick
  on public.mlb_decision_research_snapshots (no_pick);

create index if not exists idx_mlb_decision_research_feature_hash
  on public.mlb_decision_research_snapshots (feature_hash);
