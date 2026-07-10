# Atlas MLB Sports Intelligence Phase 4.1: Production Persistence Activation

Phase 4.1 activates the Phase 4 persistence layer in production. It keeps MLB pick generation unchanged.

## Production Tables

Applied `mlb_lineup_snapshots.sql` to production Supabase project `dismuytgrqbrlpijveqy`.

Created and verified:

- `public.mlb_lineup_snapshots`
- `public.mlb_lineup_change_events`
- `public.mlb_starter_verification_snapshots`

## Indexes And Constraints

Confirmed primary keys:

- `mlb_lineup_snapshots_pkey`
- `mlb_lineup_change_events_pkey`
- `mlb_starter_verification_snapshots_pkey`

Confirmed dedupe indexes:

- `mlb_lineup_snapshots_dedupe_idx` on `official_game_id, side, lineup_hash`
- `mlb_lineup_change_events_hash_idx` on `event_hash`
- `mlb_starter_verification_snapshots_hash_idx` on `official_game_id, side, verification_hash`

Confirmed lookup indexes:

- `mlb_lineup_snapshots_official_game_idx`
- `mlb_lineup_snapshots_odds_event_idx`
- `mlb_lineup_snapshots_team_idx`
- `mlb_lineup_snapshots_captured_at_idx`
- `mlb_lineup_snapshots_game_side_lookup_idx`
- `mlb_lineup_change_events_game_idx`
- `mlb_lineup_change_events_odds_event_idx`
- `mlb_starter_verification_snapshots_game_idx`
- `mlb_starter_verification_snapshots_status_idx`

Confirmed JSONB fields:

- `batting_order`
- `added_players`
- `removed_players`
- `batting_order_changes`
- `position_changes`

## Environment Flags

Enabled in Vercel for Production, Preview, and Development:

- `MLB_SPORTS_INTELLIGENCE_ENABLED=true`
- `MLB_PITCHER_MODEL_ENABLED=true`
- `MLB_LINEUP_MODEL_ENABLED=true`
- `MLB_LINEUP_SNAPSHOTS_ENABLED=true`
- `MLB_LINEUP_CHANGE_DETECTION_ENABLED=true`
- `MLB_STARTER_VERIFICATION_SNAPSHOTS_ENABLED=true`

No `NEXT_PUBLIC_MLB_*` flags are used.

## Capture Route Security

Route:

`POST /api/internal/mlb-sports-intelligence/lineups/capture`

Security validation:

- Unauthorized request returned `401`.
- Authorized request with internal bearer secret returned `200`.
- Secrets were not printed in responses.

## Capture Results

First production capture:

- `gamesInspected`: 15
- `gamesMapped`: 15
- `lineupSnapshotsInserted`: 30
- `duplicateSnapshotsSkipped`: 0
- `firstConfirmedLineups`: 0
- `lineupChangesDetected`: 0
- `lateScratchesDetected`: 0
- `starterChangesDetected`: 0
- `starterSnapshotsInserted`: 30
- `duplicateStarterSnapshotsSkipped`: 0
- `partialLineups`: 0
- `unavailableLineups`: 30
- `storageHealth`: `OK`

Second production capture:

- `gamesInspected`: 15
- `gamesMapped`: 15
- `lineupSnapshotsInserted`: 0
- `duplicateSnapshotsSkipped`: 30
- `starterSnapshotsInserted`: 0
- `duplicateStarterSnapshotsSkipped`: 30
- `lineupChangesDetected`: 0
- `storageHealth`: `OK`

Post-fix capture:

- `lineupSnapshotsInserted`: 0
- `duplicateSnapshotsSkipped`: 30
- `starterSnapshotsInserted`: 0
- `duplicateStarterSnapshotsSkipped`: 30
- `storageHealth`: `OK`

## Current Production Counts

- Lineup snapshots: 30
- Lineup-change events: 0
- Starter-verification snapshots: 30
- MLB public signals: 853
- MLB Top 5 live rows: 346

Example lineup snapshot:

- Official game: `823200`
- Odds event: `976819aa47554213e70bc968d9356fc4`
- Team: Colorado Rockies
- Side: `AWAY`
- Confirmed: `false`
- Batting order complete: `false`
- Player count: `0`
- Source: `MLB_OFFICIAL`

Example starter verification:

- Official game: `823200`
- Team: Colorado Rockies
- Side: `AWAY`
- Status: `PROBABLE_ONLY`
- Probable pitcher: Tanner Gordon
- Confirmed pitcher: unavailable at capture time

## Real Change Result

No real confirmed lineup or starter change occurred during validation. No event was fabricated.

Because initial official batting orders were unavailable, snapshots were stored as unavailable evidence. The change service was adjusted so a future first confirmed lineup after an unavailable snapshot is recorded as `FIRST_CONFIRMED_LINEUP`, not as fabricated player additions.

## Audit Endpoint Health

Protected audit endpoint:

`GET /api/internal/mlb-engine-audit?details=1`

Confirmed:

- `lineupPersistence.enabled`: `true`
- `lineupPersistence.storageHealth`: `OK`
- `lineupPersistence.totalSnapshots`: 30
- `lineupPersistence.gamesTracked`: 15
- `lineupPersistence.teamsTracked`: 30
- `lineupChanges.enabled`: `true`
- `lineupChanges.totalVerifiedEvents`: 0
- `starterVerification.enabled`: `true`
- `starterVerification.probableOnlyCount`: 30
- `playerAvailability.availability`: `UNAVAILABLE`
- Sports Projection remains `UNAVAILABLE`

## Cron Cadence

Added Vercel cron:

`/api/internal/mlb-sports-intelligence/lineups/capture`

Schedule:

`*/10 * * * *`

The route still filters to relevant MLB game windows and is protected by the existing internal authorization behavior. No browser polling was added.

## Pick Regression Comparison

Confirmed:

- `app/api/cron/automationUtils.ts` does not import lineup history repositories.
- `automationUtils.ts` does not read `MLB_LINEUP_SNAPSHOTS_ENABLED`.
- `automationUtils.ts` does not read `MLB_LINEUP_CHANGE_DETECTION_ENABLED`.
- `candidateScore` remains in `automationUtils.ts`.
- `buildCandidate` remains in `automationUtils.ts`.
- Lineup persistence writes only to the three new internal tables.
- Public signal and Top 5 tables are not written by the capture route.
- Sports Projection remains `UNAVAILABLE`.

## Known Limitations

- Official MLB batting orders were not available during the first validation window.
- No real lineup-change or late-scratch event was available to validate live.
- Player availability remains unavailable by design.
- Starter snapshots were `PROBABLE_ONLY`; no confirmed starter changes occurred.
- Vercel cron is fixed cadence, not dynamic per game.

## Recommended Phase 5

Wait for live confirmed lineups to accumulate, then validate first confirmed lineups and real late changes in production. After enough history exists, build a read-only calibration report before considering any scoring integration.
