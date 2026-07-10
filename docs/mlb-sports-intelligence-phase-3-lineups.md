# MLB Sports Intelligence Phase 3: Official Lineups and Starter Verification

Date: 2026-07-10

Phase 3 adds official lineup ingestion and starter verification diagnostics. It does not alter MLB pick scoring, thresholds, public signals, Top 5, Top Signal, Top Play, closing, grading, subscriptions, UI, or Sports Projection.

## 1. Official Source Selected

Selected source: MLB official Stats API structured JSON.

The implementation uses official game feed and boxscore data because they expose game ID, game status, teams, batting orders, player IDs, player names, positions, pitcher lists, and probable pitchers without scraping HTML.

## 2. Endpoints Consumed

Live game feed:

```text
https://statsapi.mlb.com/api/v1.1/game/<gamePk>/feed/live
```

Consumed fields:

- `gameData.datetime.dateTime`
- `gameData.status.detailedState`
- `gameData.probablePitchers.home`
- `gameData.probablePitchers.away`

Boxscore:

```text
https://statsapi.mlb.com/api/v1/game/<gamePk>/boxscore
```

Consumed fields:

- `teams.home.team`
- `teams.away.team`
- `teams.home.battingOrder`
- `teams.away.battingOrder`
- `teams.home.players`
- `teams.away.players`
- `teams.home.pitchers`
- `teams.away.pitchers`

The existing Phase 2 schedule endpoint remains the mapping source:

```text
https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=<YYYY-MM-DD>&hydrate=probablePitcher
```

## 3. Confirmation Criteria

A lineup is confirmed only when:

- official MLB game ID is mapped;
- the side belongs to the mapped official game;
- official boxscore contains a batting order;
- at least nine batting-order players are present;
- batting-order positions are unique;
- player IDs are unique.

No lineup is confirmed from GNews, previous-game batting orders, roster membership, or inferred positions.

## 4. Partial and Unavailable Behavior

- `AVAILABLE`: both lineups are confirmed and complete.
- `PARTIAL`: at least one lineup or batting order is present but incomplete or only one side is confirmed.
- `UNAVAILABLE`: no official batting order is available, the game is unmapped, or the game status does not support lineups yet.
- `ERROR`: official provider failure or invalid response.

Missing fields remain undefined. Phase 3 does not calculate lineup strength, missing impact players, platoon advantage, or lineup-change score.

## 5. Starter Verification Method

Starter verification compares:

- probable pitcher from official live feed;
- first pitcher listed in official boxscore pitcher list.

Statuses:

- `MATCHED`: confirmed pitcher matches probable pitcher.
- `CHANGED`: confirmed pitcher differs from probable pitcher.
- `PROBABLE_ONLY`: probable pitcher exists, but boxscore starter is not available.
- `UNAVAILABLE`: no usable probable or confirmed pitcher.
- `AMBIGUOUS`: official evidence is unclear.

If verified starter matches probable, the pitcher feature can become `CONFIRMED`. If it differs, the audit preserves both identities and returns a warning.

## 6. Changed-Starter Handling

Changed starters are not hidden. The audit reports:

- probable pitcher ID/name;
- confirmed pitcher ID/name;
- `status: CHANGED`;
- warning: `Probable starter changed before game.`

No pick is changed or downgraded in Phase 3.

## 7. Doubleheader Behavior

Doubleheader mapping still uses Phase 2 logic:

- match both teams;
- compare scheduled start time;
- resolve game 1/game 2 by closest official `gameDate`;
- reject ambiguous mappings instead of guessing.

## 8. Caching Policy

Implemented in:

```text
app/lib/mlb-engine/sports-intelligence/providers/mlb-official-game-client.ts
```

TTL behavior:

- games more than 3 hours away: 15 minutes;
- games within 3 hours: 5 minutes;
- games within 60 minutes: 2 minutes;
- boxscore: bounded in-memory cache.

No browser polling is added. Requests remain server-side.

## 9. Persistence Decision

Production persistence is not enabled in Phase 3. The reason: lineup snapshots are useful for late-change tracking, but the current phase only validates official ingestion and audit diagnostics.

SQL proposal provided:

```text
mlb_lineup_snapshots.sql
```

The proposed table supports server-side before/after lineup comparison and deduplication, but it has not been created in production.

## 10. Feature Flags

Required flags:

```text
MLB_SPORTS_INTELLIGENCE_ENABLED=false
MLB_PITCHER_MODEL_ENABLED=false
MLB_LINEUP_MODEL_ENABLED=false
```

Behavior:

- global flag false: no official sports requests;
- lineup flag false: lineup remains unavailable;
- pitcher flag true and lineup false: Phase 2 pitcher behavior remains available;
- lineup flag true and pitcher false: lineup ingestion can run without pitcher features.

No flags are enabled automatically.

## 11. Audit Endpoint Examples

Protected endpoint:

```text
GET /api/internal/mlb-engine-audit
Authorization: Bearer <CRON_SECRET>
```

Optional detail mode:

```text
GET /api/internal/mlb-engine-audit?eventId=<odds-event-id>&details=1
```

Default output is compact. `details=1` includes normalized batting-order players.

## 12. Fields Deliberately Left Undefined

- `homeLineupStrength`
- `awayLineupStrength`
- `homeMissingImpactPlayers`
- `awayMissingImpactPlayers`
- `homePlatoonAdvantage`
- `awayPlatoonAdvantage`
- `homeLineupChangeScore`
- `awayLineupChangeScore`
- Sports Projection probabilities
- projected runs

## 13. Known Limitations

- Pre-game lineups may not exist until MLB publishes official batting orders.
- Boxscore pitcher list is strongest once the game is close to start or live.
- Batting side is not filled unless official response provides it in a future adapter.
- Persistence is proposed but not enabled.
- The audit is protected and internal only; lineups are not exposed publicly.

## 14. Required Before Lineups Affect Prediction

Before lineups can influence picks:

- persist lineup snapshots;
- identify late scratches and confirmed lineup changes;
- classify impact players with verified player value data;
- backtest lineup features by market type;
- calculate sports probability independently from market odds;
- compare Atlas Sports Probability against market no-vig probability.

## 15. Recommended Phase 4

Recommended Phase 4:

1. Enable server-side lineup snapshot persistence.
2. Add late lineup-change detection using `compareMlbLineups`.
3. Add official player availability/injury contract, still behind flags.
4. Keep candidate scoring unchanged until backtested.

