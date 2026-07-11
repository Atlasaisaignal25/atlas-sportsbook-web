# Atlas MLB Sports Intelligence Phase 9.1.1 Live Validation

Validation time: 2026-07-11 01:25 UTC.

Production URL: https://atlas-sportsbook-web.vercel.app

## Decision

Status: `READY_FOR_RESEARCH_INTEGRATION`

This means Pitcher Quality is ready for protected research-only review. It does not mean it is connected to Team Quality, picks, projected runs, win probability or public UI.

## Production Tables

Both production tables exist in `public`.

### `mlb_pitcher_quality_baseline_snapshots`

- Primary key: `mlb_pitcher_quality_baseline_snapshots_pkey`
- Unique hash constraint: `mlb_pitcher_quality_baseline_snapshots_baseline_hash_key`
- Relevant indexes:
  - `idx_mlb_pitcher_quality_baselines_lookup`
  - `idx_mlb_pitcher_quality_baselines_version`
  - `mlb_pitcher_quality_baseline_snapshots_baseline_hash_key`
  - `mlb_pitcher_quality_baseline_snapshots_pkey`
- Required fields confirmed: `id`, `baseline_hash`, `baseline_version`, `canonical`
- Row count after validation captures: 96 total, 32 canonical, 64 noncanonical
- Duplicate baseline hashes: 0

### `mlb_starting_pitcher_quality_snapshots`

- Primary key: `mlb_starting_pitcher_quality_snapshots_pkey`
- Unique hash constraint: `mlb_starting_pitcher_quality_snapshots_feature_hash_key`
- Relevant indexes:
  - `idx_mlb_starting_pitcher_quality_baseline`
  - `idx_mlb_starting_pitcher_quality_canonical`
  - `idx_mlb_starting_pitcher_quality_captured_at`
  - `idx_mlb_starting_pitcher_quality_feature_hash`
  - `idx_mlb_starting_pitcher_quality_game`
  - `idx_mlb_starting_pitcher_quality_player`
  - `mlb_starting_pitcher_quality_snapshots_feature_hash_key`
  - `mlb_starting_pitcher_quality_snapshots_pkey`
- Required fields confirmed: `id`, `feature_hash`, `canonical`, `baseline_version`, `baseline_source`, `baseline_as_of`
- Row count after validation captures: 145 total, 29 canonical, 116 noncanonical
- Duplicate feature hashes: 0
- Duplicate canonical pitcher/game states: 0
- Malformed records: 0

## Starter Archive

- Official source returned pitchers: 742
- Unique pitcher IDs inspected: 742
- Pitchers with `gamesStarted > 0`: 304
- Relief-only pitchers excluded: 438
- Traded pitcher duplicate rows removed: 0
- Baseline eligible pitchers, at least 5 starts and at least 20 IP: 188
- Total official starts included: 2,820
- Relief rows excluded from starter windows: 0 in the aggregate production archive
- Duplicate game-log rows removed: 0 observed
- Opener warnings: 29
- Provider errors: none

## Window Sample Distributions

Existing thresholds are retained. They are strict enough to flag limited samples without rejecting the overall baseline population.

| Window | Valid sample | Sufficient | Limited | Insufficient | Unavailable | Median starts | P25/P75 starts | Median IP | P25/P75 IP | Median BF | P25/P75 BF |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: | --- |
| SEASON | 304 | 152 | 40 | 112 | 0 | 8 | 2 / 16 | 39.7 | 6.7 / 84.3 | 174 | 30 / 363 |
| LAST_30_DAYS | 215 | 137 | 25 | 53 | 89 | 2 | 0 / 5 | 10.7 | 0 / 25.0 | 46 | 0 / 108 |
| LAST_5_STARTS | 304 | 207 | 56 | 41 | 0 | 5 | 2 / 5 | 22.3 | 6.3 / 27.0 | 101 | 28 / 115 |
| LAST_3_STARTS | 304 | 228 | 35 | 41 | 0 | 3 | 2 / 3 | 13.7 | 6.0 / 16.0 | 61 | 27 / 69 |

## Baseline Readiness

Total possible baselines: 32. Ready: 32. Not ready: 0. Fallback priors required for current canonical rows: 0.

