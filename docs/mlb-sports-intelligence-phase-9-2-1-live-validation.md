# Atlas MLB Sports Intelligence Phase 9.2.1 Live Validation

Validation time: 2026-07-11T02:14:00.523Z

Production URL: https://atlas-sportsbook-web.vercel.app

## Acceptance Decision

NOT_ENOUGH_COMPLETE_DATA

The Team Quality Research pipeline is matching, persisting, deduping, and isolating correctly, but it is not ready for projection research because production currently has 0 AVAILABLE rows. All 29 canonical research rows are PARTIAL because Atlas Offensive Score is missing from the game/team/starter research rows.

## Production State

- `MLB_TEAM_QUALITY_RESEARCH_ENABLED`: confirmed active through protected capture response.
- `MLB_TEAM_QUALITY_RESEARCH_MODE`: `RESEARCH_ONLY`.
- `MLB_TEAM_QUALITY_RESEARCH_WEIGHT_VERSION`: `tq_research_v1`.
- Table exists: `public.mlb_team_intelligence_snapshots`.
- Total rows before validation capture: 59.
- Team Quality v1 rows: 30.
- Team Quality v2 research rows: 29.
- Canonical research rows before capture: 29.
- Primary key: `mlb_team_intelligence_snapshots_pkey`.
- Unique feature hash constraint: `mlb_team_intelligence_snapshots_feature_hash_key`.
- Research indexes present:
  - `idx_mlb_team_intelligence_research_game_pitcher`
  - `idx_mlb_team_intelligence_research_version`

## Capture Validation

Unauthorized request:

- Status: 401.
- Error: `Unauthorized`.

First authorized capture during this validation:

- Status: 200.
- Games inspected: 15.
- Team sides inspected: 29.
- AVAILABLE: 0.
- PARTIAL: 29.
- LIMITED: 0.
- UNAVAILABLE: 0.
- Snapshots inserted: 0.
- Duplicate snapshots skipped: 29.
- Starter mismatches: 0.
- Baseline mismatches: 0.
- Provider errors: none.
- Storage healthy: true.

Note: 29 research rows already existed before this Phase 9.2.1 validation, so the first authorized capture in this run correctly skipped unchanged snapshots.

Second authorized capture:

- Status: 200.
- Snapshots inserted: 0.
- Duplicate snapshots skipped: 29.
- No timestamp-only duplicates.
- No duplicate feature hashes.
- No duplicate canonical game/team/side states.
- No score, confidence, starter identity, or ranking drift observed.

## Module Matching

- Perfect game/team/side/starter matches: 29.
- Starter mismatches: 0.
- Missing pitcher rows: 0.
- Baseline mismatches: 0.
- Stale module matches detected: 0.
- Rejected rows from pitcher mismatch: 0.

Pitcher rows were canonical and used:

- `baseline_source = PRODUCTION_BASELINE`
- `baseline_version = starting_pitcher_baseline_v1`

Offense module was missing for all 29 rows. Bullpen module was present for all 29 rows.

## Coverage

Counts:

- AVAILABLE: 0, 0.0%.
- PARTIAL: 29, 100.0%.
- LIMITED: 0, 0.0%.
- UNAVAILABLE: 0, 0.0%.

PARTIAL missing module breakdown:

- Missing offense: 29.
- Missing pitcher: 0.
- Missing bullpen: 0.

Missing modules were not converted to zero. For PARTIAL rows, score weights were rebalanced over the available pitcher and bullpen modules, then coverage penalty was applied. Complete and partial rankings remain separate.

## V2 Distribution

AVAILABLE distribution:

- Count: 0.

PARTIAL distribution:

- Count: 29.
- Mean: 46.9.
- Median: 47.9.
- Standard deviation: 5.2.
- Minimum: 37.1.
- Maximum: 57.3.
- p10: 39.2.
- p25: 43.3.
- p75: 50.5.
- p90: 53.1.

LIMITED distribution:

- Count: 0.

Distribution interpretation:

- No saturation near 0 or 100.
- Scores are compressed into 37.1 to 57.3 because every row is missing offense and receives partial-coverage treatment.
- No artificial score inflation from missing offense was observed.
- Pitcher influence is high in partial rows because offense is unavailable.
- Bullpen remains relevant but secondary.
- Offense irrelevance is caused by missing production offense rows, not by weight design.

## V1 vs V2

Summary:

- Rows compared: 29.
- Mean absolute delta: 8.7.
- Median absolute delta: 8.0.
- Changed more than 5 points: 26.
- Changed more than 10 points: 10.

Top positive deltas:

