import type {
  PrecisionCandidate,
  PrecisionNoPlayReason,
  PrecisionTimeline,
} from "./types";
import { isPrecisionQualified } from "./scoring";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundMinutes(value: number) {
  return Math.ceil(value / MINUTE);
}

function interpolateProgress(
  minutesToKickoff: number,
  windowStartMinutes: number,
  windowEndMinutes: number,
  progressStart: number,
  progressEnd: number
) {
  const windowSize = windowStartMinutes - windowEndMinutes;
  if (windowSize <= 0) return progressEnd;

  const elapsed = windowStartMinutes - minutesToKickoff;
  const ratio = clamp(elapsed / windowSize, 0, 1);

  return Math.round(progressStart + (progressEnd - progressStart) * ratio);
}

function getTimelineProgress(status: PrecisionTimeline["status"], minutesToKickoff: number) {
  if (status === "scanning") {
    return interpolateProgress(minutesToKickoff, 24 * 60, 8 * 60, 10, 30);
  }

  if (status === "validating") {
    return interpolateProgress(minutesToKickoff, 8 * 60, 4 * 60, 30, 55);
  }

  if (status === "strong_candidate") {
    return interpolateProgress(minutesToKickoff, 4 * 60, 2 * 60, 55, 75);
  }

  if (status === "final_review") {
    return interpolateProgress(minutesToKickoff, 2 * 60, 60, 75, 95);
  }

  return 100;
}

function getTimedStatus(minutesToKickoff: number): PrecisionTimeline["status"] {
  if (minutesToKickoff <= 0) return "locked";
  if (minutesToKickoff <= 60) return "available_now";
  if (minutesToKickoff <= 120) return "final_review";
  if (minutesToKickoff <= 240) return "strong_candidate";
  if (minutesToKickoff <= 480) return "validating";

  return "scanning";
}

export function buildNoPlayTimeline(params?: {
  now?: Date | string;
  commenceTime?: string | null;
  reason?: PrecisionNoPlayReason;
}): PrecisionTimeline {
  const now = params?.now ? new Date(params.now) : new Date();
  const commence = params?.commenceTime ? new Date(params.commenceTime) : null;
  const validCommence = commence && Number.isFinite(commence.getTime()) ? commence : null;
  const release = validCommence ? new Date(validCommence.getTime() - HOUR) : null;
  const minutesToKickoff = validCommence
    ? roundMinutes(validCommence.getTime() - now.getTime())
    : null;
  const minutesToRelease = release ? roundMinutes(release.getTime() - now.getTime()) : null;

  return {
    status: "no_play",
    now: now.toISOString(),
    commenceTime: validCommence?.toISOString() ?? null,
    releaseAt: release?.toISOString() ?? null,
    lockedAt: validCommence?.toISOString() ?? null,
    minutesToRelease,
    minutesToKickoff,
    progressPercent: 100,
    canPurchase: false,
    canRevealPick: false,
    noPlayReason: params?.reason ?? (validCommence ? "below_threshold" : "missing_data"),
  };
}

export function buildPrecisionTimeline(params: {
  candidate: PrecisionCandidate;
  now?: Date | string;
  qualified?: boolean;
  noPlayReason?: PrecisionNoPlayReason;
}): PrecisionTimeline {
  const now = params.now ? new Date(params.now) : new Date();
  const commence = params.candidate.startTime ? new Date(params.candidate.startTime) : null;

  if (!commence || !Number.isFinite(commence.getTime())) {
    return buildNoPlayTimeline({
      now,
      commenceTime: null,
      reason: "missing_data",
    });
  }

  const release = new Date(commence.getTime() - HOUR);
  const minutesToKickoff = roundMinutes(commence.getTime() - now.getTime());
  const minutesToRelease = roundMinutes(release.getTime() - now.getTime());
  const qualified = params.qualified ?? isPrecisionQualified(params.candidate);

  if (minutesToKickoff <= 0) {
    return {
      status: "locked",
      now: now.toISOString(),
      commenceTime: commence.toISOString(),
      releaseAt: release.toISOString(),
      lockedAt: commence.toISOString(),
      minutesToRelease,
      minutesToKickoff,
      progressPercent: 100,
      canPurchase: false,
      canRevealPick: false,
      noPlayReason: qualified ? undefined : params.noPlayReason ?? "game_started",
    };
  }

  const status = getTimedStatus(minutesToKickoff);

  if (!qualified && status === "available_now") {
    return buildNoPlayTimeline({
      now,
      commenceTime: commence.toISOString(),
      reason: params.noPlayReason ?? "below_threshold",
    });
  }

  return {
    status,
    now: now.toISOString(),
    commenceTime: commence.toISOString(),
    releaseAt: release.toISOString(),
    lockedAt: commence.toISOString(),
    minutesToRelease,
    minutesToKickoff,
    progressPercent: getTimelineProgress(status, minutesToKickoff),
    canPurchase: status === "available_now" && qualified,
    canRevealPick: status === "available_now" && qualified,
    noPlayReason: qualified ? undefined : params.noPlayReason ?? "below_threshold",
  };
}
