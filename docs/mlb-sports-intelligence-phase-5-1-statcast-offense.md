# MLB Sports Intelligence Phase 5.1: Verified Statcast Offensive Provider

## Source and Endpoint

Provider: Baseball Savant / MLB Statcast Search CSV.

Endpoint used server-side:

`https://baseballsavant.mlb.com/statcast_search/csv`

Request parameters:

- `all=true`
- `type=details`
- `player_type=batter`
- `game_date_gt=<YYYY-MM-DD>`
- `game_date_lt=<YYYY-MM-DD>`
- `hfGT=R|`
- `hfSea=<season>|`
- `csv=true`

Response format: structured CSV with pitch-level detail rows. The selected `type=details` export can include multiple rows for the same plate appearance, so Atlas must not treat CSV row count as plate appearances. Atlas consumes only the offensive fields needed for team rolling windows and does not store raw pitch rows.

Compliance caveat: Baseball Savant makes structured CSV downloads publicly available and documents the fields, but public accessibility is not the same as unrestricted commercial production rights. Production use should be reviewed against MLB/Baseball Savant usage terms, request volume, caching, and attribution requirements before enabling flags.

## Raw Fields Consumed

- `game_date`
- `game_pk`
- `at_bat_number`
- `pitch_number`
- `game_type`
- `home_team`
- `away_team`
- `inning_topbot`
- `events`
- `description`
- `launch_speed`
- `launch_speed_angle`
- `estimated_ba_using_speedangle`
- `estimated_slg_using_speedangle`
- `estimated_woba_using_speedangle`
- `woba_value`
- `woba_denom`

Hard-hit balls use the MLB Statcast definition of exit velocity at or above 95 mph when no explicit hard-hit classification column is present. Barrels use Baseball Savant `launch_speed_angle = 6`.

## Phase 5.1.1 Aggregation Audit

Raw row granularity found: Baseball Savant CSV rows are pitch/play detail rows. A single plate appearance can appear as multiple rows with the same `game_pk + at_bat_number` and different `pitch_number`.

Canonical plate appearance key:

`gamePk + atBatNumber`

Rules:

- `pitch_number` orders rows inside an appearance only.
- one plate appearance can produce only one terminal offensive event;
- a terminal row is selected from non-empty `events`;
- if multiple terminal rows appear for the same key, Atlas emits a warning and uses the latest terminal row by pitch order;
- rows missing `gamePk` or `atBatNumber` are not eligible for PA aggregation;
- batting team is resolved from `inning_topbot`: `Top` means away team bats, `Bot` means home team bats;
- rows outside the selected official `gamePk` window are excluded;
- opponent batting rows are excluded from the target team aggregation.

## Rolling-Game Methodology

Windows are based on completed team games, not calendar days:

- last 7 completed games
- last 14 completed games
- last 30 completed games

The provider uses official MLB schedule results to select completed games by `gamePk`. Future, postponed, cancelled, suspended and incomplete games are excluded. Doubleheaders are isolated by official `gamePk` and can count as two separate completed games.

Only regular-season style Statcast requests are intended for this phase. Postseason support requires explicit configuration later.

## Aggregation Formulas

Atlas calculates from unique normalized terminal plate appearances:

- `plateAppearances`: unique terminal plate appearances with supported PA events
- `wobaEligiblePlateAppearances`: unique terminal PAs with valid `woba_denom`
- `battedBallEvents`: unique completed plate appearances with valid tracked batted-ball data
- `untrackedBattedBallEvents`: completed batted-ball outcomes without valid launch speed
- `statcastCoverage`: valid tracked BBE / all completed BBE
- `hits`: single, double, triple, home run
- `walks`: walk plus intentional walk
- `strikeouts`: strikeout, strikeout double play
- `hardHitRate = hardHitBalls / battedBallEvents`
- `barrelRate = barrels / battedBallEvents`
- `averageExitVelocity = average(launch_speed)`
- `walkRate = walks / plateAppearances`
- `strikeoutRate = strikeouts / plateAppearances`
- `expectedBAOnContact = average(estimated_ba_using_speedangle)` across unique valid BBE
- `expectedSLGOnContact = average(estimated_slg_using_speedangle)` across unique valid BBE
- `expectedWOBAOnContact = average(estimated_woba_using_speedangle)` across unique valid BBE
- `atlasExpectedOffenseRate`: Atlas-derived hybrid rate using source expected contact values for valid BBE and actual `woba_value` for non-contact events with valid denominators