| Window | Metric count | Canonical | Pitcher count |
| --- | ---: | ---: | --- |
| SEASON | 8 | 8 | 188 |
| LAST_30_DAYS | 8 | 8 | 215 |
| LAST_5_STARTS | 8 | 8 | 304 |
| LAST_3_STARTS | 8 | 8 | 304 |

Season baseline examples:

| Metric | Pitchers | Mean | SD | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ERA | 188 | 4.4336 | 1.5792 | 4.2300 | 1.6200 | 10.3500 |
| WHIP | 188 | 1.3140 | 0.2484 | 1.3080 | 0.7570 | 2.2150 |
| K% | 188 | 0.2174 | 0.0520 | 0.2133 | 0.1105 | 0.3957 |
| BB% | 188 | 0.0855 | 0.0273 | 0.0801 | 0.0227 | 0.1895 |
| K-BB% | 188 | 0.1319 | 0.0621 | 0.1255 | -0.0421 | 0.3318 |
| Hits/BF | 188 | 0.2198 | 0.0318 | 0.2196 | 0.1351 | 0.3135 |
| HR/BF | 188 | 0.0334 | 0.0132 | 0.0315 | 0.0042 | 0.0882 |
| Runs/IP | 188 | 0.5274 | 0.1820 | 0.5065 | 0.1890 | 1.2056 |

Recent windows have wider standard deviations, especially ERA/WHIP, because short samples naturally include extreme starts. This is acceptable for audit-only use because scores cap z-scores and confidence prevents HIGH tiers without advanced coverage.

## Capture Validation

Unauthorized route test returned 401.

First production capture in this validation:

- Games inspected: 16
- Probable starters resolved: 29
- Confirmed starters resolved: 0, route uses probable starters from schedule hydrate
- Pitchers quality scored: 29
- Production baseline rows: 29
- Prior fallback rows: 0 for current canonical snapshots
- Pitchers unavailable: 0
- Readiness scores calculated: 29
- Baselines inserted: 32
- Duplicate baselines skipped: 0
- Snapshots inserted: 29
- Duplicate snapshots skipped: 0
- Storage healthy: true
- Provider errors: none

Second production capture with unchanged source state:

- Baselines inserted: 0
- Duplicate baselines skipped: 32
- Snapshots inserted: 0
- Duplicate snapshots skipped: 29
- Storage healthy: true
- Score drift: none observed
- Confidence drift: none observed

## Prior Vs Production

Compared starters: 29.

- Mean absolute delta: 3.0
- Median absolute delta: 3.2
- Changes above 5 points: 2
- Changes above 10 points: 0
- Max positive delta: Noah Cameron, +6.6
- Max negative delta: Logan Gilbert, -5.9

Top positive deltas:

| Pitcher | Team | Prior | Production | Delta |
| --- | --- | ---: | ---: | ---: |
| Noah Cameron | Kansas City Royals | 38.3 | 44.9 | +6.6 |
| Freddy Peralta | New York Mets | 42.8 | 47.5 | +4.7 |
| Matthew Liberatore | St. Louis Cardinals | 40.8 | 45.3 | +4.5 |
| Walker Buehler | San Diego Padres | 43.4 | 47.8 | +4.4 |
| Miles Mikolas | Washington Nationals | 36.3 | 40.3 | +4.0 |

Top negative deltas:

| Pitcher | Team | Prior | Production | Delta |
| --- | --- | ---: | ---: | ---: |
| Logan Gilbert | Seattle Mariners | 68.0 | 62.1 | -5.9 |
| Eury Perez | Miami Marlins | 63.6 | 58.7 | -4.9 |
| Yoshinobu Yamamoto | Los Angeles Dodgers | 65.1 | 60.5 | -4.6 |
| Griffin Jax | Tampa Bay Rays | 62.0 | 58.1 | -3.9 |
| Cam Schlittler | New York Yankees | 65.7 | 62.3 | -3.4 |

Interpretation: deltas are moderate and explainable. Production baselines reduce prior inflation for strong pitchers because the real 2026 starter distribution is slightly more favorable in several season metrics than the initial constants assumed. They lift some weaker prior scores because real recent-window variance is wider than the initial priors.

## Quality Distribution

Full scored starter population:

