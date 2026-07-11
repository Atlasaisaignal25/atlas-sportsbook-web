create table if not exists public.mlb_market_edge_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  home_team_id text,
  home_team_name text not null,
  away_team_id text,
  away_team_name text not null,
  market text not null,
  atlas_probability numeric,
  market_probability numeric,
  edge numeric,
  value_percent numeric,
  direction text not null,
  classification text not null,
  market_context jsonb not null default '{}'::jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  model_version text not null,
  snapshot_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists mlb_market_edge_research_game_idx
  on public.mlb_market_edge_research_snapshots (official_game_id);

create index if not exists mlb_market_edge_research_market_idx
  on public.mlb_market_edge_research_snapshots (market);

create index if not exists mlb_market_edge_research_model_idx
  on public.mlb_market_edge_research_snapshots (model_version);

create index if not exists mlb_market_edge_research_canonical_idx
  on public.mlb_market_edge_research_snapshots (canonical);

create index if not exists mlb_market_edge_research_captured_idx
  on public.mlb_market_edge_research_snapshots (captured_at desc);

create index if not exists mlb_market_edge_research_game_market_canonical_idx
  on public.mlb_market_edge_research_snapshots (official_game_id, market, canonical, captured_at desc);
