create table if not exists public.team_impact_events (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('MLB', 'NBA', 'NFL', 'NHL', 'SOCCER')),
  event_id text not null unique,
  home_team text,
  away_team text,
  player_name text,
  event_type text not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  why text not null,
  impact text not null,
  published_at timestamptz not null,
  source text not null,
  source_url text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'UPDATED', 'RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_impact_events_published_at_idx
  on public.team_impact_events (published_at desc);

create index if not exists team_impact_events_sport_published_at_idx
  on public.team_impact_events (sport, published_at desc);

create index if not exists team_impact_events_event_type_idx
  on public.team_impact_events (event_type);

create index if not exists team_impact_events_status_idx
  on public.team_impact_events (status);

create or replace function public.set_team_impact_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists team_impact_events_updated_at on public.team_impact_events;

create trigger team_impact_events_updated_at
before update on public.team_impact_events
for each row
execute function public.set_team_impact_events_updated_at();
