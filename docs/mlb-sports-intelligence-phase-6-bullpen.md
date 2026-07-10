# MLB Sports Intelligence Phase 6: Bullpen Intelligence

## Official Sources

Phase 6 uses structured MLB Stats API data only:

- Schedule: `GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}`
- Boxscore: `GET https://statsapi.mlb.com/api/v1/game/{gamePk}/boxscore`

The schedule provides official game IDs, teams, game dates and final status. Boxscores provide pitcher order and official pitching stats including innings pitched, pitches thrown, batters faced, hits, walks, strikeouts, runs, earned runs, saves, holds and games finished.

Known limitations:

- Completed boxscores can still be corrected by MLB after final.
- Official bullpen roles are not exposed by this source.
- Position-player pitching is detected cautiously from position metadata and warnings.

## Relief Classification

Pitchers are read from the official boxscore pitching order. The first pitcher for each team is treated as the starter and excluded from relief workload. All later pitchers are treated as relief appearances.

Openers and bulk-reliever games are preserved with warnings. The engine does not classify relief work solely from innings pitched.

## Workload Methodology

The engine tracks:

- appearances over previous 1, 2, 3 and 7 official calendar days;
- pitches over previous 1, 2, 3 and 7 official calendar days;
- innings over previous 3 and 7 official calendar days;
- consecutive-day usage from the most recent appearance backward;
- most recent appearance date.

Doubleheaders are isolated by `gamePk`. Future games and non-final games are excluded.

## Fatigue Thresholds

Version: `bullpen_fatigue_v1`

Initial audit-only thresholds:

- light appearance max: 15 pitches
- heavy appearance min: 30 pitches
- limited 3-day workload: 45 pitches
- heavy 3-day workload: 70 pitches
- limited consecutive days: 2
- heavy consecutive days: 3

These are transparent heuristics for audit only. They are not availability declarations and do not modify picks.

## Role Evidence

The engine identifies cautious candidates only from official boxscore evidence:

- closer candidate: recent save or game finished evidence;
- high-leverage candidate: saves, holds or games finished.

It never labels a pitcher as an official closer without an official role source.

## Missing Data Policy

Availability:

- `AVAILABLE`: recent team games and pitch counts are complete.
- `PARTIAL`: missing pitch counts or incomplete recent game coverage.
- `UNAVAILABLE`: no usable recent game history.
- `ERROR`: provider failure.

Missing values do not become zero. Incomplete pitch counts reduce availability and can suppress score confidence.

## Fatigue Score

Atlas Bullpen Fatigue Score is audit-only:

- 0 = minimal observed recent fatigue;
- 100 = extreme observed recent workload/fatigue risk.

Components:

- total bullpen pitches last 3 days;
- total bullpen innings last 3 days;
- relievers used last 3 days;
- relievers on consecutive days;
- relievers with heavy workload;
- closer-candidate workload when evidence exists;
- completeness penalty for missing pitch counts.

Quality score remains undefined in Phase 6.

## Persistence

Created:

`public.mlb_bullpen_feature_snapshots`

It stores team-level feature snapshots, reliever workload summaries, role evidence, fatigue score components, source metadata, canonical flag and a deduplication hash. Raw boxscore responses are not stored.

## Feature Flags

Server-side flags:

- `MLB_BULLPEN_MODEL_ENABLED=true`
- `MLB_BULLPEN_PROVIDER_ENABLED=true`
- `MLB_BULLPEN_FATIGUE_SCORE_ENABLED=true`
- `MLB_BULLPEN_SCORE_MODE=AUDIT_ONLY`

No `NEXT_PUBLIC` bullpen flags exist.

## Caching

The provider uses in-memory TTL caches:

- schedule: existing MLB official client cache;
- completed boxscores: 24 hours inside the bullpen provider;
- team aggregate: 20 minutes.

The same official boxscore is reused for both teams.

## Live Diagnostic

Production baseline capture:

- teams inspected: 30
- games processed: 95
- relief appearances processed: 625
- teams available: 10
- teams partial: 20
- teams unavailable: 0

Fatigue score distribution:

- team count: 30
- mean: 69.92
- median: 69
- minimum: 44
- maximum: 91.7

Examples selected from returned data:

- light usage: Washington Nationals, fatigue score 44, 137 pitches last 3 days, 5 relievers used last 3 days
- heavy usage: St. Louis Cardinals, fatigue score 91.7, 298 pitches last 3 days, 10 relievers used last 3 days, 5 relievers on consecutive days
- consecutive-days: Atlanta Braves, 2 relievers on consecutive days

Manual MLB boxscore verification:

- July 9, 2026, game `823359`, Braves at Pirates: Dylan Dodd appeared in relief for Atlanta, 1.0 IP, 15 pitches.
- July 8, 2026, game `823360`, Braves at Pirates: Dylan Dodd appeared in relief for Atlanta, 1.0 IP, 8 pitches.
- The engine correctly counted him as a consecutive-day reliever.

## Production Capture

After canonical hash stabilization:

- first capture inserted: 30
- duplicate skipped: 0
- second capture inserted: 0
- duplicate skipped: 30

Earlier noncanonical exploratory rows may remain for audit history, but current canonical snapshots are isolated by feature hash.

## Audit Endpoint

`GET /api/internal/mlb-engine-audit?details=1` now includes:

- bullpen provider/storage health;
- team availability counts;
- score mode/version;
- fatigue distribution;
- home/away bullpen workload summaries for selected audit games.

## Pick Isolation

Confirmed:

- `automationUtils.ts` does not import bullpen modules;
- candidate scoring remains unchanged;
- `buildCandidate` remains unchanged;
- public signals remain unchanged;
- Top 5 remains unchanged;
- Top Signal remains unchanged;
- Top Play remains unchanged;
- closing and grading remain unchanged;
- Sports Projection remains `UNAVAILABLE`.

## Known Limitations

- Bullpen quality is not implemented.
- No offense-vs-bullpen comparison exists.
- No projected runs, win probability, weather, injuries, umpire model, park factors or SportsDataIO connection exists.
- Workload availability is an estimate, not a verified unavailable/available roster status.

## Recommended Phase 7

Observe audit-only bullpen score stability over multiple completed-game cycles. Then add a separate verified bullpen quality model from official performance data before considering any research connection to future projections.

