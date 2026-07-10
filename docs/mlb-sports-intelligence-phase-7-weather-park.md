# MLB Sports Intelligence Phase 7 - Weather And Park

## Sources And Endpoints

Weather uses National Weather Service structured APIs:

- `GET https://api.weather.gov/points/{latitude},{longitude}`
- `GET {forecastHourly}` from the point response

Requests include a documented `User-Agent`. NWS hourly forecast periods include local `startTime`, `temperature`, `relativeHumidity`, `windSpeed`, `windDirection`, `probabilityOfPrecipitation` and `shortForecast`.

MLB venue identity uses the official MLB schedule response:

- `GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}&hydrate=probablePitcher,venue`

## Coverage Limitations

NWS primarily covers the United States and territories. Non-US venues, such as Toronto, return weather unavailable in Phase 7. No fallback provider is invented.

## Venue Registry

`weather/venue-registry.ts` maps official MLB venue IDs to venue names, team IDs, coordinates, timezone, roof type and warnings. Mapping is by official venue ID, not free text. Neutral-site games use the venue from the official game object.

## Roof Rules

Fixed domes are `CLOSED` by venue definition. Open-air parks are `OPEN` by venue definition. Retractable roofs remain `UNKNOWN` unless a structured official status is available. Phase 7 does not fabricate verified roof state from weather.

## Forecast Matching

The hourly period nearest to first pitch is selected when within 90 minutes. The selected forecast keeps `generatedAt`, `validTime` and time difference from first pitch. Forecast outside tolerance is rejected.

## Weather Normalization

Units are normalized to Fahrenheit, mph, percent, degrees and inches. NWS wind strings such as `Calm`, `5 mph`, `5 to 10 mph` and gust wording are parsed centrally.

## Wind Orientation

Raw wind direction is preserved. Relative wind remains `UNKNOWN` unless a verified stadium bearing exists. Phase 7 intentionally does not treat a compass direction as automatically blowing out.

## Delay Risk

Version: `weather_delay_risk_v1`

Atlas Weather Delay Risk is audit-only on a 0-100 scale. Components:

- precipitation probability
- thunderstorm wording
- rain/showers wording
- roof suppression for domes or confirmed closed roofs

This is not an official postponement probability.

## Weather Run Environment

Version: `weather_run_environment_v1`

The score is audit-only on a 0-100 scale. Lower is less run-friendly, around 50 is neutral, higher is more run-friendly. Components:

- temperature
- humidity
- relative wind when available
- precipitation drag
- closed-roof neutralization

It does not calculate projected runs and does not use odds, teams, pitchers, offense or bullpen.

## Park Factor

Version: `park_environment_v1`

Park factors use a versioned internal baseline, preserving native 100-as-league-average scale. Atlas Park Environment Score normalizes the venue context separately to 0-100. It is never mixed into weather score.

## Separation

Phase 7 keeps three independent outputs:

- Delay Risk
- Weather Run Environment
- Park Environment

No combined game score is produced.

## Caching

NWS `/points` responses use long-lived server memory cache. Hourly forecasts use short TTL cache. The capture route processes games with bounded concurrency and no browser polling.

## Persistence

Snapshots are stored in `public.mlb_weather_park_feature_snapshots`. Full raw NWS payloads are not stored. Feature hashes exclude timestamps and include only normalized material values.

## Feature Flags

Server-only flags:

- `MLB_WEATHER_MODEL_ENABLED`
- `MLB_NWS_PROVIDER_ENABLED`
- `MLB_PARK_FACTOR_MODEL_ENABLED`
- `MLB_WEATHER_DELAY_RISK_ENABLED`
- `MLB_WEATHER_RUN_ENVIRONMENT_ENABLED`
- `MLB_PARK_ENVIRONMENT_SCORE_ENABLED`
- `MLB_WEATHER_SCORE_MODE=AUDIT_ONLY`

No `NEXT_PUBLIC` flags are used.

## Live Diagnostics

The protected route is:

`POST /api/internal/mlb-sports-intelligence/weather/capture`

It reports games inspected, venues resolved, forecasts available, roof coverage, scored counts, distributions, storage health and provider health.

## Production Capture And Dedupe

The first capture inserts current canonical snapshots. A second unchanged capture skips duplicate hashes. Forecast updates create new snapshots only when normalized material values change.

## Pick Isolation

Phase 7 does not modify or import into:

- `candidateScore`
- `buildCandidate`
- `public_signals`
- `top5_live`
- Top 5
- Top Signal
- Top Play
- closing
- grading

Sports Projection remains `UNAVAILABLE`.

## Known Limitations

Retractable roof status remains unknown without official structured evidence. Relative wind is unknown until verified stadium bearings are added. Toronto and other non-US venues have no NWS coverage in Phase 7.

## Recommended Phase 8

Add verified stadium orientation, durable weather cache, structured roof status when available, weather alerts, observation station matching and a second weather provider for non-US venues.