Denominators must be greater than zero. Missing values remain `undefined`.

Atlas does not label contact-only expected averages as official team `xBA`, `xSLG` or `xwOBA`. Complete official xwOBA remains undefined unless a compatible documented source aggregate is connected.

## Sample Quality

Central thresholds:

- Last 7 sufficient: 7 games, PA >= 150, BBE >= 80
- Last 14 sufficient: 14 games, PA >= 300, BBE >= 160
- Last 30 sufficient: 30 games, PA >= 640, BBE >= 340

Classification:

- `SUFFICIENT`: expected games and sample thresholds met
- `LIMITED`: enough completed games to be useful but below sufficient thresholds
- `INSUFFICIENT`: fewer than the minimum completed games for the requested window
- `UNAVAILABLE`: no usable records or source failure

## League Baseline and Offensive Score

The baseline service builds same-source league/team-window averages from Statcast-derived rolling metrics. It stores metric mean, standard deviation, timestamp and sample size.

Atlas Offensive Score remains 0-100 and uses z-score normalization when a valid baseline exists:

- quality of contact: hard-hit rate, barrel rate, exit velocity
- plate discipline: walk rate, inverse strikeout rate
- contact expected metrics: expectedWOBAOnContact, expectedSLGOnContact, expectedBAOnContact
- recency: last 7 weighted 0.50, last 14 weighted 0.30, last 30 weighted 0.20

If baseline is unavailable, sample quality fails, or `MLB_OFFENSIVE_SCORE_ENABLED=false`, raw metrics can be available while the score remains unavailable. Contact-family metrics are intentionally lower-weighted so hard-hit rate, barrel rate, exit velocity and expected-contact metrics are not treated as six fully independent signals.

## Caching

Server-side only:

- Statcast CSV cache: 45 minutes
- Official schedule cache: existing MLB official client cache
- Historical completed windows become naturally stable because `gamePk` windows do not change after completion

The provider records cache hit/miss, last successful refresh, source latency and errors in health output.

## Persistence

Implemented:

- `mlb_offensive_form_snapshots.sql`
- `insertOffensiveFormSnapshotsDeduped`
- unique `feature_hash` dedupe

Production persistence is not enabled or applied in this phase. The provider does not store raw pitch-level rows.

## Feature Flags

All default false:

- `MLB_SPORTS_INTELLIGENCE_ENABLED`
- `MLB_OFFENSIVE_FORM_MODEL_ENABLED`
- `MLB_STATCAST_PROVIDER_ENABLED`
- `MLB_OFFENSIVE_SCORE_ENABLED`

Behavior:

- Global false: no provider request
- Statcast false: offensive form unavailable
- Provider true and score false: raw rolling metrics available, score unavailable
- Score true: score only when baseline and sample quality pass

No flag combination changes picks, ranking, Top Signal, Top Play, closing or grading.

## Audit Output

`GET /api/internal/mlb-engine-audit?details=1` now includes:

- provider
- provider health
- raw data availability
- score availability
- baseline availability
- teams available/unavailable
- cache health
- selected game home/away last 7/14/30 metrics
- sample quality
- component breakdown when score is genuinely calculated

The audit does not expose raw pitch-level rows.

## Live Validation

Production flags remain false, so live production does not request Statcast yet. Deterministic fixtures validate mapping, completed-game selection, doubleheaders, denominators, aggregation, baseline scoring and no scoring-pipeline connection.

Local live diagnostic examples can be run later with temporary protected flags after legal/usage review and before production enablement.

## Known Limitations

- Baseball Savant CSV availability and request tolerance are operational risks.
- Current baseline is computed from available provider window samples, not a full 30-team production baseline store.
- Suspended games are conservatively excluded.
- Complete official team xwOBA/xBA/xSLG are not calculated in this phase.
- `atlasExpectedOffenseRate` is Atlas-derived and must not be represented as official MLB xwOBA.
- No platoon, pitcher comparison, projected runs or win probability is calculated.

## Why Picks Remain Unchanged

The offensive provider is only reachable through Sports Intelligence audit/provider paths and is gated by false flags. `automationUtils.ts`, candidate scoring, ranking, public signals, Top 5, Top Signal and Top Play are untouched.

## Recommended Phase 5.2

Add protected live diagnostics for four teams, apply the snapshot table after approval, review Baseball Savant production usage, then enable raw provider flags for audit-only observation before considering score enablement.
