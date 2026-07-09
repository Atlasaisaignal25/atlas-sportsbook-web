alter table public.mlb_public_signals
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nba_public_signals
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nhl_public_signals
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.soccer_public_signals
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.mlb_top5_live
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nba_top5_live
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nhl_top5_live
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.soccer_top5_live
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.mlb_top_signal_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nba_top_signal_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nhl_top_signal_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.soccer_top_signal_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.mlb_top5_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nba_top5_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.nhl_top5_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;

alter table public.soccer_top5_history
  add column if not exists analysis_summary text,
  add column if not exists confidence_label text,
  add column if not exists edge_label text,
  add column if not exists risk_note text,
  add column if not exists model_factors jsonb;
