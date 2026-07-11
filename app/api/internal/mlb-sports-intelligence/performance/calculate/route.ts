import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import { MLB_PERFORMANCE_ANALYTICS_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/performance/performance-analytics-engine";
import {
  calculatePerformanceAnalytics,
  getPerformanceAnalyticsStatus,
} from "@/app/lib/mlb-engine/sports-intelligence/performance/performance-analytics-repository";

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
    flags.performanceAnalyticsEnabled &&
    flags.performanceAnalyticsMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.performanceAnalyticsMode,
      message: "MLB Performance Analytics is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const calculation = await calculatePerformanceAnalytics();
    const status = await getPerformanceAnalyticsStatus();
    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      researchOnly: true,
      publicScoringImpact: "NONE",
      version: MLB_PERFORMANCE_ANALYTICS_VERSION,
      inserted: calculation.inserted,
      skipped: calculation.skipped,
      errors: calculation.errors,
      performance: calculation.snapshot,
      status,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Performance Analytics calculation error",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}

