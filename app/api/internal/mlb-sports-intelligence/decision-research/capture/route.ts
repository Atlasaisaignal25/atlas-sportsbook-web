import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  buildDecisionResearchSnapshots,
  getDecisionResearchStatus,
  insertDecisionResearchSnapshotsDeduped,
} from "@/app/lib/mlb-engine/sports-intelligence/decision-research/decision-research-repository";
import { MLB_DECISION_RESEARCH_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/decision-research/decision-research-engine";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const flags = getMlbSportsIntelligenceFlags();
  const enabled =
    flags.sportsIntelligenceEnabled &&
    flags.decisionResearchEnabled &&
    flags.decisionResearchMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.decisionResearchMode,
      message: "MLB Decision Research is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const capture = await buildDecisionResearchSnapshots();
    const storage = await insertDecisionResearchSnapshotsDeduped(capture.decisions);
    const status = await getDecisionResearchStatus();

    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      version: MLB_DECISION_RESEARCH_VERSION,
      researchOnly: true,
      publicScoringImpact: "NONE",
      asOf: capture.asOf,
      gamesInspected: capture.gamesInspected,
      gamesDecided: capture.decisions.length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      providerErrors: capture.providerErrors,
      distributions: {
        consensus: status.consensusDistribution,
        conviction: status.convictionDistribution,
        decision: status.decisionDistribution,
      },
      noPick: {
        count: status.noPickCount,
        reasons: status.noPickReasons,
        examples: status.noPickExamples,
      },
      examples: capture.decisions.slice(0, 5),
      storageHealth: {
        healthy: storage.errors.length === 0 && status.healthy,
        ...storage,
        snapshotStatus: status,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Decision Research capture error",
    }, { status: 500 });
  }
}
