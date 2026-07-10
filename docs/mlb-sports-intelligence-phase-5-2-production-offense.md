# MLB Sports Intelligence Phase 5.2: Offensive Form Audit-Only Production Activation

## Production Tables

Applied:

- `public.mlb_offensive_form_snapshots`

The table stores normalized team/window feature snapshots only. It does not store raw Baseball Savant pitch-level CSV rows.

Important columns:

- team identity: `team_id`, `team_name`
- window: `window_games`, `games_included`, `start_date`, `end_date`
- normalized PA/BBE totals: `plate_appearances`, `woba_eligible_plate_appearances`, `batted_ball_events`, `untracked_batted_ball_events`, `statcast_coverage`
- rates: `hard_hit_rate`, `barrel_rate`, `walk_rate`, `strikeout_rate`
- contact-only expected metrics: `expected_ba_on_contact`, `expected_slg_on_contact`, `expected_woba_on_contact`
- Atlas-derived hybrid metric: `atlas_expected_offense_rate`
- score: `atlas_offensive_score`, kept null while scoring is disabled
- dedupe: `feature_hash`

Indexes:

- primary key on `id`
- unique index on `feature_hash`
- team lookup index
- team/window/captured_at index
- `as_of` index
- `sample_quality` index

## Flags Enabled

Configured in Vercel Production, Preview and Development:

- `MLB_SPORTS_INTELLIGENCE_ENABLED=true`
- `MLB_OFFENSIVE_FORM_MODEL_ENABLED=true`
- `MLB_STATCAST_PROVIDER_ENABLED=true`
- `MLB_OFFENSIVE_SCORE_ENABLED=false`

No `NEXT_PUBLIC_` flags were added.

## Capture Route

Protected route:

`POST /api/internal/mlb-sports-intelligence/offense/capture`

Authorization:

`Authorization: Bearer <CRON_SECRET>`

Unauthorized requests return `401`. The response reports aggregate health and examples only. It does not return raw CSV rows.

## Request Strategy

The initial broad Baseball Savant request hit a practical 25,000-row cap. Phase 5.2 corrected this by splitting the required official date range into shared date chunks. One chunked source fetch covers all teams and all 7/14/30 windows.

Current production capture issued:

- 36 official schedule requests
- 6 shared Baseball Savant CSV requests
- 124,415 Statcast rows processed after chunking

## Cron Cadence

Vercel cron:

`0 */6 * * *`

Completed-game offensive form changes after games complete, so every 6 hours is enough for audit-only observation.

## First Capture Results

The first broad-request capture inserted 90 snapshots but exposed the 25,000-row cap. Those rows remain in production because this phase does not delete existing data.

Corrected chunked capture inserted 90 new snapshots.

Hash correction then inserted 90 stable-hash snapshots. The latest stable snapshot set is the one used for validation.

## Second Capture Dedupe

After removing capture timestamp from `feature_hash`, a repeated capture produced:

- `snapshotsInserted = 0`
- `duplicateSnapshotsSkipped = 90`

Identical features now dedupe correctly.

## Team Mapping Coverage

- Expected MLB teams: 30
- Teams mapped: 30
- Windows calculated: 90
- Teams with 7-game data: 30
- Teams with 14-game data: 30
- Teams with 30-game data: 30

## Sample Quality Distribution

Latest corrected capture:

- Last 7: 30 SUFFICIENT, 0 LIMITED, 0 INSUFFICIENT, 0 UNAVAILABLE
- Last 14: 30 SUFFICIENT, 0 LIMITED, 0 INSUFFICIENT, 0 UNAVAILABLE
- Last 30: 30 SUFFICIENT, 0 LIMITED, 0 INSUFFICIENT, 0 UNAVAILABLE

Threshold review:

- Last 7 median PA 263, median BBE 180
- Last 14 median PA 502, median BBE 345
- Last 30 median PA 1065, median BBE 724

Current thresholds are retained.

## Production Baseline

The baseline summary is built from identically normalized team/window metrics:

- one value per team/window
- unavailable samples excluded
- windows isolated
- teams not duplicated
- standard deviation checked

Offensive Score readiness is reported but not activated. `MLB_OFFENSIVE_SCORE_ENABLED` remains false.

## Manual Source Verification

Manual reproduced checks from direct CSV rows:

Arizona Diamondbacks, last 7:

- gamePk list: `823277`, `823279`, `823280`, `823282`, `825061`, `825063`, `825062`
- raw rows: 1062
- unique PA: 260
- valid BBE: 187
- hard-hit: 65 / 187 = 0.348
- barrels: 8 / 187
- walks: 19
- strikeouts: 53
- average EV: 87.1
- Atlas hard-hit rate: 0.348
- difference: 0

Atlanta Braves, last 7:

- gamePk list: `823359`, `823360`, `823361`, `824900`, `824902`, `824903`, `824904`
- raw rows: 1167
- unique PA: 284
- valid BBE: 186
- hard-hit: 76 / 186 = 0.409
- barrels: 19 / 186
- walks: 24
- strikeouts: 69
- average EV: 87.2
- Atlas hard-hit rate: 0.409
- difference: 0

Tolerance for rounded rates: 0.001.

## Audit Endpoint

`GET /api/internal/mlb-engine-audit?details=1` includes offensive storage health, snapshot totals, teams/windows tracked, raw metric availability, score enabled false, and score availability unavailable.

## Pick Isolation

Confirmed:

- `automationUtils.ts` does not import offensive snapshots
- candidate scoring does not consume offensive form
- public signal generation is unchanged
- Top 5, Top Signal and Top Play are unchanged
- Sports Projection remains `UNAVAILABLE`

## Compliance Caveat

Baseball Savant provides structured CSV access, but production commercial use should be reviewed against MLB/Baseball Savant usage terms and practical rate limits. The chunked strategy is designed to reduce request pressure.

## Known Limitations

- Baseline snapshots are computed in service output and not yet persisted to a separate baseline table.
- Historical bad audit rows from the initial cap/hash discovery were not deleted.
- Atlas Offensive Score remains disabled until baseline stability is reviewed over multiple captures.
- No pitcher/offense comparison, projected runs, weather, bullpen, injury or lineup-strength logic is connected.

## Recommended Phase 5.3

Observe audit-only captures over multiple days, persist baseline snapshots if useful, then decide whether the Offensive Score is ready for protected audit-only scoring. Do not connect it to picks until a later explicit phase.
