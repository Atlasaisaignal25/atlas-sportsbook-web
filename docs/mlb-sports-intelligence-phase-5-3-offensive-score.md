# MLB Sports Intelligence Phase 5.3: Offensive Score Audit-Only

## Historical Row Audit

Production history contained several audit-only generations:

- initial capped Statcast request: noncanonical
- corrected chunked request: noncanonical
- stable-hash raw snapshots: noncanonical after score activation
- current scored audit-only snapshots: canonical

Current inventory after Phase 5.3:

- total offensive snapshot rows: 630
- canonical rows: 90
- noncanonical rows: 540
- baseline rows: 27

Noncanonical rows remain in the table for audit history. They are excluded from baseline computation, audit current-state output and score calculation.

## Canonical Policy

`public.mlb_offensive_form_snapshots` now includes:

- `data_version`
- `canonical`
- `invalid_reason`
- `superseded_at`
- `score_version`
- `score_components`
- `baseline_as_of`
- `baseline_version`

Each capture marks the current 30-team x 3-window set canonical and supersedes previous canonical rows. No hard delete is performed.

## Baseline Table

Created:

`public.mlb_offensive_baseline_snapshots`

It stores one aggregate row per season/window/metric. It does not store raw team rows.

Metrics persisted:

- `hard_hit_rate`
- `barrel_rate`
- `average_exit_velocity`
- `walk_rate`
- `strikeout_rate`
- `expected_ba_on_contact`
- `expected_slg_on_contact`
- `expected_woba_on_contact`
- `atlas_expected_offense_rate`

## Baseline Formula

Baselines use only latest canonical offensive snapshots:

- one team per window
- `SUFFICIENT` and `LIMITED` samples included
- `UNAVAILABLE` and `INSUFFICIENT` excluded
- windows are isolated
- seasons are isolated
- noncanonical rows excluded

For every metric:

- mean
- standard deviation
- median
- minimum
- maximum
- team count

Readiness is rejected if fewer than 26 teams are available or standard deviation is zero/near-zero.

## Score Formula

Score version:

`offensive_score_v1`

Baseline version:

`offensive_baseline_v1`

The score is audit-only and normalized by z-score against compatible production baselines. Extreme z-scores are capped to +/-3. Strikeout rate is inverted. Missing metrics reduce available weight rather than becoming zero.

Recency weights:

- last 7: 0.50
- last 14: 0.30
- last 30: 0.20

## Distribution

Latest audit-only distribution:

- team count: 30
- mean: 50.03
- median: 50.10
- standard deviation: 8.34
- min: 30.60
- max: 69.00
- p10: 40.90
- p25: 43.30
- p75: 55.80
- p90: 62.40

The scores are not saturated and are not collapsed around a single value.

## Stability

Repeated capture with unchanged completed-game windows:

- snapshots inserted: 0
- duplicate snapshots skipped: 180
- baselines inserted: 0
- duplicate baselines skipped: 27
- score distribution unchanged

Timestamp-only changes do not generate new feature hashes.

## Manual Validation

Top last-7 audit score examples:

- Washington Nationals: 74.6
- Baltimore Orioles: 67.7
- Miami Marlins: 66.2

Bottom last-7 audit score examples:

- San Diego Padres: 33.4
- Toronto Blue Jays: 35.5
- Tampa Bay Rays: 38.3

These are internal offensive form audit scores, not power rankings, predictions or pick rankings.

## Audit Ranking

Internal name:

Atlas Offensive Form Audit Ranking

The ranking is diagnostic only and must not be exposed publicly or used in pick generation.

## Feature Flags

Server-side flags:

- `MLB_SPORTS_INTELLIGENCE_ENABLED=true`
- `MLB_OFFENSIVE_FORM_MODEL_ENABLED=true`
- `MLB_STATCAST_PROVIDER_ENABLED=true`
- `MLB_OFFENSIVE_SCORE_ENABLED=true`
- `MLB_OFFENSIVE_SCORE_MODE=AUDIT_ONLY`

No `NEXT_PUBLIC` score flag exists.

## Pick Isolation

Confirmed:

- `automationUtils.ts` does not import offensive score modules
- candidate scoring is unchanged
- Top 5 is unchanged
- Top Signal is unchanged
- Top Play is unchanged
- closing and grading are unchanged
- Sports Projection remains `UNAVAILABLE`

## Compliance Caveat

Baseball Savant CSV remains a public structured source, but production usage should continue to be monitored against MLB/Baseball Savant terms and practical request limits.

## Known Limitations

- Baseline persistence is new and should be observed across multiple capture cycles.
- Noncanonical audit rows remain in storage by design.
- Score is audit-only and not exposed publicly.
- No pitcher/offense matchup, projected runs, win probability, bullpen, weather or injury provider is connected.

## Recommended Phase 6

Observe score stability over multiple days, add a protected audit ranking endpoint if useful, then separately review whether any offensive score should ever become eligible for model research. Do not connect it to picks without a dedicated phase.
