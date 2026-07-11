create table if not exists public.mlb_research_validation_history (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  game_date date,
  home_team text not null,
  away_team text not null,
  market text not null,
  selection text not null,
  atlas_probability numeric,
  market_probability numeric,
  edge numeric,
  edge_classification text,
  projected_home_runs numeric,
  projected_away_runs numeric,
  projected_total numeric,
  decision text,
  consensus text,
  consensus_score numeric,
  conviction text,
  conviction_score numeric,
  confidence numeric,
  no_pick boolean not null default false,
  market_line numeric,
  market_price numeric,
  closing_line numeric,
  closing_price numeric,
  closing_no_vig_probability numeric,
  closing_timestamp timestamptz,
  clv_probability numeric,
  clv_price numeric,
  line_movement numeric,
  price_movement numeric,
  result text not null default 'PENDING',
  units numeric,
  roi numeric,
  final_home_score numeric,
  final_away_score numeric,
  final_scores jsonb not null default '{}'::jsonb,
  model_versions jsonb not null default '{}'::jsonb,
  source_snapshot_hashes jsonb not null default '{}'::jsonb,
  pregame_snapshot_at timestamptz not null,
  graded_at timestamptz,
  record_type text not null default 'RESEARCH',
  official_pick_id uuid,
  odds_event_id text,
  published_price numeric,
  official_rank integer,
  is_top_signal boolean not null default false,
  official_status text,
  official_published_at timestamptz,
  feature_hash text not null unique,
  canonical boolean not null default true,
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mlb_research_validation_history_game_idx
  on public.mlb_research_validation_history (game_id);

create index if not exists mlb_research_validation_history_market_idx
  on public.mlb_research_validation_history (market);

create index if not exists mlb_research_validation_history_result_idx
  on public.mlb_research_validation_history (result);

create index if not exists mlb_research_validation_history_canonical_idx
  on public.mlb_research_validation_history (canonical);

create index if not exists mlb_research_validation_history_pregame_idx
  on public.mlb_research_validation_history (pregame_snapshot_at desc);

create index if not exists mlb_research_validation_history_game_market_canonical_idx
  on public.mlb_research_validation_history (game_id, market, canonical);

create index if not exists mlb_research_validation_history_record_type_idx
  on public.mlb_research_validation_history (record_type);

create index if not exists mlb_research_validation_history_official_pick_idx
  on public.mlb_research_validation_history (official_pick_id);

create unique index if not exists mlb_validation_history_one_official_per_pick_idx
  on public.mlb_research_validation_history (official_pick_id)
  where record_type = 'OFFICIAL' and canonical = true and official_pick_id is not null;
