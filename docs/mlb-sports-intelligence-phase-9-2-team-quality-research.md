# Atlas MLB Sports Intelligence Phase 9.2

## Team Quality Research v2

Phase 9.2 adds `team_quality_v2_research`, a research-only Team Quality score that integrates:

- Atlas Offensive Score
- Starting Pitcher Quality v1
- Bullpen Quality v2

The score is not connected to `candidateScore`, `buildCandidate`, Top 5, Top Signal, Top Play, closing, grading, subscriptions, or public UI.

## Research Weights

Current recommended research weights are `tq_research_v1`:

- Starting Pitcher Quality: 45%
- Atlas Offensive Score: 35%
- Bullpen Quality v2: 20%

Sensitivity configs are exposed for audit:

- A: 45 / 35 / 20
- B: 40 / 40 / 20
- C: 50 / 30 / 20

## Coverage Rules

Missing modules are never converted to zero.

- `AVAILABLE`: all 3 modules available
- `PARTIAL`: 2 modules available
- `LIMITED`: 1 module available
- `UNAVAILABLE`: no modules available

Starting Pitcher Quality is accepted only when it uses `PRODUCTION_BASELINE` and `starting_pitcher_baseline_v1`.

## Capture

Protected route:

`POST /api/internal/mlb-sports-intelligence/team-intelligence/research-capture`

Required mode:

- `MLB_TEAM_QUALITY_RESEARCH_ENABLED=true`
- `MLB_TEAM_QUALITY_RESEARCH_MODE=RESEARCH_ONLY`
- `MLB_TEAM_QUALITY_RESEARCH_WEIGHT_VERSION=tq_research_v1`

## Storage

Research rows are stored in `public.mlb_team_intelligence_snapshots` with `team_quality_version = 'team_quality_v2_research'`.

V1 Team Intelligence rows remain separate and are filtered by `team_quality_version = 'team_quality_v1'`.

## Audit

The protected MLB audit endpoint exposes `teamQualityResearch` with:

- status and storage health
- complete / partial / limited counts
- score distribution
- V1 vs V2 comparison
- sensitivity summary
- confidence distribution
- examples

Sports Projection remains `UNAVAILABLE`.
