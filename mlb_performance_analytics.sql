create table if not exists public.mlb_performance_analytics (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  sample_size integer not null default 0,
  total_picks integer not null default 0,
  total_no_picks integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  pushes integer not null default 0,
  win_rate numeric,
  roi numeric,
  average_clv numeric,
  best_market text,
  worst_market text,
  best_edge_classification text,
  best_conviction text,
  best_confidence_bucket text,
  low_sample_size boolean not null default true,
  global_metrics jsonb not null default '{}'::jsonb,
  by_market jsonb not null default '{}'::jsonb,
  by_edge jsonb not null default '{}'::jsonb,
  by_decision jsonb not null default '{}'::jsonb,
  by_conviction jsonb not null default '{}'::jsonb,
  by_confidence jsonb not null default '{}'::jsonb,
  by_motor jsonb not null default '{}'::jsonb,
  source_table text not null default 'public.mlb_research_validation_history',
  feature_hash text not null unique,
  canonical boolean not null default true,
  calculated_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists mlb_performance_analytics_model_idx
  on public.mlb_performance_analytics (model_version);

create index if not exists mlb_performance_analytics_canonical_idx
  on public.mlb_performance_analytics (canonical);

create index if not exists mlb_performance_analytics_calculated_idx
  on public.mlb_performance_analytics (calculated_at desc);

