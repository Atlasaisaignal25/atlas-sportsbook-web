# Atlas MLB Sports Intelligence Phase 4.2: Live Validation

Validation time: 2026-07-10 18:18 UTC.

This was a production validation pass. No scoring, thresholds, prediction logic, public UI, injuries, SportsDataIO, weather, bullpen, or lineup-strength features were added.

## Games Inspected

The strict next-180-minute MLB window contained zero Odds API games at validation time.

The active capture route inspected the wider production capture window and mapped 16 MLB games to official MLB game IDs. All official games were still `Scheduled`, and MLB official boxscore batting orders were empty.

Examples:

- `824252`: Philadelphia Phillies @ Detroit Tigers, 2026-07-10T22:41:00Z, 263 minutes to start, status `Scheduled`, both batting orders `0`.
- `823357`: Milwaukee Brewers @ Pittsburgh Pirates, 2026-07-10T22:41:00Z, 263 minutes to start, status `Scheduled`, both batting orders `0`.
- `822709`: New York Yankees @ Washington Nationals, 2026-07-10T22:46:00Z, 268 minutes to start, status `Scheduled`, both batting orders `0`.
- `824817`: Kansas City Royals @ Baltimore Orioles, 2026-07-10T23:06:00Z, 288 minutes to start, status `Scheduled`, both batting orders `0`.
- `824576`: Athletics @ Chicago White Sox, 2026-07-11T18:11:00Z, 1433 minutes to start, status `Scheduled`, both batting orders `0`.

## Capture Result

Authorized production capture returned `200` and `storageHealth: OK`.

Capture counts:

- `gamesInspected`: 16
- `gamesMapped`: 16
- `lineupSnapshotsInserted`: 2
- `duplicateSnapshotsSkipped`: 30
- `firstConfirmedLineups`: 0
- `lineupChangesDetected`: 0
- `lateScratchesDetected`: 0
- `starterChangesDetected`: 0
- `starterSnapshotsInserted`: 2
- `duplicateStarterSnapshotsSkipped`: 30
- `partialLineups`: 0
- `unavailableLineups`: 32
- `errors`: none

The two inserted lineup snapshots were unavailable-lineup evidence for a newly inspected official game. No confirmed lineup snapshot was inserted.

## First Confirmed Lineups

No first confirmed lineup existed during this validation window.

Validated behavior:

- Confirmed lineup snapshot inserts: `0`
- FIRST_CONFIRMED_LINEUP events: `0`
- PLAYER_ADDED events from unavailable prior snapshots: `0`
- LATE_SCRATCH events from unavailable prior snapshots: `0`

The Phase 4.1 bug fix remains in place: when an official confirmed lineup appears after an unavailable snapshot, it will be classified as `FIRST_CONFIRMED_LINEUP`, not fabricated player additions.

## Duplicate Captures

Current production capture deduplicated unchanged evidence:

- Duplicate lineup snapshots skipped: `30`
- Duplicate starter verification snapshots skipped: `30`
- Duplicate lineup hashes: `0`
- Duplicate starter hashes: `0`
- Duplicate event hashes: `0`

## Real Lineup Changes

No real official before/after lineup modification existed during validation.

Production event counts:

- FIRST_CONFIRMED_LINEUP: `0`
- PLAYER_ADDED: `0`
- PLAYER_REMOVED: `0`
- BATTING_ORDER_CHANGE: `0`
- POSITION_CHANGE: `0`
- MULTIPLE_CHANGES: `0`
- LATE_SCRATCH: `0`

No demonstration event was fabricated.

## Late Scratches

No real late scratch existed during validation.

Confirmed:

- No late scratch was generated from unavailable prior snapshots.
- No injury reason or inferred cause was stored.
- No event has orphan or cross-game snapshot references.

## Starter Verification

All 32 starter verification snapshots are `PROBABLE_ONLY`.

Counts:

- PROBABLE_ONLY: `32`
- MATCHED: `0`
- CHANGED: `0`
- AMBIGUOUS: `0`
- UNAVAILABLE: `0`

This is correct because MLB official game evidence had not confirmed starters yet. Probable listings alone were not treated as confirmed starters.

## Database Integrity

`mlb_lineup_snapshots`:

- Total rows: `32`
- Confirmed rows: `0`
- Unavailable rows: `32`
- Unique games: `16`
- Unique teams: `30`
- Latest capture: `2026-07-10 18:17:10.924+00`

Integrity checks:

- Duplicate lineup hashes: `0`
- Duplicate event hashes: `0`
- Duplicate starter hashes: `0`
- Orphan previous snapshot refs: `0`
- Orphan current snapshot refs: `0`
- Cross-game event refs: `0`

## Audit Endpoint Agreement

`GET /api/internal/mlb-engine-audit?details=1` returned:

- `lineupPersistence.enabled`: `true`
- `lineupPersistence.storageHealth`: `OK`
- `lineupPersistence.totalSnapshots`: `32`
- `lineupPersistence.gamesTracked`: `16`
- `lineupPersistence.teamsTracked`: `30`
- `lineupChanges.totalVerifiedEvents`: `0`
- `starterVerification.probableOnlyCount`: `32`
- `playerAvailability.availability`: `UNAVAILABLE`
- `sportsIntelligence.projectionAvailability`: `UNAVAILABLE`

The audit endpoint matches database reality.

## Pick Regression

Confirmed:

- `app/api/cron/automationUtils.ts` does not consume lineup snapshots.
- `automationUtils.ts` does not consume lineup change events.
- `automationUtils.ts` does not read `MLB_LINEUP_*` persistence flags.
- `candidateScore` remains isolated in `automationUtils.ts`.
- `buildCandidate` remains isolated in `automationUtils.ts`.
- No lineup event modifies closing validation.
- Top Signal and Top Play remain separate.
- Sports Projection remains `UNAVAILABLE`.

## Validation Commands

Passed:

- `npm run validate:mlb-lineup-snapshots`
- `npm run validate:mlb-lineup-provider`
- `npm run validate:mlb-pitcher-provider`
- `npm run validate:mlb-sports-intelligence`
- `npm run validate:mlb-engine`
- `npm run validate:odds-movement`
- `npx tsc --noEmit`
- `npm run build`

Note: `npx tsc --noEmit` initially hit duplicate `.next/types` artifacts from prior builds. Removing `.next` and rerunning passed cleanly.

## Phase 4 Status

Phase 4 persistence, dedupe, audit, route security, starter probable-only persistence, and pick isolation are validated in production.

Live confirmed lineup handling is not fully validated yet because MLB official batting orders were not available in the validation window.

## Recommended Phase 5

Continue monitoring closer to first pitch. Once MLB official batting orders appear, run Phase 4.2 again to validate:

- confirmed lineup snapshot insertion;
- FIRST_CONFIRMED_LINEUP event creation;
- duplicate confirmed capture skips;
- MATCHED starter states;
- real lineup modifications or late scratches if they occur.
