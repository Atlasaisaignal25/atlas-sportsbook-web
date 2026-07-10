create table if not exists public.mlb_lineup_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  odds_event_id text,
  team_id text,
  team_name text not null,
  side text not null check (side in ('HOME', 'AWAY')),
  confirmed boolean not null default false,
  batting_order jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_lineup_snapshots_dedupe_idx
  on public.mlb_lineup_snapshots (
    official_game_id,
    side,
    confirmed,
    md5(batting_order::text),
    captured_at
  );

create index if not exists mlb_lineup_snapshots_game_idx
  on public.mlb_lineup_snapshots (official_game_id, side, captured_at desc);