| Group | Count | Mean | Median | SD | Min | Max | P10 | P25 | P75 | P90 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All starters | 304 | 49.6 | 49.7 | 7.6 | 30.2 | 68.7 | 39.4 | 44.8 | 55.0 | 59.3 |
| Eligible starters | 188 | 50.2 | 50.2 | 6.8 | 30.2 | 68.7 | 41.6 | 45.2 | 55.0 | 59.4 |
| Eligible MEDIUM | 178 | 50.5 | 50.7 | 6.6 | 30.2 | 68.7 | 42.2 | 45.4 | 55.2 | 59.4 |
| Eligible LOW | 10 | 45.0 | 45.1 | 8.5 | 32.1 | 62.5 | 32.1 | 39.6 | 48.8 | 50.0 |

Upcoming probable starters:

| Count | Mean | Median | SD | Min | Max | P10 | P25 | P75 | P90 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 29 | 51.6 | 51.1 | 5.9 | 40.3 | 62.3 | 44.8 | 47.5 | 54.9 | 60.4 |

Calibration checks:

- Saturation: none. No production scores near 0 or 100.
- Compression: acceptable for audit-only. Upcoming starters range 40.3 to 62.3; full population ranges 30.2 to 68.7.
- Extreme outliers: none in score output, despite recent-window raw metric outliers.
- Tiny-sample inflation: controlled by confidence; 10 eligible starters remain LOW.
- Inverted metrics: no evidence. Lower ERA/WHIP/HR/BF improves score; higher K/K-BB improves score.
- Recent-window domination: no evidence. Season remains 50% of total quality.

## Readiness Distribution

Upcoming readiness:

| Count | Mean | Median | SD | Min | Max | P10 | P25 | P75 | P90 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 29 | 83.3 | 82.2 | 4.5 | 75.2 | 87.8 | 75.2 | 82.2 | 87.8 | 87.8 |

Readiness is separate from quality. Deterministic validations confirm:

- Probable/confirmed status changes readiness only.
- Short rest lowers readiness only.
- Recent pitch count affects readiness only.
- Readiness does not alter quality.

Examples:

- High quality / lower readiness: Joe Ryan, quality 60.4, readiness 75.2.
- Low quality / high readiness: Kyle Freeland, quality 44.8, readiness 87.8.

## Confidence Distribution

Upcoming starters:

- HIGH: 0
- MEDIUM: 29
- LOW: 0
- UNAVAILABLE: 0
- Average advanced metric coverage: 0
- Baseline fallback count: 0

Full eligible population:

- HIGH: 0
- MEDIUM: 178
- LOW: 10

Confidence is not overstated. Even established starters remain MEDIUM because verified advanced Statcast pitching metrics are absent.

## Manual Verification Examples

The following values came from canonical production snapshots and official MLB game logs.

### Cam Schlittler

- Player ID: 693645
- Team: New York Yankees
- Quality: 62.3
- Season starts: 19
- Season window: 2026-03-27 to 2026-07-06
- Outs: 336
- Innings: 112.0
- ER/H/BB/K/HR/BF: 25 / 83 / 21 / 131 / 10 / 442
- ERA: 2.01
- WHIP: 0.929
- K%: 0.2964
- BB%: 0.0475
- K-BB%: 0.2489
- Direction: strong run prevention, WHIP and K-BB support top score. Tolerance: rounded values match stored components.

### Logan Gilbert

- Player ID: 669302
- Team: Seattle Mariners
- Quality: 62.1
- Season starts: 18
- Season window: 2026-03-26 to 2026-07-04
- Outs: 322
- Innings: 107.1
- ER/H/BB/K/HR/BF: 38 / 80 / 22 / 114 / 14 / 419
- ERA: 3.19
- WHIP: 0.950
- K%: 0.2721
- BB%: 0.0525
- K-BB%: 0.2196
- Direction: strong WHIP and K-BB keep score high; production baseline reduced prior score by 5.9 because real starter baseline is stronger than the initial prior.

### Miles Mikolas

