create table if not exists public.atlas_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('MLB', 'NBA', 'NFL', 'NHL', 'SOCCER')),
  event_id text not null unique,
  related_team_event_id text not null,
  related_market_event_id text not null,
  insight_type text not null check (insight_type in ('TEAM_IMPACT_TO_MARKET_IMPACT')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_intelligence_events_published_at_idx
  on public.atlas_intelligence_events (published_at desc);

create index if not exists atlas_intelligence_events_sport_published_at_idx
  on public.atlas_intelligence_events (sport, published_at desc);

create index if not exists atlas_intelligence_events_related_team_idx
  on public.atlas_intelligence_events (related_team_event_id);

create index if not exists atlas_intelligence_events_related_market_idx
  on public.atlas_intelligence_events (related_market_event_id);

create or replace function public.set_atlas_intelligence_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists atlas_intelligence_events_updated_at on public.atlas_intelligence_events;

create trigger atlas_intelligence_events_updated_at
before update on public.atlas_intelligence_events
for each row
execute function public.set_atlas_intelligence_events_updated_at();
