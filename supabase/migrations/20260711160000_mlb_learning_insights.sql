create table if not exists public.mlb_learning_insights (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  segment text not null,
  sample integer not null default 0,
  win_rate numeric,
  roi numeric,
  clv numeric,
  projection_error numeric,
  calibration_error numeric,
  recommendation text not null,
  confidence text not null,
  version text not null,
  source_tables jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  insight_hash text not null unique,
  canonical boolean not null default true,
  timestamp timestamptz not null default now(),
  superseded_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create index if not exists mlb_learning_insights_metric_idx
  on public.mlb_learning_insights (metric);

create index if not exists mlb_learning_insights_version_idx
  on public.mlb_learning_insights (version);

create index if not exists mlb_learning_insights_canonical_idx
  on public.mlb_learning_insights (canonical);

create index if not exists mlb_learning_insights_timestamp_idx
  on public.mlb_learning_insights (timestamp desc);