| Team | Game | Side | V1 | V2 | Delta | Pitcher | Bullpen | Coverage |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Minnesota Twins | 823682 | HOME | 30.1 | 49.5 | +19.4 | 60.4 | 38.9 | 66.7 |
| Seattle Mariners | 822953 | AWAY | 36.9 | 53.1 | +16.2 | 62.1 | 47.8 | 66.7 |
| Athletics | 824576 | AWAY | 30.0 | 44.0 | +14.0 | 51.9 | 38.8 | 66.7 |
| Kansas City Royals | 824813 | AWAY | 23.3 | 37.1 | +13.8 | 44.9 | 30.2 | 66.7 |
| Los Angeles Dodgers | 823926 | HOME | 41.6 | 53.8 | +12.2 | 60.5 | 53.9 | 66.7 |

Smallest positive deltas:

| Team | Game | Side | V1 | V2 | Delta | Pitcher | Bullpen | Coverage |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Chicago White Sox | 824576 | HOME | 40.8 | 43.3 | +2.5 | 44.5 | 52.8 | 66.7 |
| Atlanta Braves | 823030 | AWAY | 47.9 | 51.2 | +3.3 | 52.8 | 62.0 | 66.7 |
| Milwaukee Brewers | 823356 | AWAY | 45.0 | 48.3 | +3.3 | 50.0 | 58.2 | 66.7 |
| St. Louis Cardinals | 823030 | HOME | 37.0 | 42.4 | +5.4 | 45.3 | 47.9 | 66.7 |
| Cleveland Guardians | 823844 | AWAY | 42.8 | 48.2 | +5.4 | 51.1 | 55.4 | 66.7 |

Largest change explanation:

- Minnesota moved from V1 30.1 to V2 49.5 because V2 used a 60.4 Starting Pitcher Quality score and 38.9 Bullpen Quality score, with offense missing and coverage at 66.7%.

## Sensitivity

Configuration A, 45 pitcher / 35 offense / 20 bullpen:

- Count: 29.
- Mean: 46.9.
- Median: 47.9.
- SD: 5.2.
- Min: 37.1.
- Max: 57.3.
- Ranking correlation with A: 1.000.
- Mean absolute delta from A: 0.000.
- Contribution shares in current partial state: pitcher 69.23%, offense 0.00%, bullpen 30.77%.

Configuration B, 40 pitcher / 40 offense / 20 bullpen:

- Count: 29.
- Mean: 46.8.
- Median: 47.9.
- SD: 5.2.
- Min: 36.8.
- Max: 57.3.
- Ranking correlation with A: 1.000.
- Mean absolute delta from A: 0.128.
- Contribution shares in current partial state: pitcher 66.67%, offense 0.00%, bullpen 33.33%.
- Largest rank mover: Seattle Mariners moved from rank 4 to 6, score 53.1 to 52.7.

Configuration C, 50 pitcher / 30 offense / 20 bullpen:

- Count: 29.
- Mean: 46.9.
- Median: 47.9.
- SD: 5.2.
- Min: 37.1.
- Max: 57.3.
- Ranking correlation with A: 1.000.
- Mean absolute delta from A: 0.103.
- Contribution shares in current partial state: pitcher 71.43%, offense 0.00%, bullpen 28.57%.
- Largest rank movers moved only 1 rank.

Sensitivity interpretation:

- A/B/C are stable under current partial data.
- Stability is not sufficient for projection readiness because offense is absent from all rows.
- Pitcher dominance is expected and excessive in current production rows because only pitcher and bullpen are present.
- Recommended provisional configuration remains A, but only for continued research capture, not projection research.

## Component Correlations

Complete rows:

- n = 0.
- Offense vs pitcher: unavailable.
- Offense vs bullpen: unavailable.
- Pitcher vs bullpen: unavailable.

Partial available rows:

- n = 29.
- Pitcher vs bullpen Pearson: 0.481.
- Pitcher vs bullpen Spearman: 0.513.
- Pitcher vs final Pearson: 0.927.
- Pitcher vs final Spearman: 0.939.
- Bullpen vs final Pearson: 0.774.
- Bullpen vs final Spearman: 0.742.

Interpretation:

- No complete-row independence study is possible yet.
- Current partial rows show pitcher is the stronger driver of final score.
- The modules are not near-duplicates, but offense absence prevents full independence validation.

## Confidence

- HIGH: 0.
- MEDIUM: 29.
- LOW: 0.
- UNAVAILABLE: 0.

Common cause:

