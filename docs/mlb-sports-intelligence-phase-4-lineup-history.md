# Atlas MLB Sports Intelligence Phase 4: Lineup History

Phase 4 records official MLB lineup evidence over time. It does not change MLB picks, candidate scoring, thresholds, Top Signal, Top Play, grading, subscriptions, or public UI.

## Tables

`mlb_lineup_snapshots.sql` defines:

- `public.mlb_lineup_snapshots`
- `public.mlb_lineup_change_events`
- `public.mlb_starter_verification_snapshots`

The SQL includes primary keys, lookup indexes, and unique hash indexes for dedupe.

## Hash And Dedupe

Lineup hashes are deterministic SHA-256 hashes built from:

- official game ID
- side
- confirmed flag
- normalized ordered player list: player ID, batting order, position code

Timestamps are not included, so repeated captures of the same official lineup are skipped. Official game ID and side are included so doubleheaders and home/away teams remain isolated.

Starter verification hashes use official game ID, side, probable pitcher ID, confirmed pitcher ID, and verification status.

## Capture Workflow

`POST /api/internal/mlb-sports-intelligence/lineups/capture` is protected by `CRON_SECRET`.

The route:

1. Requires `MLB_SPORTS_INTELLIGENCE_ENABLED=true` and `MLB_LINEUP_MODEL_ENABLED=true`.
2. Requires persistence flags before writing.
3. Fetches current MLB games through The Odds API.
4. Maps Odds API games to MLB official games with the existing mapper.
5. Reads official lineups and starter verification through the existing MLB official provider.
6. Inserts unique lineup snapshots.
7. Optionally detects and persists lineup-change events.
8. Optionally persists starter verification snapshots.

The response returns aggregate counts and compact examples only. Full player arrays are not returned by default.

## Late Scratch Definition

A late scratch is only recorded when:

- previous and current snapshots are both confirmed official MLB lineups;
- the same player existed in the previous lineup and is absent in the later lineup;
- the snapshots are for the same official game, team, and side;
- the newer snapshot is captured within 120 minutes before scheduled start or within the early-game cutoff;
- the data source is official structured MLB data.

No injury reason is inferred.

## First Confirmed Lineup

The first confirmed official lineup is stored as `FIRST_CONFIRMED_LINEUP`. It is operational history, not a positive or negative betting signal.

## Starter Verification Persistence

Starter states are stored in `public.mlb_starter_verification_snapshots` with these statuses:

- `MATCHED`
- `CHANGED`
- `PROBABLE_ONLY`
- `UNAVAILABLE`
- `AMBIGUOUS`

`PROBABLE_ONLY` is evidence, not a confirmed starter change.

## Player Availability

Phase 4 adds a structured player availability contract to `MlbSportsIntelligenceFeatures`, but returns `UNAVAILABLE`. No SportsDataIO, GNews, HTML scraping, or injury inference is connected in this phase.

## Feature Flags

All new flags default false:

- `MLB_LINEUP_SNAPSHOTS_ENABLED`
- `MLB_LINEUP_CHANGE_DETECTION_ENABLED`
- `MLB_STARTER_VERIFICATION_SNAPSHOTS_ENABLED`

Flags false means no persistence and no new capture writes. No flag combination changes MLB candidate scoring.

## Cron Cadence

Recommended fixed cadence during active MLB days: every 10 minutes.

Vercel cron does not provide dynamic per-game cadence, so the route filters to games within a responsible inspection window and relies on MLB official client caching. A tighter 5-minute cadence is possible if hosting quota permits.

## Failure Behavior

Supabase failures are isolated:

- no fabricated previous lineup;
- no fabricated change event;
- official lineup ingestion can still run;
- response reports `storageHealth: "ERROR"`;
- audit reports storage warnings.

## Audit Endpoint

`GET /api/internal/mlb-engine-audit` now includes:

- `lineupPersistence`
- `lineupChanges`
- `starterVerification`
- `playerAvailability`

Use `?details=1` to include expanded latest event details.

## Known Limitations

- Production tables must be applied from `mlb_lineup_snapshots.sql` before live writes can succeed.
- Capture route depends on `ODDS_API_KEY`, MLB official Stats API availability, Supabase service role, and CRON_SECRET.
- Late scratches are detected from official lineup deltas only; no reason is assigned.
- Player availability remains unavailable by design.
- Sports Projection remains unavailable.

## Picks Remain Unchanged

Phase 4 does not import the snapshot repository or lineup change service into `app/api/cron/automationUtils.ts`. Candidate scoring and ranking remain unchanged.

## Recommended Phase 5

Connect a verified player availability provider, then add a read-only calibration layer that studies whether recorded lineup/starter events correlate with closing line movement. Keep that analysis separate from candidate scoring until it is validated.
