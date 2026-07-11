alter table public.mlb_research_validation_history
  add column if not exists record_type text not null default 'RESEARCH',
  add column if not exists official_pick_id uuid,
  add column if not exists odds_event_id text,
  add column if not exists published_price numeric,
  add column if not exists official_rank integer,
  add column if not exists is_top_signal boolean not null default false,
  add column if not exists official_status text,
  add column if not exists official_published_at timestamptz;

update public.mlb_research_validation_history
set record_type = 'RESEARCH'
where record_type is null;

create index if not exists mlb_research_validation_history_record_type_idx
  on public.mlb_research_validation_history (record_type);

create index if not exists mlb_research_validation_history_official_pick_idx
  on public.mlb_research_validation_history (official_pick_id);

create unique index if not exists mlb_validation_history_one_official_per_pick_idx
  on public.mlb_research_validation_history (official_pick_id)
  where record_type = 'OFFICIAL' and canonical = true and official_pick_id is not null;
