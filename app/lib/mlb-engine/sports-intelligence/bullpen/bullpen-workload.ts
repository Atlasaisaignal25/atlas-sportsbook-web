import type {
  BullpenFatigueComponent,
  MlbBullpenWorkloadAvailability,
  MlbRelieverAppearance,
  MlbRelieverWorkload,
  MlbTeamBullpenFeatures,
  SportsFeatureMetadata,
} from "../types";

export const BULLPEN_FATIGUE_SCORE_VERSION = "bullpen_fatigue_v1";

export type BullpenWorkloadThresholds = {
  lightAppearanceMaxPitches: number;
  heavyAppearanceMinPitches: number;
  limitedThreeDayPitches: number;
  heavyThreeDayPitches: number;
  limitedConsecutiveDays: number;
  heavyConsecutiveDays: number;
};

export const DEFAULT_BULLPEN_WORKLOAD_THRESHOLDS: BullpenWorkloadThresholds = {
  lightAppearanceMaxPitches: 15,
  heavyAppearanceMinPitches: 30,
  limitedThreeDayPitches: 45,
  heavyThreeDayPitches: 70,
  limitedConsecutiveDays: 2,
  heavyConsecutiveDays: 3,
};

function round(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function officialDate(value: string) {
  return value.slice(0, 10);
}

function daysAgo(asOf: string, gameDate: string) {
  const asOfDate = Date.UTC(
    new Date(asOf).getUTCFullYear(),
    new Date(asOf).getUTCMonth(),
    new Date(asOf).getUTCDate(),
  );
  const parsed = new Date(`${officialDate(gameDate)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((asOfDate - parsed.getTime()) / 86_400_000);
}

function sum(values: Array<number | undefined>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value));
  if (numeric.length === 0) return undefined;
  return round(numeric.reduce((total, value) => total + value, 0));
}

function countInWindow(appearances: MlbRelieverAppearance[], asOf: string, days: number) {
  return appearances.filter((appearance) => {
    const age = daysAgo(asOf, appearance.gameDate);
    return age >= 0 && age <= days;
  });
}

function consecutiveDaysUsed(appearances: MlbRelieverAppearance[], asOf: string) {
  const dates = new Set(appearances.map((appearance) => officialDate(appearance.gameDate)));
  const latest = Array.from(dates)
    .filter((date) => new Date(`${date}T00:00:00Z`).getTime() <= new Date(asOf).getTime())
    .sort()
    .at(-1);
  if (!latest) return 0;
  let count = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(`${latest}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    if (!dates.has(date.toISOString().slice(0, 10))) break;
    count += 1;
  }
  return count;
}

function workloadAvailability(input: {
  appearances: MlbRelieverAppearance[];
  asOf: string;
  thresholds: BullpenWorkloadThresholds;
}): MlbBullpenWorkloadAvailability {
  const last2 = countInWindow(input.appearances, input.asOf, 2);
  const last3 = countInWindow(input.appearances, input.asOf, 3);
  const pitchesLast3 = sum(last3.map((appearance) => appearance.pitchesThrown));
  const missingPitchCount = last3.some((appearance) => appearance.pitchesThrown === undefined);
  const consecutive = consecutiveDaysUsed(input.appearances, input.asOf);

  if (input.appearances.length === 0) return "UNKNOWN";
  if (missingPitchCount && pitchesLast3 === undefined) return "UNKNOWN";
  if (
    consecutive >= input.thresholds.heavyConsecutiveDays ||
    (pitchesLast3 ?? 0) >= input.thresholds.heavyThreeDayPitches ||
    last3.some((appearance) => (appearance.pitchesThrown ?? 0) >= input.thresholds.heavyAppearanceMinPitches)
  ) return "HEAVY";
  if (
    consecutive >= input.thresholds.limitedConsecutiveDays ||
    (pitchesLast3 ?? 0) >= input.thresholds.limitedThreeDayPitches ||
    last2.length >= 2
  ) return "LIMITED";
  if (last2.length === 0) return "FRESH";
  return "AVAILABLE";
}

function workloadScore(workload: Pick<MlbRelieverWorkload, "pitchesLast3Days" | "appearancesLast3Days" | "consecutiveDaysUsed">) {
  const pitchScore = Math.min(45, ((workload.pitchesLast3Days ?? 0) / 70) * 45);
  const appearanceScore = Math.min(30, workload.appearancesLast3Days * 10);
  const consecutiveScore = Math.min(25, workload.consecutiveDaysUsed * 10);
  return round(Math.min(100, pitchScore + appearanceScore + consecutiveScore), 1);
}

export function buildRelieverWorkloads(input: {
  appearances: MlbRelieverAppearance[];
  asOf: string;
  thresholds?: BullpenWorkloadThresholds;
}) {
  const thresholds = input.thresholds ?? DEFAULT_BULLPEN_WORKLOAD_THRESHOLDS;
  const byPlayer = new Map<string, MlbRelieverAppearance[]>();
  input.appearances.filter((appearance) => appearance.reliefAppearance).forEach((appearance) => {
    const list = byPlayer.get(appearance.playerId) ?? [];
    list.push(appearance);
    byPlayer.set(appearance.playerId, list);
  });

  return Array.from(byPlayer.entries()).map(([playerId, appearances]): MlbRelieverWorkload => {
    const sorted = [...appearances].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
    const last1 = countInWindow(sorted, input.asOf, 1);
    const last2 = countInWindow(sorted, input.asOf, 2);
    const last3 = countInWindow(sorted, input.asOf, 3);
    const last7 = countInWindow(sorted, input.asOf, 7);
    const workload = {
      playerId,
      playerName: sorted[0]?.playerName ?? playerId,
      appearancesLast1Day: last1.length,
      appearancesLast2Days: last2.length,
      appearancesLast3Days: last3.length,
      appearancesLast7Days: last7.length,
      pitchesLast1Day: sum(last1.map((appearance) => appearance.pitchesThrown)),
      pitchesLast2Days: sum(last2.map((appearance) => appearance.pitchesThrown)),
      pitchesLast3Days: sum(last3.map((appearance) => appearance.pitchesThrown)),
      pitchesLast7Days: sum(last7.map((appearance) => appearance.pitchesThrown)),
      inningsLast3Days: sum(last3.map((appearance) => appearance.inningsPitched)),
      inningsLast7Days: sum(last7.map((appearance) => appearance.inningsPitched)),
      consecutiveDaysUsed: consecutiveDaysUsed(sorted, input.asOf),
      lastAppearanceAt: sorted[0]?.gameDate,
      workloadAvailability: workloadAvailability({ appearances: sorted, asOf: input.asOf, thresholds }),
      warnings: Array.from(new Set(sorted.flatMap((appearance) => appearance.warnings))),
    };
    return { ...workload, workloadScore: workloadScore(workload) };
  }).sort((a, b) => (b.pitchesLast3Days ?? 0) - (a.pitchesLast3Days ?? 0));
}

function fatigueComponents(team: MlbTeamBullpenFeatures): BullpenFatigueComponent[] {
  const components: BullpenFatigueComponent[] = [];
  const add = (component: string, rawValue: number | undefined, max: number, weight: number, warnings?: string[]) => {
    if (rawValue === undefined) return;
    components.push({
      component,
      rawValue,
      normalizedScore: round(Math.min(100, Math.max(0, (rawValue / max) * 100)), 1) ?? 0,
      weight,
      warnings,
    });
  };
  add("totalPitchesLast3Days", team.totalPitchesLast3Days, 180, 0.32);
  add("totalInningsLast3Days", team.totalInningsLast3Days, 18, 0.18);
  add("relieversUsedLast3Days", team.relieversUsedLast3Days, 12, 0.16);
  add("relieversOnConsecutiveDays", team.relieversOnConsecutiveDays, 5, 0.16);
  add("relieversWithHeavyWorkload", team.relieversWithHeavyWorkload, 4, 0.1);
  if (team.closerCandidate) {
    const closer = team.relievers.find((reliever) => reliever.playerId === team.closerCandidate?.playerId);
    add("closerCandidateWorkload", closer?.workloadScore, 100, 0.08);
  }
  return components;
}

export function applyBullpenFatigueScore(team: MlbTeamBullpenFeatures) {
  const components = fatigueComponents(team);
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  const missingPitchCounts = team.metadata.appearancesMissingPitchCounts ?? 0;
  if (totalWeight <= 0 || (team.metadata.completenessPercentage ?? 0) < 0.7) {
    return {
      ...team,
      fatigueComponents: components,
      fatigueScoreVersion: BULLPEN_FATIGUE_SCORE_VERSION,
      warnings: [...team.warnings, "Bullpen fatigue score unavailable because source completeness is insufficient."],
    };
  }
  const score = components.reduce((total, item) => total + item.normalizedScore * item.weight, 0) / totalWeight;
  const completenessPenalty = missingPitchCounts > 0 ? Math.min(8, missingPitchCounts * 1.5) : 0;
  return {
    ...team,
    fatigueScore: round(Math.min(100, score + completenessPenalty), 1),
    fatigueScoreV1: round(Math.min(100, score + completenessPenalty), 1),
    fatigueScoreVersion: BULLPEN_FATIGUE_SCORE_VERSION,
    fatigueComponents: components,
  };
}

export function buildTeamBullpenFeatures(input: {
  teamId: string;
  teamName: string;
  appearances: MlbRelieverAppearance[];
  gamesRequested: number;
  gamesIncluded: number;
  asOf: string;
  sourceUpdatedAt?: string;
  scoreEnabled?: boolean;
  warnings?: string[];
}): MlbTeamBullpenFeatures {
  const recentAppearances = input.appearances.filter((appearance) => {
    const age = daysAgo(input.asOf, appearance.gameDate);
    return age >= 0 && age <= 7;
  });
  const relievers = buildRelieverWorkloads({ appearances: recentAppearances, asOf: input.asOf });
  const uniqueGames = (days: number) => new Set(input.appearances
    .filter((appearance) => {
      const age = daysAgo(input.asOf, appearance.gameDate);
      return age >= 0 && age <= days;
    })
    .map((appearance) => appearance.officialGameId)).size;
  const last1 = relievers.filter((reliever) => reliever.appearancesLast1Day > 0);
  const last2 = relievers.filter((reliever) => reliever.appearancesLast2Days > 0);
  const last3 = relievers.filter((reliever) => reliever.appearancesLast3Days > 0);
  const appearancesLast3 = input.appearances.filter((appearance) => daysAgo(input.asOf, appearance.gameDate) >= 0 && daysAgo(input.asOf, appearance.gameDate) < 3);
  const missingPitchCounts = recentAppearances.filter((appearance) => appearance.reliefAppearance && appearance.pitchesThrown === undefined).length;
  const completeness = recentAppearances.length === 0 ? 0 : (recentAppearances.length - missingPitchCounts) / recentAppearances.length;
  const warnings = [...(input.warnings ?? [])];
  if (missingPitchCounts > 0) warnings.push(`${missingPitchCounts} relief appearances are missing official pitch counts.`);
  const roleAppearances = recentAppearances.filter((appearance) =>
    appearance.save || appearance.hold || appearance.gameFinished,
  );
  const sortedRoleAppearances = [...roleAppearances].sort((a, b) =>
    Number(Boolean(b.save)) - Number(Boolean(a.save)) ||
    Number(Boolean(b.gameFinished)) - Number(Boolean(a.gameFinished)) ||
    b.gameDate.localeCompare(a.gameDate) ||
    a.playerId.localeCompare(b.playerId),
  );
  const closerAppearance = sortedRoleAppearances[0];
  const highLeverage = Array.from(new Map(sortedRoleAppearances.map((appearance) => [
    appearance.playerId,
    {
      playerId: appearance.playerId,
      playerName: appearance.playerName,
      roleEvidence: appearance.save ? "SAVES" as const : appearance.hold ? "HOLDS" as const : "GAME_FINISHES" as const,
      workloadAvailability: relievers.find((reliever) => reliever.playerId === appearance.playerId)?.workloadAvailability ?? "UNKNOWN" as const,
    },
  ])).values()).slice(0, 5);
  const availability = input.gamesIncluded === 0
    ? "UNAVAILABLE"
    : missingPitchCounts > 0 || input.gamesIncluded < input.gamesRequested
      ? "PARTIAL"
      : "AVAILABLE";
  const metadata: MlbTeamBullpenFeatures["metadata"] = {
    availability,
    source: "MLB_OFFICIAL",
    observedAt: input.asOf,
    updatedAt: input.sourceUpdatedAt,
    gamesRequested: input.gamesRequested,
    gamesIncluded: uniqueGames(7) || input.gamesIncluded,
    missingGames: Math.max(0, input.gamesRequested - input.gamesIncluded),
    appearancesIncluded: recentAppearances.length,
    appearancesMissingPitchCounts: missingPitchCounts,
    completenessPercentage: round(completeness, 3),
    warnings,
  };
  const team: MlbTeamBullpenFeatures = {
    teamId: input.teamId,
    teamName: input.teamName,
    relievers,
    totalAppearancesLast3Days: appearancesLast3.length,
    totalPitchesLast3Days: sum(appearancesLast3.map((appearance) => appearance.pitchesThrown)),
    totalInningsLast3Days: sum(appearancesLast3.map((appearance) => appearance.inningsPitched)),
    relieversUsedLast1Day: last1.length,
    relieversUsedLast2Days: last2.length,
    relieversUsedLast3Days: last3.length,
    relieversOnConsecutiveDays: relievers.filter((reliever) => reliever.consecutiveDaysUsed >= 2).length,
    relieversWithHeavyWorkload: relievers.filter((reliever) => reliever.workloadAvailability === "HEAVY").length,
    closerCandidate: closerAppearance ? {
      playerId: closerAppearance.playerId,
      playerName: closerAppearance.playerName,
      identificationMethod: closerAppearance.save ? "RECENT_SAVES" : closerAppearance.gameFinished ? "RECENT_GAME_FINISHES" : "UNKNOWN",
      workloadAvailability: relievers.find((reliever) => reliever.playerId === closerAppearance.playerId)?.workloadAvailability ?? "UNKNOWN",
    } : undefined,
    highLeverageRelievers: highLeverage,
    qualityScore: undefined,
    gamesPlayedLast1Day: uniqueGames(1),
    gamesPlayedLast2Days: uniqueGames(2),
    gamesPlayedLast3Days: uniqueGames(3),
    gamesPlayedLast7Days: uniqueGames(7),
    doubleheadersLast7Days: Array.from(input.appearances.reduce((dates, appearance) => {
      const games = dates.get(appearance.gameDate.slice(0, 10)) ?? new Set<string>();
      games.add(appearance.officialGameId);
      dates.set(appearance.gameDate.slice(0, 10), games);
      return dates;
    }, new Map<string, Set<string>>()).values()).filter((games) => games.size > 1).length,
    extraInningGamesLast7Days: 0,
    offDaysLast3Days: Math.max(0, 3 - uniqueGames(3)),
    bullpenPitchesPerGameLast3: uniqueGames(3) > 0 ? round((sum(appearancesLast3.map((appearance) => appearance.pitchesThrown)) ?? 0) / uniqueGames(3), 1) : undefined,
    bullpenInningsPerGameLast3: uniqueGames(3) > 0 ? round((sum(appearancesLast3.map((appearance) => appearance.inningsPitched)) ?? 0) / uniqueGames(3), 2) : undefined,
    relieverUsagePerGameLast3: uniqueGames(3) > 0 ? round(last3.length / uniqueGames(3), 2) : undefined,
    metadata,
    warnings,
    inningsLast3Days: sum(appearancesLast3.map((appearance) => appearance.inningsPitched)),
    pitchesLast3Days: sum(appearancesLast3.map((appearance) => appearance.pitchesThrown)),
    closerAvailable: closerAppearance
      ? !["HEAVY", "UNKNOWN"].includes(relievers.find((reliever) => reliever.playerId === closerAppearance.playerId)?.workloadAvailability ?? "UNKNOWN")
      : undefined,
    highLeverageArmsAvailable: highLeverage.filter((reliever) => !["HEAVY", "UNKNOWN"].includes(reliever.workloadAvailability)).length,
  };
  return input.scoreEnabled ? applyBullpenFatigueScore(team) : team;
}

export function fatigueDistribution(teams: MlbTeamBullpenFeatures[]) {
  const scores = teams.map((team) => team.fatigueScore).filter((score): score is number => Number.isFinite(score)).sort((a, b) => a - b);
  if (scores.length === 0) return { teamCount: 0 };
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  return {
    teamCount: scores.length,
    mean: round(average, 2),
    minimum: scores[0],
    maximum: scores.at(-1),
    median: scores.length % 2 ? scores[Math.floor(scores.length / 2)] : round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2, 2),
  };
}
