import type { MlbStartingPitcher, StartingPitcherFeatures } from "./types";

export type PitcherStatus = "CONFIRMED" | "PROBABLE" | "EXPECTED" | "UNKNOWN";

export type NormalizedStartingPitcher = {
  playerId?: string;
  name?: string;
  throwingHand?: "L" | "R";
  status: PitcherStatus;
  confirmed: boolean;
  sourceGameId?: string;
  sourceUpdatedAt?: string;
  restDays?: number;
  recentPitchCount?: number;
  recentAppearanceDate?: string;
  recentAppearanceWasStart?: boolean;
  season?: {
    gamesStarted?: number;
    inningsPitched?: number;
    era?: number;
    whip?: number;
    strikeouts?: number;
    walks?: number;
    strikeoutRate?: number;
    walkRate?: number;
  };
  warnings: string[];
};

type OfficialPerson = {
  id?: number;
  fullName?: string;
  pitchHand?: {
    code?: string;
  };
};

type OfficialSeasonStats = Record<string, unknown>;

type OfficialGameLogSplit = {
  date?: string;
  stat?: Record<string, unknown>;
  game?: {
    gamePk?: number;
  };
};

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function handValue(value: unknown): "L" | "R" | undefined {
  return value === "L" || value === "R" ? value : undefined;
}

function calendarDayDiff(laterIso: string, earlierIso: string) {
  const later = new Date(laterIso);
  const earlier = new Date(earlierIso);
  if (!Number.isFinite(later.getTime()) || !Number.isFinite(earlier.getTime())) return undefined;

  const laterUtc = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const earlierUtc = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  const diff = Math.floor((laterUtc - earlierUtc) / 86400000);
  return diff >= 0 ? diff : undefined;
}

export function normalizePitcherSeasonStats(stat?: OfficialSeasonStats) {
  if (!stat) return undefined;

  const battersFaced = numberValue(stat.battersFaced);
  const strikeouts = numberValue(stat.strikeOuts);
  const walks = numberValue(stat.baseOnBalls);
  const strikeoutRate =
    strikeouts !== undefined && battersFaced !== undefined && battersFaced > 0
      ? Number((strikeouts / battersFaced).toFixed(4))
      : undefined;
  const walkRate =
    walks !== undefined && battersFaced !== undefined && battersFaced > 0
      ? Number((walks / battersFaced).toFixed(4))
      : undefined;

  return {
    gamesStarted: numberValue(stat.gamesStarted),
    inningsPitched: numberValue(stat.inningsPitched),
    era: numberValue(stat.era),
    whip: numberValue(stat.whip),
    strikeouts,
    walks,
    strikeoutRate,
    walkRate,
  };
}

export function getMostRecentPitchingAppearance(input: {
  gameLog: OfficialGameLogSplit[];
  commenceTime: string;
}) {
  return [...input.gameLog]
    .filter((split) => split.date)
    .filter((split) => new Date(`${split.date}T00:00:00Z`).getTime() < new Date(input.commenceTime).getTime())
    .sort((a, b) => new Date(`${b.date}T00:00:00Z`).getTime() - new Date(`${a.date}T00:00:00Z`).getTime())[0];
}

export function normalizeStartingPitcher(input: {
  probablePitcher?: { id?: number; fullName?: string };
  person?: OfficialPerson | null;
  status: PitcherStatus;
  sourceGameId?: string;
  sourceUpdatedAt?: string;
  seasonStats?: OfficialSeasonStats;
  gameLog?: OfficialGameLogSplit[];
  commenceTime: string;
}): NormalizedStartingPitcher | undefined {
  const playerId = input.person?.id ?? input.probablePitcher?.id;
  const name = input.person?.fullName ?? input.probablePitcher?.fullName;
  if (!playerId || !name) return undefined;

  const recentAppearance = getMostRecentPitchingAppearance({
    gameLog: input.gameLog ?? [],
    commenceTime: input.commenceTime,
  });
  const recentAppearanceDate = recentAppearance?.date;
  const restDays = recentAppearanceDate
    ? calendarDayDiff(input.commenceTime, `${recentAppearanceDate}T00:00:00Z`)
    : undefined;
  const recentPitchCount = numberValue(recentAppearance?.stat?.numberOfPitches);
  const recentAppearanceWasStart =
    recentAppearance?.stat?.gamesStarted === undefined
      ? undefined
      : numberValue(recentAppearance.stat.gamesStarted) === 1;
  const warnings: string[] = [];

  if (input.status === "PROBABLE") {
    warnings.push(`${name} is listed as probable, not confirmed.`);
  }

  if (recentAppearanceWasStart === false) {
    warnings.push("Most recent pitching appearance was relief; rest days should not be treated as normal starter rest.");
  }

  const season = normalizePitcherSeasonStats(input.seasonStats);
  if (!season) {
    warnings.push("Pitcher season stats unavailable.");
  }

  return {
    playerId: String(playerId),
    name,
    throwingHand: handValue(input.person?.pitchHand?.code),
    status: input.status,
    confirmed: input.status === "CONFIRMED",
    sourceGameId: input.sourceGameId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    restDays,
    recentPitchCount,
    recentAppearanceDate,
    recentAppearanceWasStart,
    season,
    warnings,
  };
}

export function toStartingPitcherContract(
  pitcher: NormalizedStartingPitcher,
): MlbStartingPitcher {
  return {
    playerId: pitcher.playerId,
    name: pitcher.name,
    throwingHand: pitcher.throwingHand,
    status: pitcher.status,
    confirmed: pitcher.confirmed,
    restDays: pitcher.restDays,
    recentPitchCount: pitcher.recentPitchCount,
    era: pitcher.season?.era,
    whip: pitcher.season?.whip,
    strikeoutRate: pitcher.season?.strikeoutRate,
    walkRate: pitcher.season?.walkRate,
  };
}

export function startingPitcherWarnings(
  home?: NormalizedStartingPitcher,
  away?: NormalizedStartingPitcher,
) {
  return [...(home?.warnings ?? []), ...(away?.warnings ?? [])];
}

export function startingPitcherAvailability(input: {
  matched: boolean;
  home?: NormalizedStartingPitcher;
  away?: NormalizedStartingPitcher;
  stale?: boolean;
}) : StartingPitcherFeatures["metadata"]["availability"] {
  if (!input.matched) return "UNAVAILABLE";
  if (input.stale) return "STALE";
  if (input.home && input.away && input.home.confirmed && input.away.confirmed) return "AVAILABLE";
  if (input.home || input.away) return "PARTIAL";
  return "UNAVAILABLE";
}

