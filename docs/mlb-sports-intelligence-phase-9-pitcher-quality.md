# MLB Sports Intelligence Phase 9: Starting Pitcher Quality

## Sources And Endpoints

Phase 9 uses verified structured MLB Stats API data:

- `/api/v1/schedule?sportId=1&date={date}&hydrate=probablePitcher,venue`
- `/api/v1/people/{playerId}`
- `/api/v1/people/{playerId}/stats?stats=season&group=pitching&season={season}`
- `/api/v1/people/{playerId}/stats?stats=gameLog&group=pitching&season={season}`

Baseball Savant / Statcast advanced metrics are reserved for later ingestion. Phase 9 does not fabricate xERA, xwOBA, hard-hit, barrel, exit velocity or pitch arsenal values.

## Starter Classification

Only official starts enter pitcher-quality windows. Game-log rows with `gamesStarted = 0` are excluded and logged as relief appearances.

## Window Definitions

- `SEASON`
- `LAST_30_DAYS`
- `LAST_5_STARTS`
- `LAST_3_STARTS`

Recent windows are built from starter-only game logs.

## Metrics

Official metrics:

- ERA
- WHIP
- Strikeout rate
- Walk rate
- K-BB rate
- Hits per batter faced
- Home runs per batter faced
- Runs allowed per inning

## Advanced Metrics

Tracked but not connected in Phase 9 unless verified structured data is available. Missing advanced metrics are excluded honestly and do not become zero.

## Innings Parsing

Baseball innings are parsed as outs. `6.2` means 6 innings and 2 outs, or 20 outs.

## Sample Thresholds

- Season sufficient: at least 8 starts and 40 innings.
- Last 30 sufficient: at least 3 starts and 15 innings.
- Last 5 sufficient: at least 4 valid starts.
- Last 3 sufficient: at least 3 valid starts.

Small samples lower confidence, not quality directly.

## Baselines

The schema includes `public.mlb_pitcher_quality_baseline_snapshots`. Phase 9 scoring uses centralized initial MLB starter baseline constants until production baseline snapshots are populated from a broader starter archive.

## Quality Formula

Version: `starting_pitcher_quality_v1`

Window weights:

- Season: `50%`
- Last 30 days: `25%`
- Last 5 starts: `15%`
- Last 3 starts: `10%`

Metrics are normalized around starter baselines, inverse metrics are handled directionally, z-scores are capped, missing metrics are reweighted and the final score remains 0-100.

## Readiness Formula

Version: `starting_pitcher_readiness_v1`

Inputs:

- Rest days
- Most recent pitch count
- Starter status

Readiness does not enter Pitcher Quality.

## Confidence

`StartingPitcherQualityConfidence` reports numeric confidence, tier, sample quality and advanced metric coverage. Confidence does not increase Pitcher Quality.

## Persistence

Snapshots are stored in `public.mlb_starting_pitcher_quality_snapshots`. Raw Statcast rows are not stored.

## Distribution

Audit reports quality distribution, readiness distribution and confidence tier counts.

## Manual Verification

Manual verification should compare returned pitcher windows against official MLB season/game-log data by pitcher ID. Selection must be based on returned data, not reputation.

## Team Quality Boundary

Pitcher Quality is not connected to Team Quality in Phase 9. The Team Quality placeholder remains inactive.

## Pick Isolation

Phase 9 does not connect to public signals, candidate scoring, Top 5, Top Signal, Top Play, closing, grading or Sports Projection.

## Known Limitations

No Statcast advanced metrics are ingested yet. Baselines use initial centralized starter priors until the production baseline table is populated from a larger pitcher archive.

## Recommended Phase 10

Populate pitcher quality baseline snapshots from full-season official starter samples, then review calibration before considering Team Quality integration.