- All rows are PARTIAL due to missing offense.
- Pitcher quality confidence and partial coverage cap the combined confidence.
- Confidence is stored separately and does not increase Team Quality.

## Real Examples

High offense / weak starter:

- Not available. Offense is missing for all 29 production research rows.

Weak offense / strong starter:

- Not available. Offense is missing for all 29 production research rows.

Strong bullpen / weak starter:

- Not available under the requested threshold. No row had bullpen >= 60 and starter < 45.

High Team Quality / low Game Readiness:

- Not available in current rows.

Low Team Quality / high Game Readiness:

- Cincinnati Reds, game 824492, HOME.
- Pitcher: Nick Lodolo, player ID 666157.
- Offense: unavailable.
- Pitcher Quality: 48.1.
- Bullpen Quality: 41.5.
- A/B/C scores: 42.4 / 42.2 / 42.5.
- A contribution: pitcher 33.30, bullpen 12.77.
- Coverage: 66.7.
- Confidence: MEDIUM.
- Game Readiness: 88.7.

PARTIAL row:

- New York Yankees, game 822711, AWAY.
- Pitcher: Cam Schlittler, player ID 693645.
- Offense: unavailable.
- Pitcher Quality: 62.3.
- Bullpen Quality: 62.4.
- A/B/C scores: 57.3 / 57.3 / 57.3.
- A contribution: pitcher 43.13, bullpen 19.20.
- Coverage: 66.7.
- Confidence: MEDIUM.
- Game Readiness: 77.9.

Configuration C material rank change:

- Washington Nationals, game 822711, HOME.
- Pitcher: Miles Mikolas, player ID 571945.
- A rank 28, C rank 29.
- A/B/C scores: 37.1 / 37.1 / 37.1.
- This is not materially meaningful; the maximum observed C rank movement was 1 rank.

Configuration A and B nearly identical:

- Washington Nationals, game 822711, HOME.
- A/B/C scores: 37.1 / 37.1 / 37.1.
- A/B score delta: 0.

## Storage Audit

- Total rows: 59.
- Canonical research rows: 29.
- Noncanonical research rows: 0.
- V1 rows: 30.
- V2 research rows: 29.
- Duplicate feature hashes: 0.
- Duplicate canonical game/team/side states: 0.
- Malformed research rows: 0.
- Latest research capture: 2026-07-11T01:56:21.034+00:00.
- Rows by availability: PARTIAL 29.

Audit rankings use canonical research rows only.

## Audit Endpoint Agreement

`GET /api/internal/mlb-engine-audit?details=1` agreed with database/capture reality:

- Status: 200.
- Team Quality Research enabled: true.
- Mode: `RESEARCH_ONLY`.
- Version: `team_quality_v2_research`.
- Canonical rows: 29.
- PARTIAL rows: 29.
- Confidence distribution: MEDIUM 29.
- V1/V2 compared: 29.
- V1/V2 mean absolute delta: 8.7.
- V1/V2 median absolute delta: 8.0.
- Sensitivity A count: 29.
- Sports Projection: `UNAVAILABLE`.
- Public scoring impact: `NONE`.

No mismatch was found.

## Pick Isolation

Confirmed by source scan:

- `automationUtils.ts` does not import or reference `team_quality_v2_research`.
- `candidateScore` does not reference Team Quality Research.
- `buildCandidate` does not reference Team Quality Research.
- Public signals do not reference Team Quality Research.
- Top 5 does not reference Team Quality Research.
- Top Signal does not reference Team Quality Research.
- Top Play does not reference Team Quality Research.
- Closing and grading routes do not reference Team Quality Research.
- Sports Projection remains `UNAVAILABLE`.

Recent Top 5 observed during audit remained:

1. Colorado Rockies (+1.5)
2. Kansas City Royals (+1.5)
3. Athletics (+1.5)
4. Texas Rangers (+1.5)
5. Pittsburgh Pirates ML

## Validation Commands

Passed:

- `npm run validate:mlb-team-quality-research`
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

During the first local TypeScript run, `.next/types` contained duplicate generated files. After removing `.next`, TypeScript and build passed cleanly. No source-code bug was found.

## Known Limitations

- There are currently 0 complete rows.
- Atlas Offensive Score is absent from all 29 production research rows.
- Component independence cannot be evaluated on complete rows.
- Current final scores are pitcher-heavy because only pitcher and bullpen are available.
- Sensitivity stability is explainable but not enough for projection readiness.

## Recommended Next Phase

Phase 9.2.2 should focus on fixing production module joining for Atlas Offensive Score into game/team research rows, then re-run this same validation once AVAILABLE rows exist.
