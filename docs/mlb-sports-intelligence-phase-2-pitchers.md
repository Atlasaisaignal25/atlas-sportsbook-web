# MLB Sports Intelligence Phase 2: Starting Pitchers

Date: 2026-07-10

Phase 2 adds a verified Starting Pitcher provider only. It does not alter MLB candidate scoring, thresholds, public signals, Top 5, Top Signal, Top Play, closing, grading, subscriptions, or UI.

## 1. Source Selected

Selected source: MLB official Stats API.

Reason:

- It is structured JSON.
- It provides official MLB game IDs, team IDs, scheduled game times, probable pitchers, player IDs, player display names, pitching hand, season pitching stats, and game logs.
- It avoids GNews/article extraction and avoids scraping unstable HTML pages.

No SportsDataIO, Baseball Savant, Statcast, weather API, lineup pages, news scraping, or browser automation is used in Phase 2.

## 2. Endpoints Used

Schedule and probable pitchers:

```text
https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=<YYYY-MM-DD>&hydrate=probablePitcher
```

Consumed fields:

- `dates[].games[].gamePk`
- `dates[].games[].gameDate`
- `dates[].games[].gameNumber`
- `dates[].games[].doubleHeader`
- `dates[].games[].status`
- `dates[].games[].teams.home.team.id`
- `dates[].games[].teams.home.team.name`
- `dates[].games[].teams.home.probablePitcher.id`
- `dates[].games[].teams.home.probablePitcher.fullName`
- `dates[].games[].teams.away.team.id`
- `dates[].games[].teams.away.team.name`
- `dates[].games[].teams.away.probablePitcher.id`
- `dates[].games[].teams.away.probablePitcher.fullName`

Player profile:

```text
https://statsapi.mlb.com/api/v1/people/<playerId>
```

Consumed fields:

- `people[0].id`
- `people[0].fullName`
- `people[0].pitchHand.code`

Season pitching stats:

```text
https://statsapi.mlb.com/api/v1/people/<playerId>/stats?stats=season&group=pitching&season=<YYYY>
```

Consumed fields:

- `gamesStarted`
- `inningsPitched`
- `era`
- `whip`
- `strikeOuts`
- `baseOnBalls`
- `battersFaced`

Pitching game logs:

```text
https://statsapi.mlb.com/api/v1/people/<playerId>/stats?stats=gameLog&group=pitching&season=<YYYY>
```

Consumed fields:

- `splits[].date`
- `splits[].stat.numberOfPitches`
- `splits[].stat.gamesStarted`
- `splits[].game.gamePk`

## 3. Game Mapping Method

New module:

```text
app/lib/mlb-engine/sports-intelligence/mlb-game-mapper.ts
```

The mapper receives:

- Odds API event ID
- home team
- away team
- commence time
- official MLB schedule games

Rules:

- Both teams are required.
- Team names are normalized centrally, including aliases such as `NY Mets` and `Athletics`.
- Scheduled start time is compared against official `gameDate`.
- Tolerance is 120 minutes.
- Exact time match is within 5 minutes.
- Doubleheaders are resolved by closest scheduled time.
- If multiple games are equally plausible, the mapper returns `matched: false`.
- The mapper never guesses an official game ID.

## 4. Doubleheader Handling

The official schedule exposes `doubleHeader` and `gameNumber`.

Phase 2 uses scheduled time to resolve game 1 versus game 2. If the time cannot uniquely resolve the game, mapping is rejected as ambiguous and a warning is returned.

## 5. Probable Versus Confirmed

MLB schedule `probablePitcher` is treated as `PROBABLE`, not `CONFIRMED`.

Rules:

- `confirmed` is false for probable schedule listings.
- Missing pitcher remains undefined.
- No pitcher is inferred from articles, names, roster position, or previous games.
- An opener is not classified as a normal starter unless a verified source later provides that context.

## 6. Fields Available

Phase 2 can populate:

- player ID
- pitcher name
- throwing hand
- status
- confirmed boolean
- source game ID
- source updated timestamp
- season games started
- season innings pitched
- ERA
- WHIP
- strikeouts
- walks
- strikeout rate
- walk rate
- rest days from most recent pitching appearance
- recent pitch count from most recent pitching appearance

## 7. Fields Unavailable

The following remain undefined:

- xERA
- xwOBA allowed
- velocity trend
- spin/arsenal quality
- pitch-model grades
- matchup advantage
- pitcher quality score
- home win probability
- away win probability
- projected total runs

## 8. Caching Policy

Implemented in:

```text
app/lib/mlb-engine/sports-intelligence/providers/mlb-official-client.ts
```

Current server-side in-memory TTLs:

- Schedule/game mapping: 15 minutes.
- Player profile: 6 hours.
- Season stats: 1 hour.
- Pitching game log: 30 minutes.

No client polling is added. All official source requests remain server-side.

## 9. Failure Behavior

If flags are false:

- `UnavailableMlbSportsIntelligenceProvider` is used.
- No MLB official requests are made.
- Existing MLB pick engine behavior remains unchanged.

If the official source fails:

- Starting Pitcher metadata returns `availability: "ERROR"`.
- Error is recorded in provider health.
- Other feature modules remain unavailable.
- Sports Projection remains unavailable.
- Public picks are not affected.

## 10. Feature Flags

Required flags:

```text
MLB_SPORTS_INTELLIGENCE_ENABLED=false
MLB_PITCHER_MODEL_ENABLED=false
```

Both must be true for the official pitcher provider to run. Phase 2 does not turn either flag on automatically.

## 11. Audit Endpoint

Protected endpoint:

```text
GET /api/internal/mlb-engine-audit
Authorization: Bearer <CRON_SECRET>
```

Optional event filter:

```text
GET /api/internal/mlb-engine-audit?eventId=<odds-event-id>
```

Safe diagnostic output includes:

- Odds API event ID
- feature availability
- provider health
- pitcher name
- status
- confirmed flag
- throwing hand
- rest days
- recent pitch count
- season ERA/WHIP/K rate/BB rate
- warnings

No secrets are returned.

## 12. Known Limitations

- MLB schedule probable pitchers are probable, not confirmed.
- Confirmation requires a later verified source or game feed integration.
- Team/game mapping still depends on team names and start times.
- Postponed/rescheduled games can map with warnings or remain unmatched.
- Rest days are based on most recent pitching appearance; relief appearances are flagged but not converted into workload scores.
- Season ERA/WHIP are included as verified data but are not enough for a predictive model.

## 13. Before Pitchers Can Influence Picks

Required next steps:

- Add official confirmation status or game-feed starter verification.
- Backtest pitcher features by market type.
- Add pitcher quality model with transparent inputs.
- Compare sports projection probability against no-vig market probability.
- Preserve abstention when pitcher data is missing or ambiguous.

## 14. Recommended Phase 3

Recommended Phase 3:

1. Add official lineup provider contracts and unavailable-safe provider behavior.
2. Add game-feed starter confirmation if available.
3. Add richer pitcher game-log validation.
4. Keep projection unavailable until pitcher plus lineup quality is verified and backtested.

