alter table public.mlb_projection_research_snapshots
  add column if not exists slate_date date,
  add column if not exists source_updated_at timestamptz,
  add column if not exists freshness_status text not null default 'UNKNOWN',
  add column if not exists freshness_reason text;

alter table public.mlb_decision_research_snapshots
  add column if not exists slate_date date,
  add column if not exists source_updated_at timestamptz,
  add column if not exists freshness_status text not null default 'UNKNOWN',
  add column if not exists freshness_reason text;

alter table public.mlb_market_edge_research_snapshots
  add column if not exists slate_date date,
  add column if not exists source_updated_at timestamptz,
  add column if not exists freshness_status text not null default 'UNKNOWN',
  add column if not exists freshness_reason text;

alter table public.atlas_core_mlb_signals
  add column if not exists publication_blocked boolean not null default false,
  add column if not exists publication_block_reason text;

alter table public.atlas_core_mlb_picks
  add column if not exists publication_blocked boolean not null default false,
  add column if not exists publication_block_reason text;

create index if not exists idx_mlb_projection_research_slate_canonical
  on public.mlb_projection_research_snapshots (slate_date, model_version, canonical, captured_at desc);

create index if not exists idx_mlb_decision_research_slate_canonical
  on public.mlb_decision_research_snapshots (slate_date, model_version, canonical, captured_at desc);

create index if not exists idx_mlb_market_edge_research_slate_canonical
  on public.mlb_market_edge_research_snapshots (slate_date, model_version, canonical, captured_at desc);

create index if not exists idx_atlas_core_mlb_signals_blocked
  on public.atlas_core_mlb_signals (date, publication_blocked);

create index if not exists idx_atlas_core_mlb_picks_blocked
  on public.atlas_core_mlb_picks (date, publication_blocked);
