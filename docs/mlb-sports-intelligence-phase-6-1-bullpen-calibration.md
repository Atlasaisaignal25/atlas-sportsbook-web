# MLB Sports Intelligence Phase 6.1: Bullpen Calibration

## V1 Audit

`bullpen_fatigue_v1` used a weighted sum:

- total pitches last 3 days, max 180, weight 0.32
- bullpen innings last 3 days, max 18, weight 0.18
- relievers used last 3 days, max 12, weight 0.16
- relievers on consecutive days, max 5, weight 0.16
- heavy-workload relievers, max 4, weight 0.10
- closer-candidate workload, max 100, weight 0.08

Completeness penalty added up to 8 points for missing pitch counts. Scores were capped 0-100.

## Why V1 Was Elevated

The production input showed high raw workload across the league:

- mean pitches last 3 days: 308.03
- median pitches last 3 days: 298
- minimum pitches last 3 days: 137
- mean bullpen innings last 3 days: 18.63

Because v1 normalized 180 pitches and 18 innings to 100, ordinary current workload saturated major components. That created a high distribution:

- v1 mean: 69.92
- v1 median: 69
- v1 min: 44
- v1 max: 91.7

The score was not technically broken, but its scale was too aggressive for the current MLB schedule context.

## Raw Workload Distribution

Latest canonical rows:

- total pitches last 1 day: mean 72.19, median 66, min 23, max 140
- total pitches last 2 days: mean 131.33, median 131.5, min 38, max 210
- total pitches last 3 days: mean 308.03, median 298, min 137, max 479
- total pitches last 7 days: mean 419.6, median 408.5, min 246, max 615
- bullpen innings last 3 days: mean 18.63, median 18, min 8, max 27
- bullpen innings last 7 days: mean 24.81, median 24.5, min 16.67, max 33.34
- relievers used last 3 days: mean 7.93, median 8, min 5, max 10
- consecutive-day relievers: mean 1.37, median 1, min 0, max 5

## Schedule Normalization

Phase 6.1 tracks:

- games played in last 1/2/3/7 days
- doubleheaders
- off days
- bullpen pitches per game last 3 days
- bullpen innings per game last 3 days
- reliever usage per game last 3 days

Absolute workload remains present because arms still accumulate pitches physically. Per-game workload prevents teams from being punished only because they played more games.

## Reliever Fatigue

Version: `reliever_fatigue_v1`

Inputs:

- previous-day pitch load
- three-day pitch load
- consecutive days used
- multi-inning usage
- recency recovery

Three straight days receives a strong minimum risk floor. Missing pitch count lowers confidence, not workload.

## Team Fatigue V2

Version: `bullpen_fatigue_v2`

Inputs:

- average reliever fatigue
- elevated/high fatigue reliever count
- high fatigue reliever count
- closer-candidate fatigue
- high-leverage fatigue
- absolute pitches last 3 days
- pitches per game last 3 days
- relievers used per game last 3 days
- rested reliever buffer

Latest v2 distribution:

- mean: 40.56
- median: 41.55
- SD: 5.78
- min: 22.5
- max: 51.9
- p10: 32.6
- p25: 37.7
- p75: 44.4
- p90: 45.3

## V1 vs V2

Examples:

- Washington Nationals: v1 44, v2 22.5
- Toronto Blue Jays: v1 64.4, v2 31.2
- Pittsburgh Pirates: v1 74.2, v2 51.9
- Los Angeles Angels: v1 67.2, v2 47.5

V2 removes the artificial floor near 40 and stops ordinary three-day usage from automatically becoming elevated.

## Quality Model

Version: `bullpen_quality_v1`

Official relief appearances only. Starters are excluded. Current implementation uses official boxscores over the loaded 30-day window, plus last 14 and last 7 recent form. It does not use odds, offense, fatigue, park, weather or injuries.

Metrics:

- ERA
- WHIP
- strikeout rate
- walk rate
- K-BB rate
- hits per batter faced
- recent runs allowed per inning
- save/hold/blown-save execution context

Missing metrics reduce available weight. Tiny samples do not receive quality scores.

Latest quality distribution:

- mean: 49.8
- median: 49.6
- SD: 8.94
- min: 29.8
- max: 65.4

## Effective Depth

Latest distribution:

- DEEP: 24
- ADEQUATE: 6
- THIN: 0

This is a non-predictive diagnostic and not an official availability statement.

## Canonical History

Current storage:

- canonical rows: 30
- noncanonical rows: 177

Prior exploratory, pre-hash-fix and v1 rows remain for audit history and are excluded from current canonical output.

## Feature Flags

Server-only:

- `MLB_BULLPEN_MODEL_ENABLED=true`
- `MLB_BULLPEN_PROVIDER_ENABLED=true`
- `MLB_BULLPEN_FATIGUE_SCORE_ENABLED=true`
- `MLB_BULLPEN_SCORE_MODE=AUDIT_ONLY`
- `MLB_BULLPEN_FATIGUE_VERSION=v2`
- `MLB_BULLPEN_QUALITY_SCORE_ENABLED=true`
- `MLB_BULLPEN_QUALITY_SCORE_MODE=AUDIT_ONLY`

No `NEXT_PUBLIC` flags exist.

## Stability

Two captures with unchanged completed games:

- first capture inserted: 30
- second capture inserted: 0
- second capture skipped: 30

Hashes are deterministic and do not include timestamps.

## Manual Verification

Examples from returned data:

- Low fatigue: Washington Nationals, v2 22.5, 137 pitches last 3 days.
- High fatigue: Pittsburgh Pirates, v2 51.9, 324 pitches last 3 days.
- High quality: New York Yankees, quality 65.4.
- Low quality: Kansas City Royals, quality 29.8.
- High quality with higher fatigue: Los Angeles Angels, quality 60.2, v2 47.5.
- Low quality with low fatigue: Washington Nationals, quality 35.3, v2 22.5.

Manual boxscore verification should continue across future captures as MLB official corrections settle.

## Pick Isolation

Confirmed:

- `automationUtils.ts` does not import bullpen fatigue or quality modules.
- Candidate scoring is unchanged.
- `buildCandidate` is unchanged.
- Public signals are unchanged.
- Top 5 is unchanged.
- Top Signal is unchanged.
- Top Play is unchanged.
- Closing and grading are unchanged.
- Sports Projection remains `UNAVAILABLE`.

## Known Limitations

- Quality uses official relief boxscores from the loaded 30-day window, not a full season archive yet.
- Effective depth is diagnostic and does not know official roster availability.
- No bullpen/offense comparison exists.
- No projected runs or win probability exists.

## Recommended Phase 7

Add a full-season relief archive or official season relief split if a verified structured source is found. Then compare 30-day quality against true season baselines before any research-only projection experiment.

