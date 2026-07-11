# Atlas MLB Sports Intelligence Phase 9.1

## Current Prior Audit

Phase 9 used `starting_pitcher_quality_v1` with centralized initial priors:

- ERA mean 4.20, SD 1.00, lower is better.
- WHIP mean 1.30, SD 0.22, lower is better.
- K% mean 0.220, SD 0.055, higher is better.
- BB% mean 0.085, SD 0.030, lower is better.
- K-BB% mean 0.135, SD 0.065, higher is better.
- Hits/BF mean 0.220, SD 0.045, lower is better.
- HR/BF mean 0.032, SD 0.018, lower is better.
- Runs/IP mean 0.490, SD 0.150, lower is better.

Metric weights remain unchanged: ERA 16%, WHIP 14%, K% 16%, BB% 12%, K-BB% 18%, hits/BF 10%, HR/BF 8%, runs/IP 6%. Window weights remain SEASON 50%, LAST_30_DAYS 25%, LAST_5_STARTS 15%, LAST_3_STARTS 10%. Missing metrics are skipped and remaining weights are rebalanced. Z-scores are capped before conversion to a 0-100 score.

## Starter Population

Phase 9.1 builds a broad starter-only population from official MLB Stats API season pitching splits. Pitchers with `gamesStarted = 0` are excluded. Each player ID appears once in the league population to avoid duplicated samples for traded players. Game logs are then fetched per starter and only rows with `gamesStarted > 0` enter quality windows.

## Starter-Only Verification

Relief rows are excluded from windows. Doubleheaders remain distinct through official game-log rows. Incomplete or missing denominator rows produce unavailable metrics instead of fabricated values. Very short single starts are flagged as possible opener usage.

## Window Methodology

The engine keeps compatible windows:

- `SEASON`: all official starts in the current season.
- `LAST_30_DAYS`: date-based official starts within 30 days of capture time.
- `LAST_5_STARTS`: last five official starts.
- `LAST_3_STARTS`: last three official starts.

Calendar windows and start-count windows are not mixed.

## Metrics And Formulas

All innings are stored internally as outs. Display innings use baseball notation.

- ERA = earned runs * 27 / outs.
- WHIP = hits plus walks divided by innings.
- K% = strikeouts / batters faced.
- BB% = walks / batters faced.
- K-BB% = (strikeouts - walks) / batters faced.
- Hits/BF = hits / batters faced.
- HR/BF = home runs / batters faced.
- Runs/IP = runs allowed / innings.

Undefined denominators remain undefined.

## Sample Policy Review

Existing sample policy is retained:

- SEASON sufficient: 8 starts and 40 innings.
- LAST_30_DAYS sufficient: 3 starts and 15 innings.
- LAST_5_STARTS sufficient: 4 starts.
- LAST_3_STARTS sufficient: 3 starts.

Production baseline eligibility for SEASON uses one pitcher ID with at least five starts and 20 innings. Recent windows require non-unavailable starter-only samples and must pass the configured population threshold.

## Production Baseline Schema

Baselines are stored in `public.mlb_pitcher_quality_baseline_snapshots`, one row per season, window and metric. Rows include pitcher count, sample policy, mean, standard deviation, median, minimum, maximum, source timestamps, `baseline_version`, `baseline_hash` and canonical state.

## Readiness Rules

A production baseline is ready only when the starter-only population is verified, pitcher count meets the configured window threshold, standard deviation is non-zero, metrics are finite and the same pitcher ID does not appear twice in one baseline. If readiness fails, scoring falls back to `INITIAL_PRIOR_FALLBACK`.

## Baseline Versioning

Current baseline version: `starting_pitcher_baseline_v1`.

Every snapshot persists `quality_version`, `baseline_version`, `baseline_source`, `baseline_as_of`, source versions, sample quality and components. A new baseline version creates a new material hash; timestamp-only recalculations dedupe.

## Prior Vs Production Comparison

The capture route calculates prior and production scores side by side for each resolved upcoming starter. The response reports score deltas, season contribution, recent contribution and the largest positive/negative changes. This is diagnostic only and does not change picks.

## Distribution

The protected audit endpoint reports canonical production quality distribution, readiness distribution and confidence distribution. Noncanonical rows remain in history but are excluded from current distributions.

## Confidence Calibration

Confidence depends on season sample, recent-window coverage, warnings, baseline readiness and advanced metric coverage. Since verified advanced Statcast metrics remain unavailable in Phase 9.1, confidence should not be forced into HIGH solely because basic official stats exist.

## Canonical History

Prior Phase 9 rows remain available as noncanonical history once production-baseline rows are captured. Current audit distribution reads canonical rows only.

## Stability

Feature hashes include material quality inputs, readiness inputs, score, confidence, source versions, quality version, baseline version and baseline source. `captured_at` is intentionally excluded from the hash.

## Manual Verification

Manual verification should select top, bottom and middle production scores from the protected capture response, then compare starts, outs, earned runs, hits, walks, strikeouts, home runs, batters faced and window dates against official MLB game logs.

## Team Quality Isolation

Pitcher Quality is not consumed by Team Quality in Phase 9.1. The Team Quality component placeholder remains undefined.

## Pick Isolation

`candidateScore`, `buildCandidate`, public signals, Top 5, Top Signal, Top Play, closing and grading do not import Pitcher Quality modules. Sports Projection remains `UNAVAILABLE`.

## Known Limitations

Advanced Statcast pitching metrics are not connected. Baselines depend on currently available official starter game logs. Starter Quality is audit-only and should not be interpreted as a prediction.

## Recommended Phase 9.2

Observe production baseline stability across multiple captures, review prior-vs-production deltas and confidence tiers, then decide whether to introduce a protected Team Quality research component. Do not connect it to picks without a separate explicit phase.
