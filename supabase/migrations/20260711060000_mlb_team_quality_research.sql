alter table public.mlb_team_intelligence_snapshots
  add column if not exists team_quality_v1_score numeric,
  add column if not exists team_quality_v2_research_score numeric,
  add column if not exists research_weight_version text,
  add column if not exists starting_pitcher_quality_score numeric,
  add column if not exists starting_pitcher_quality_version text,
  add column if not exists starting_pitcher_baseline_version text,
  add column if not exists starting_pitcher_id text,
  add column if not exists offense_score numeric,
  add column if not exists bullpen_quality_score numeric,
  add column if not exists quality_coverage numeric,
  add column if not exists quality_confidence jsonb,
  add column if not exists quality_components jsonb,
  add column if not exists player_id text;

create index if not exists idx_mlb_team_intelligence_research_version
  on public.mlb_team_intelligence_snapshots (team_quality_version, research_weight_version, canonical);

create index if not exists idx_mlb_team_intelligence_research_game_pitcher
  on public.mlb_team_intelligence_snapshots (official_game_id, team_id, side, player_id)
  where team_quality_version = 'team_quality_v2_research';
