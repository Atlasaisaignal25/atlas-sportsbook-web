# MLB Sports Intelligence Phase 6.2 - Bullpen Season Quality

## Source And Endpoints

Atlas uses the official MLB Stats API only:

- `GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate={seasonStart}&endDate={asOfDate}`
- `GET https://statsapi.mlb.com/api/v1/game/{gamePk}/boxscore`

The schedule endpoint provides completed MLB games for the season archive. Each boxscore is processed once and contributes both teams. The consumed boxscore fields are pitcher order, player identity, player position, innings pitched, batters faced, hits, walks, strikeouts, runs, earned runs, home runs, saves, holds, blown saves, games finished and pitch counts.

Official team/pitcher relief-only season splits were not used in this phase because the boxscore archive gives explicit game-level pitcher order, starter exclusion, opener warnings and rolling-window isolation from the same verified source.

## Season Archive

The provider builds one shared completed-game archive from season start through `asOf`. Completed historical boxscores are cached in memory and fetched with bounded concurrency. The archive feeds four isolated team windows:

- `SEASON`
- `LAST_30_DAYS`
- `LAST_14_DAYS`
- `LAST_7_DAYS`

## Relief-Only Classification

The first official pitcher listed for a team is excluded as the starter. Later pitchers are relief appearances. Starter-like identities that appear later in relief are included because the evidence is official game order. Potential opener/bulk-reliever games are warned but not reclassified by innings alone. Position-player pitching warnings are excluded from normal quality calculations.

Suspended or incomplete games are excluded because only completed schedule states are processed. Doubleheaders stay separate by official `gamePk`.

## Innings Parsing

Baseball innings are parsed by outs:

- `0.1` = 1 out
- `0.2` = 2 outs
- `1.0` = 3 outs
- `1.1` = 4 outs
- `1.2` = 5 outs

Aggregation uses outs internally and converts back only for display/rates.

## Sample Thresholds

Readiness thresholds:

- `SEASON`: 120 relief innings and 500 batters faced
- `LAST_30_DAYS`: 60 relief innings and 240 batters faced
- `LAST_14_DAYS`: 25 relief innings and 100 batters faced
- `LAST_7_DAYS`: 12 relief innings and 45 batters faced

Samples are classified as `SUFFICIENT`, `LIMITED`, `INSUFFICIENT` or `UNAVAILABLE`. Sample quality affects confidence, not the team score directly.

## Baselines

Baselines are persisted in `public.mlb_bullpen_quality_baseline_snapshots`. Each row is one MLB-wide baseline for one metric and one window. Canonical baselines require at least 26 teams and reject near-zero standard deviation.

Metrics:

- ERA
- WHIP
- strikeout rate
- walk rate
- K-BB rate
- hits per batter faced
- home runs per batter faced
- runs allowed per inning
- leverage execution

## Quality V2

Version: `bullpen_quality_v2`

Final weights:

- season: 50%
- last 30 days: 25%
- last 14 days: 15%
- last 7 days: 10%

Metric scores use z-score normalization against the matching window baseline. Higher score means better observed bullpen quality. Missing metrics are skipped and remaining weights are rebalanced. Fatigue is not included.

## Quality Confidence

`qualityConfidence` is separate from the score:

- `HIGH`
- `MEDIUM`
- `LOW`
- `UNAVAILABLE`

It includes season sample quality, recent sample quality, window coverage and warnings.

## V1 Versus V2

V1 remains persisted as `quality_score_v1`. V2 is persisted separately as `quality_score_v2` with season, last-30, last-14 and last-7 components. Audit output reports distribution and largest deltas.

## Effective Depth

Effective depth remains separate from quality. Phase 6.2 does not force thin teams to exist. It reports rested relievers, elevated/high fatigue counts and high-leverage availability from the existing Phase 6.1 model.

## Caching And Stability

The season schedule is fetched once per capture. Boxscores are shared across both teams and cached in memory. Snapshot and baseline rows use deterministic hashes so an identical capture does not create timestamp-only duplicates.

## Persistence

`public.mlb_bullpen_feature_snapshots` stores:

- `quality_score_v1`
- `quality_score_v2`
- `quality_confidence`
- `season_quality_component`
- `last30_quality_component`
- `last14_quality_component`
- `last7_quality_component`
- `season_sample`
- `recent_samples`
- `relief_windows`
- `baseline_version`

Historical evidence is preserved; canonical rows supersede older canonical rows without deleting them.

## Pick Isolation

Phase 6.2 is audit-only. It does not modify:

- `candidateScore`
- `buildCandidate`
- `public_signals`
- `top5_live`
- Top 5
- Top Signal
- Top Play
- closing
- grading
- public UI

Sports Projection remains `UNAVAILABLE`.

## Known Limitations

The archive uses official boxscore pitcher order, not a dedicated official relief split endpoint. Opener/bulk-reliever games are warned because official order can still represent strategy imperfectly. In-memory cache is process-local; future phases can add durable game-boxscore archive storage if request volume becomes a bottleneck.

## Recommended Phase 7

Add durable per-game boxscore archive storage, richer leverage context, roster-level active bullpen availability and injury/transaction integration while keeping all scores audit-only until explicitly promoted.

