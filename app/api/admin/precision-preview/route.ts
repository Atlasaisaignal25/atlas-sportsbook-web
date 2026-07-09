import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import {
  buildNoPlayTimeline,
  buildPersistablePrecisionPreview,
  normalizePrecisionDate,
  supportedPrecisionSports,
  type PrecisionDecision,
  type PrecisionSport,
} from "@/app/lib/precision-engine";

export const dynamic = "force-dynamic";

function summarizeLifecycle(decision: PrecisionDecision | null, sport?: PrecisionSport) {
  const timeline =
    decision?.timeline ??
    buildNoPlayTimeline({
      reason: "no_candidates",
    });

  return {
    sport: decision?.sport ?? sport ?? null,
    lifecycleStatus: timeline.status,
    releaseAt: timeline.releaseAt,
    lockedAt: timeline.lockedAt,
    progressPercent: timeline.progressPercent,
    canPurchase: timeline.canPurchase,
    canRevealPick: timeline.canRevealPick,
    minutesToRelease: timeline.minutesToRelease,
    minutesToKickoff: timeline.minutesToKickoff,
    noPlayReason: timeline.noPlayReason ?? null,
  };
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizePrecisionDate(searchParams.get("date"));
  const { candidateSource, candidates, errors, preview } =
    await buildPersistablePrecisionPreview(date);
  const topSignalLifecycles = supportedPrecisionSports.reduce(
    (acc, sport) => {
      const decision = preview.topSignalsBySport[sport] ?? null;
      acc[sport] = summarizeLifecycle(decision, sport);
      return acc;
    },
    {} as Record<string, ReturnType<typeof summarizeLifecycle>>
  );

  return NextResponse.json({
    success: true,
    source: candidateSource,
    candidateSource,
    generatedAt: new Date().toISOString(),
    preview,
    lifecycle: {
      topSignalsBySport: topSignalLifecycles,
      topPlay: summarizeLifecycle(preview.topPlay),
    },
    unsupportedSports: ["NFL"],
    errors,
  });
}
