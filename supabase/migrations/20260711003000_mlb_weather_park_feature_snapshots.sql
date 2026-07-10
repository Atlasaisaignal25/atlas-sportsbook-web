create table if not exists public.mlb_weather_park_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_game_id text not null,
  odds_event_id text,
  official_venue_id text,
  venue_name text,
  scheduled_start_time timestamptz not null,
  roof_type text,
  roof_status text,
  roof_verified boolean,
  forecast_valid_time timestamptz,
  forecast_generated_at timestamptz,
  temperature_f numeric,
  humidity_percent numeric,
  wind_speed_mph numeric,
  wind_gust_mph numeric,
  wind_direction_degrees numeric,
  wind_direction_cardinal text,
  relative_wind jsonb,
  precipitation_probability numeric,
  weather_alerts jsonb,
  delay_risk numeric,
  delay_risk_version text,
  delay_risk_components jsonb,
  weather_run_environment_score numeric,
  weather_run_environment_version text,
  weather_run_components jsonb,
  park_factor_features jsonb,
  park_environment_score numeric,
  park_environment_version text,
  availability text not null,
  source text not null,
  source_updated_at timestamptz,
  feature_hash text not null,
  canonical boolean not null default true,
  invalid_reason text,
  superseded_at timestamptz,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists mlb_weather_park_feature_snapshots_hash_idx
  on public.mlb_weather_park_feature_snapshots (feature_hash);

create index if not exists mlb_weather_park_feature_snapshots_game_idx
  on public.mlb_weather_park_feature_snapshots (official_game_id);

create index if not exists mlb_weather_park_feature_snapshots_venue_idx
  on public.mlb_weather_park_feature_snapshots (official_venue_id);

create index if not exists mlb_weather_park_feature_snapshots_start_idx
  on public.mlb_weather_park_feature_snapshots (scheduled_start_time);

create index if not exists mlb_weather_park_feature_snapshots_canonical_idx
  on public.mlb_weather_park_feature_snapshots (canonical);

create index if not exists mlb_weather_park_feature_snapshots_captured_idx
  on public.mlb_weather_park_feature_snapshots (captured_at desc);

