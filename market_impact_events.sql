create table if not exists public.market_impact_events (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('MLB', 'NBA', 'NFL', 'NHL', 'SOCCER')),
  event_id text not null unique,
  home_team text not null,
  away_team text not null,
  market text not null check (market in ('Moneyline', 'Spread', 'Totals')),
  selection text not null,
  movement_type text not null check (movement_type in ('LINE_MOVEMENT', 'ODDS_MOVEMENT')),
  old_line numeric,
  new_line numeric,
  old_odds integer,
  new_odds integer,
  direction text not null check (direction in ('UP', 'DOWN', 'NO_CHANGE')),
  movement_size numeric not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  why text not null,
  impact text not null,
  published_at timestamptz not null,
  books_observed integer not null default 1,
  books_moved integer not null default 1,
  consensus_percent numeric not null default 100,
  consensus_level text not null default 'LOW CONSENSUS',
  sportsbook_keys_moved text[] not null default '{}',
  sportsbook_names_moved text[] not null default '{}',
  first_book_to_move text,
  first_move_at timestamptz,
  latest_book_to_move text,
  latest_move_at timestamptz,
  movement_window_minutes integer,
  sportsbook_details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_impact_events_published_at_idx
  on public.market_impact_events (published_at desc);

create index if not exists market_impact_events_sport_published_at_idx
  on public.market_impact_events (sport, published_at desc);

create index if not exists market_impact_events_market_idx
  on public.market_impact_events (market);

create index if not exists market_impact_events_movement_type_idx
  on public.market_impact_events (movement_type);

create or replace function public.set_market_impact_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists market_impact_events_updated_at on public.market_impact_events;

create trigger market_impact_events_updated_at
before update on public.market_impact_events
for each row
execute function public.set_market_impact_events_updated_at();
