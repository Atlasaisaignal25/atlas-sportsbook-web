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
  woba_eligible_plate_appearances integer,
  batted_ball_events integer,
  untracked_batted_ball_events integer,
  statcast_coverage numeric,
  hard_hit_rate numeric,
  barrel_rate numeric,
  average_exit_velocity numeric,
  walk_rate numeric,
  strikeout_rate numeric,
  expected_ba_on_contact numeric,
  expected_slg_on_contact numeric,
  expected_woba_on_contact numeric,
  atlas_expected_offense_rate numeric,
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

alter table public.mlb_offensive_form_snapshots
  add column if not exists woba_eligible_plate_appearances integer,
  add column if not exists untracked_batted_ball_events integer,
  add column if not exists statcast_coverage numeric,
  add column if not exists expected_ba_on_contact numeric,
  add column if not exists expected_slg_on_contact numeric,
  add column if not exists expected_woba_on_contact numeric,
  add column if not exists atlas_expected_offense_rate numeric;

create unique index if not exists mlb_offensive_form_snapshots_feature_hash_idx
  on public.mlb_offensive_form_snapshots (feature_hash);

create index if not exists mlb_offensive_form_snapshots_team_window_captured_idx
  on public.mlb_offensive_form_snapshots (team_id, window_games, captured_at desc);

create index if not exists mlb_offensive_form_snapshots_as_of_idx
  on public.mlb_offensive_form_snapshots (as_of desc);

create index if not exists mlb_offensive_form_snapshots_team_lookup_idx
  on public.mlb_offensive_form_snapshots (team_id, captured_at desc);

create index if not exists mlb_offensive_form_snapshots_sample_quality_idx
  on public.mlb_offensive_form_snapshots (sample_quality);
