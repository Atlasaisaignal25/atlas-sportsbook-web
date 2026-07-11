import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import { MLB_VALIDATION_HISTORY_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/validation-history/validation-history-engine";
import {
  captureValidationHistory,
  getValidationHistoryStatus,
} from "@/app/lib/mlb-engine/sports-intelligence/validation-history/validation-history-repository";

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
    flags.validationHistoryEnabled &&
    flags.validationHistoryMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.validationHistoryMode,
      message: "MLB Validation History is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const capture = await captureValidationHistory();
    const status = await getValidationHistoryStatus();
    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      researchOnly: true,
      publicScoringImpact: "NONE",
      version: MLB_VALIDATION_HISTORY_VERSION,
      ...capture,
      status,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Validation History capture error",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}

