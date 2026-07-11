import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import { MLB_LEARNING_ENGINE_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/learning/learning-engine";
import {
  analyzeLearningInsights,
  getLearningEngineStatus,
} from "@/app/lib/mlb-engine/sports-intelligence/learning/learning-repository";

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
    flags.learningEngineEnabled &&
    flags.learningEngineMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.learningEngineMode,
      message: "MLB Learning Engine is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const result = await analyzeLearningInsights();
    const status = await getLearningEngineStatus();
    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      researchOnly: true,
      publicScoringImpact: "NONE",
      version: MLB_LEARNING_ENGINE_VERSION,
      inserted: result.inserted,
      skipped: result.skipped,
      errors: result.errors,
      analysis: result.analysis,
      status,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Learning Engine analysis error",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}

