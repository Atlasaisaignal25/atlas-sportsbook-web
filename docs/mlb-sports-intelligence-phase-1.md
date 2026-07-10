# MLB Sports Intelligence Layer Phase 1

Date: 2026-07-10

Phase 1 creates architecture only. It does not connect external sports data, does not scrape, does not change pick formulas, does not change thresholds, and does not alter public signal or Top 5 behavior.

## 1. Current MLB Market-Engine Architecture

The current MLB engine is market-derived.

Current flow:

1. `app/api/cron/automationUtils.ts` fetches The Odds API `baseball_mlb` markets: `h2h`, `spreads`, and `totals`.
2. `bestPricedOutcomes` collects best price, book count, average price, median price, price spread, no-vig probability, and stale status.
3. `buildCandidate` accepts/rejects one candidate candidate based on odds range, line rules, MLB minimum book coverage, and stale status.
4. `candidateScore` scores one accepted candidate using market-derived inputs only.
5. `buildPublicSignalFromOddsGame` selects one best candidate per game.
6. `generatePublicSignalsForSport` writes `mlb_public_signals`.
7. `generateDailyTop5ForSport` dedupes by game, ranks by `signalScore`, and writes `mlb_top5_live`.
8. `validatePregameTop5ForSport` performs closing validation.
9. `app/api/cron/historyUtils.ts` snapshots and grades history.

The engine currently has `CandidateContext`, which contains market context for scoring. It does not yet have a reusable per-game sports context. Phase 1 adds `MlbGameContext` as the future per-game sports feature contract.

## 2. New Sports Intelligence Architecture

Target architecture:

```text
External/Public Sports Sources
↓
Provider Adapters
↓
Normalized MLB Sports Features
↓
Sports Projection Layer
↓
Market Comparison Layer
↓
Final Atlas Signal
```

Phase 1 adds only the contracts and the unavailable/default provider.

New modules:

- `app/lib/mlb-engine/sports-intelligence/types.ts`
- `app/lib/mlb-engine/sports-intelligence/provider.ts`
- `app/lib/mlb-engine/sports-intelligence/service.ts`
- `app/lib/mlb-engine/sports-intelligence/projection.ts`
- `app/lib/mlb-engine/sports-intelligence/flags.ts`
- `app/lib/mlb-engine/sports-intelligence/index.ts`

## 3. Exact Integration Point

Future Sports Intelligence should enter after market features have been collected and before final candidate evaluation.

Current exact functions:

- Candidate scoring: `candidateScore` in `app/api/cron/automationUtils.ts`.
- Candidate acceptance/rejection: `buildCandidate` in `app/api/cron/automationUtils.ts`.
- One candidate per game selection: `buildPublicSignalFromOddsGame` in `app/api/cron/automationUtils.ts`.
- Top 5 ranking: `generateDailyTop5ForSport` in `app/api/cron/automationUtils.ts`.

Future flow:

```text
Market Features
+
Sports Intelligence Features
+
Sports Projection
↓
Candidate Evaluation
↓
Final Atlas Signal
```

Phase 1 does not import Sports Intelligence into `automationUtils.ts`, so current picks, count, ranking, formulas, and thresholds remain unchanged.

## 4. Type Definitions Created

Core availability/source types:

- `DataAvailability`
- `FeatureSource`
- `SportsFeatureMetadata`

Feature contracts:

- `StartingPitcherFeatures`
- `LineupStrengthFeatures`
- `OffensiveFormFeatures`
- `BullpenFeatures`
- `WeatherParkFeatures`

Combined contracts:

- `MlbGameContext`
- `MlbSportsIntelligenceFeatures`
- `MlbSportsProjection`
- `MlbCandidateEvaluationContext`

Missing values remain `undefined`. Zero is not used as a replacement for unavailable data.

## 5. Provider Pattern

`MlbSportsIntelligenceProvider` defines five feature methods:

- `getStartingPitcherFeatures`
- `getLineupStrengthFeatures`
- `getOffensiveFormFeatures`
- `getBullpenFeatures`
- `getWeatherParkFeatures`

`UnavailableMlbSportsIntelligenceProvider` is the default provider. It returns `availability: "UNAVAILABLE"` for all modules, includes warnings, and throws no errors during normal operation.

The service, `getMlbSportsIntelligenceFeatures`, safely calls each provider method, isolates thrown provider failures, preserves partial availability, calculates module availability, and aggregates warnings.

## 6. Missing-Data Policy

Unavailable data is not neutral data.

Rules:

- Missing values stay `undefined`.
- No module may default probability to 50%.
- No projection may default runs to the market total.
- No missing pitcher, lineup, bullpen, weather, or stats data may be converted to zero.
- Provider errors produce `availability: "ERROR"` for the affected module only.
- A single provider failure must not block the market engine.

## 7. Feature Flags

Added to `.env.example`:

- `MLB_SPORTS_INTELLIGENCE_ENABLED=false`
- `MLB_PITCHER_MODEL_ENABLED=false`
- `MLB_LINEUP_MODEL_ENABLED=false`
- `MLB_OFFENSIVE_FORM_MODEL_ENABLED=false`
- `MLB_BULLPEN_MODEL_ENABLED=false`
- `MLB_WEATHER_MODEL_ENABLED=false`

Flags are server-side and default false unless explicitly set to `"true"`.

## 8. Future Data-Source Mapping

Phase 1 does not implement ID mapping. The intended mapping is:

- Odds API `eventId` remains the current market event identifier.
- Future MLB official game IDs should map to Odds API event IDs through teams, commence time, and official game metadata.
- Future team IDs should map to normalized home/away team names plus provider-specific IDs.
- Future player IDs should map through official roster/player feeds.
- Future venue IDs should map through official game venue data.

This avoids inventing a competing event-ID system before official sports data is connected.

## 9. Risks

- Sports Intelligence must not reuse market odds as its independent projection.
- Market Intelligence and Sports Intelligence must remain separate.
- True edge should later be calculated as:

```text
Atlas Sports Probability - Market No-Vig Probability
```

- News should not become a direct scoring signal until it is normalized, matched, and validated.
- SportsDataIO or any future source must preserve `UNAVAILABLE`/`PARTIAL` semantics instead of silently filling neutral values.

## 10. Next Recommended Phase

Recommended Phase 2:

1. Add a real provider adapter behind flags, starting with official/probable starting pitchers.
2. Build ID mapping from Odds API event IDs to official game/team/player IDs.
3. Keep projection unavailable until pitcher data is verified and test-covered.
4. Add audit output comparing market no-vig probability versus sports projection only after projection is real.
5. Backtest before allowing Sports Intelligence to influence `candidateScore`.

No SportsDataIO dependency exists in Phase 1.

