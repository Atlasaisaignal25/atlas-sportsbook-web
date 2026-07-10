# MLB Sports Intelligence Phase 8.1: Team Intelligence

## team_strength_v1 Audit

`team_strength_v1` mixed seven concepts in one score:

- Offense, weight `0.24`
- Bullpen Quality, weight `0.18`
- Bullpen Readiness, weight `0.16`
- Lineup Stability, weight `0.14`
- Starting Pitcher Availability, weight `0.10`
- Environment Readiness, weight `0.08`
- Data Confidence, weight `0.10`

Missing components were not scored as zero. They were excluded and remaining weights were rebalanced. That was safe for missing data, but it allowed non-quality inputs to carry more influence when quality inputs were missing.

The production Detroit example showed the distortion clearly: offense was partial/unscored and lineup stability was unavailable, while Starting Pitcher Availability and Environment Readiness were both 100. Those two components did not prove Detroit was athletically stronger, but they increased the final `team_strength_v1` score.

## Conceptual Problem

Team quality, game readiness, environment certainty and data confidence answer different questions. Combining them into one score makes an operationally ready team look stronger as a baseball team.

## Deprecation Policy

`team_strength_v1` is preserved for audit history only.

Deprecation reason:

`Mixed team quality, readiness and data-confidence concepts.`

It must not be used for current ranking, future projection, market comparison, picks, Top 5, Top Signal or Top Play.

## Team Quality

`team_quality_v1` measures verified baseball quality only.

Current eligible inputs:

- Atlas Offensive Score, weight `65%`
- Bullpen Quality v2, weight `35%`

Future placeholders, not scored yet:

- Starting Pitcher Quality
- Defense
- Baserunning
- Roster Quality

Not eligible:

- Bullpen fatigue
- Lineup stability
- Pitcher confirmation
- Weather or roof certainty
- Park data availability
- Data freshness or confidence

Missing quality inputs do not become zero. A partial score may be produced for audit, but it receives a coverage penalty and LOW confidence.

## Game Readiness

`game_readiness_v1` measures operational readiness for a game.

Eligible inputs:

- Bullpen fatigue/readiness
- Effective bullpen depth
- Lineup confirmation and stability
- Starter certainty
- Late scratch evidence

Quality inputs such as offense and bullpen quality do not enter readiness.

## Context Certainty

`game_context_certainty_v1` measures how complete the game environment is.

Eligible inputs:

- Official game mapping
- Venue resolution
- Forecast availability
- Roof certainty
- Park factor availability

This is not a team score and does not make either team stronger.

## Intelligence Confidence

`team_intelligence_confidence_v1` measures trust in the Team Quality and Game Readiness outputs.

It uses:

- Quality coverage
- Readiness coverage
- Context certainty
- Warning count

Confidence is never added to Team Quality.

## Component Eligibility

Team Quality accepts only verified quality modules. Game Readiness accepts only operational readiness modules. Context Certainty accepts only environment completeness modules.

## Missing Data Policy

Missing modules are excluded from score inputs, but coverage and confidence explicitly show the limitation. Partial Quality is ranked separately from Complete Quality.

## Persistence

Phase 8.1 writes to `public.mlb_team_intelligence_snapshots`.

Feature hashes include material normalized values and versions, not `captured_at`, so identical captures dedupe.

## Distribution Review

The audit endpoint reports:

- Complete Team Quality distribution
- Partial Team Quality distribution
- Game Readiness distribution
- Context Certainty distribution
- Intelligence Confidence tier counts

No single combined leaderboard is published.

## Detroit Before/After

Before:

- `team_strength_v1` could rise from Starting Pitcher Availability and Environment Readiness.

After:

- Starting Pitcher Availability affects Game Readiness only.
- Environment completeness affects Context Certainty only.
- Missing offense lowers quality coverage and confidence.

## Ranking Changes

`Atlas Team Strength Audit` is deprecated. Current audit ranking is split into:

- Atlas Team Quality Audit
- Atlas Partial Team Quality Audit
- Atlas Game Readiness Audit

None of these are power rankings, prediction rankings, pick rankings or best-team rankings.

## Pick Isolation

Phase 8.1 does not connect to public signal generation, candidate scoring, Top 5, Top Signal, Top Play, closing or grading. Sports Projection remains `UNAVAILABLE`.

## Known Limitations

Starting pitcher quality, defense, baserunning and roster quality are not implemented. Team Quality can be partial when offense or bullpen quality is missing.

## Recommended Phase 9

Add verified starting pitcher quality as a quality module, still audit-only, before any historical Team Quality analysis is used for modeling.
