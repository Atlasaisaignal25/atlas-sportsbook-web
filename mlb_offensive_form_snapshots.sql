create table if not exists public.mlb_offensive_form_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  team_name text not null,
  as_of timestamptz not null,
  window_games integer not null check (window_games in (7, 14, 30)),
  games_included integer not null default 0,
  start_date date,
  end_date date,
  plate_appearances integer,
  batted_ball_events integer,
  hard_hit_rate numeric,
  barrel_rate numeric,
  average_exit_velocity numeric,
  walk_rate numeric,
  strikeout_rate numeric,
  xba numeric,
  xslg numeric,
  xwoba numeric,
  atlas_offensive_score numeric,
  sample_quality text not null check (
    sample_quality in ('SUFFICIENT', 'LIMITED', 'INSUFFICIENT', 'UNAVAILABLE')
  ),
  source text not null,
  source_updated_at timestamptz,
  feature_hash text not null unique,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mlb_offensive_form_snapshots_team_window_captured_idx
  on public.mlb_offensive_form_snapshots (team_id, window_games, captured_at desc);

create index if not exists mlb_offensive_form_snapshots_as_of_idx
  on public.mlb_offensive_form_snapshots (as_of desc);
