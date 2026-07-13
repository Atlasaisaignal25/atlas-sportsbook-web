alter table public.market_odds_snapshots
  add column if not exists bookmaker_key text,
  add column if not exists bookmaker_name text;

update public.market_odds_snapshots
set
  bookmaker_key = coalesce(bookmaker_key, bookmaker),
  bookmaker_name = coalesce(bookmaker_name, bookmaker)
where bookmaker_key is null or bookmaker_name is null;

alter table public.market_impact_events
  add column if not exists books_observed integer not null default 1,
  add column if not exists books_moved integer not null default 1,
  add column if not exists consensus_percent numeric not null default 100,
  add column if not exists consensus_level text not null default 'LOW CONSENSUS',
  add column if not exists sportsbook_keys_moved text[] not null default '{}',
  add column if not exists sportsbook_names_moved text[] not null default '{}',
  add column if not exists first_book_to_move text,
  add column if not exists first_move_at timestamptz,
  add column if not exists latest_book_to_move text,
  add column if not exists latest_move_at timestamptz,
  add column if not exists movement_window_minutes integer,
  add column if not exists sportsbook_details jsonb not null default '[]'::jsonb;

create index if not exists market_impact_events_consensus_idx
  on public.market_impact_events (consensus_level, consensus_percent desc);

create index if not exists market_impact_events_latest_move_idx
  on public.market_impact_events (latest_move_at desc);
