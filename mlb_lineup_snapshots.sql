create table if not exists public.mlb_lineup_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  odds_event_id text,
  sport text not null default 'MLB',
  team_id text,
  team_name text not null,
  side text not null check (side in ('HOME', 'AWAY')),
  game_date timestamptz,
  game_status text,
  confirmed boolean not null default false,
  batting_order_complete boolean not null default false,
  player_count integer not null default 0,
  batting_order jsonb not null,
  lineup_hash text not null,
  source text not null,
  source_updated_at timestamptz,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_lineup_snapshots_dedupe_idx
  on public.mlb_lineup_snapshots (
    official_game_id,
    side,
    lineup_hash
  );

create index if not exists mlb_lineup_snapshots_official_game_idx
  on public.mlb_lineup_snapshots (official_game_id);

create index if not exists mlb_lineup_snapshots_odds_event_idx
  on public.mlb_lineup_snapshots (odds_event_id);

create index if not exists mlb_lineup_snapshots_team_idx
  on public.mlb_lineup_snapshots (team_id);

create index if not exists mlb_lineup_snapshots_captured_at_idx
  on public.mlb_lineup_snapshots (captured_at desc);

create index if not exists mlb_lineup_snapshots_game_side_lookup_idx
  on public.mlb_lineup_snapshots (official_game_id, side, captured_at desc);

create table if not exists public.mlb_lineup_change_events (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  odds_event_id text,
  team_id text,
  team_name text not null,
  side text not null check (side in ('HOME', 'AWAY')),
  change_type text not null,
  added_players jsonb not null default '[]'::jsonb,
  removed_players jsonb not null default '[]'::jsonb,
  batting_order_changes jsonb not null default '[]'::jsonb,
  position_changes jsonb not null default '[]'::jsonb,
  previous_snapshot_id uuid,
  current_snapshot_id uuid,
  minutes_before_start integer,
  verified boolean not null default true,
  source text not null default 'MLB_OFFICIAL',
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  event_hash text not null
);

create unique index if not exists mlb_lineup_change_events_hash_idx
  on public.mlb_lineup_change_events (event_hash);

create index if not exists mlb_lineup_change_events_game_idx
  on public.mlb_lineup_change_events (official_game_id, side, detected_at desc);

create index if not exists mlb_lineup_change_events_odds_event_idx
  on public.mlb_lineup_change_events (odds_event_id);

create table if not exists public.mlb_starter_verification_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  odds_event_id text,
  team_id text,
  team_name text not null,
  side text not null check (side in ('HOME', 'AWAY')),
  probable_pitcher_id text,
  probable_pitcher_name text,
  confirmed_pitcher_id text,
  confirmed_pitcher_name text,
  verification_status text not null check (
    verification_status in ('MATCHED', 'CHANGED', 'PROBABLE_ONLY', 'UNAVAILABLE', 'AMBIGUOUS')
  ),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  verification_hash text not null
);

create unique index if not exists mlb_starter_verification_snapshots_hash_idx
  on public.mlb_starter_verification_snapshots (official_game_id, side, verification_hash);

create index if not exists mlb_starter_verification_snapshots_game_idx
  on public.mlb_starter_verification_snapshots (official_game_id, side, captured_at desc);

create index if not exists mlb_starter_verification_snapshots_status_idx
  on public.mlb_starter_verification_snapshots (verification_status);
