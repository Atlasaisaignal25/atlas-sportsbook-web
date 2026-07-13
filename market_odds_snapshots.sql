create extension if not exists "pgcrypto";

create table if not exists public.market_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  event_id text not null,
  commence_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  bookmaker text not null,
  bookmaker_key text,
  bookmaker_name text,
  market_key text not null,
  outcome_name text not null,
  point numeric null,
  price integer null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists market_odds_snapshots_sport_idx
  on public.market_odds_snapshots (sport);

create index if not exists market_odds_snapshots_event_idx
  on public.market_odds_snapshots (event_id);

create index if not exists market_odds_snapshots_bookmaker_idx
  on public.market_odds_snapshots (bookmaker);

create index if not exists market_odds_snapshots_market_idx
  on public.market_odds_snapshots (market_key);

create index if not exists market_odds_snapshots_captured_at_idx
  on public.market_odds_snapshots (captured_at desc);

create index if not exists market_odds_snapshots_lookup_idx
  on public.market_odds_snapshots (
    sport,
    event_id,
    bookmaker,
    market_key,
    outcome_name,
    captured_at desc
  );
