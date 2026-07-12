alter table public.top_signal_history
  add column if not exists session_id text,
  add column if not exists leader_start timestamptz,
  add column if not exists leader_end timestamptz,
  add column if not exists publication_time timestamptz,
  add column if not exists publication_reason text,
  add column if not exists leader_duration text,
  add column if not exists publish_window text;

create index if not exists top_signal_history_session_idx
  on public.top_signal_history (slate_date, session_id, run_at desc);

create index if not exists top_signal_history_game_published_idx
  on public.top_signal_history (slate_date, game_id, published);