- Player ID: 571945
- Team: Washington Nationals
- Quality: 40.3
- Season starts: 8
- Season window: 2026-03-28 to 2026-07-06
- Outs: 114
- Innings: 38.0
- ER/H/BB/K/HR/BF: 36 / 49 / 12 / 25 / 11 / 175
- ERA: 8.53
- WHIP: 1.605
- K%: 0.1429
- BB%: 0.0686
- K-BB%: 0.0743
- Direction: poor ERA, WHIP, hits/BF, HR/BF and runs/IP correctly lower score. Tolerance: rounded values match stored components.

Additional selections:

- Top 3: Cam Schlittler 62.3, Logan Gilbert 62.1, Yoshinobu Yamamoto 60.5.
- Bottom 3: Miles Mikolas 40.3, Erick Fedde 44.5, Kyle Freeland 44.8.
- Near median: Ryan Johnson 49.0, Shane Drohan 50.0, Javier Assad 50.8.
- Strong season / weak recent: Cristopher Sanchez, season component 61.7, recent component 47.1.
- Weak season / stronger recent: Miles Mikolas, season component 33.1, recent component 41.8.
- Limited sample: Shane Drohan, season sample LIMITED, quality 50.0.

## Audit Endpoint Agreement

`GET /api/internal/mlb-engine-audit?details=1` returned:

- Status: 200
- Mode: `AUDIT_ONLY`
- Quality version: `starting_pitcher_quality_v1`
- Baseline version: `starting_pitcher_baseline_v1`
- Baseline source: `PRODUCTION_BASELINE`
- Baseline health: healthy
- Baselines: 96 total, 32 canonical
- Snapshot storage: healthy
- Snapshots: 145 total, 29 canonical, 116 noncanonical
- Pitchers scored: 29
- Prior fallback count: 0
- Quality distribution: count 29, mean 51.6, median 51.1
- Readiness distribution: count 29, mean 83.3, median 82.2
- Confidence distribution: MEDIUM 29
- Sports Projection: `UNAVAILABLE`

No mismatch was found between audit endpoint, capture response and database reality.

## Pick And Team Quality Isolation

Confirmed by validators and source inspection:

- Team Quality does not consume Pitcher Quality.
- `automationUtils.ts` does not import Pitcher Quality.
- `candidateScore` unchanged.
- `buildCandidate` unchanged.
- Public signals unchanged.
- Top 5 unchanged.
- Top Signal unchanged.
- Top Play unchanged.
- Closing unchanged.
- Grading unchanged.
- Sports Projection remains `UNAVAILABLE`.

Current Top 5 from audit endpoint remains:

1. Colorado Rockies (+1.5)
2. Kansas City Royals (+1.5)
3. Athletics (+1.5)
4. Texas Rangers (+1.5)
5. Pittsburgh Pirates ML

## Validation Commands

Passed:

- `npm run validate:mlb-pitcher-baselines`
- `npm run validate:mlb-pitcher-quality`
- `npm run validate:mlb-team-intelligence`
- `npm run validate:mlb-team-strength`
- `npm run validate:mlb-weather-park-provider`
- `npm run validate:mlb-bullpen-season-quality`
- `npm run validate:mlb-bullpen-calibration`
- `npm run validate:mlb-bullpen-provider`
- `npm run validate:mlb-offensive-score`
- `npm run validate:mlb-offensive-form-provider`
- `npm run validate:mlb-sports-intelligence`
- `npm run validate:mlb-engine`
- `npm run validate:mlb-lineup-snapshots`
- `npm run validate:mlb-lineup-provider`
- `npm run validate:mlb-pitcher-provider`
- `npm run validate:odds-movement`
- `npx tsc --noEmit`
- `npm run build`

Note: an initial `tsc` run hit stale duplicate generated files in `.next/types`. Removing `.next` and rerunning passed cleanly. This was a local generated artifact issue, not a source-code failure.

## Known Limitations

- No verified advanced Statcast pitching metrics are connected yet.
- Confidence remains intentionally capped away from HIGH because advanced coverage is 0.
- Recent-window baselines are ready but naturally have wider variance.
- This is audit-only; no betting selection logic consumes these scores.

## Recommended Next Phase

Phase 9.2 should keep the module research-only and monitor stability over multiple slates. If deltas and distributions remain stable, add a protected Team Quality research component behind an explicit audit-only flag. Do not connect to picks or public UI without a separate approval phase.
