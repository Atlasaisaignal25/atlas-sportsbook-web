import {
  aggregateStatcastRowsForTeam,
  selectCompletedGamesForTeam,
  type OffensiveCompletedGame,
} from "./statcast-offense-provider";
import { buildStatcastLeagueBaselineSummary } from "./statcast-baseline";
import {
  applyAuditOnlyOffensiveScores,
  buildAndPersistOffensiveBaselines,
  scoreDistribution,
} from "./offensive-baseline-repository";
import { cachedStatcastClient, type StatcastClient } from "./statcast-client";
import { insertOffensiveFormSnapshotsDeduped } from "./offensive-form-repository";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "../providers/mlb-official-client";
import { MLB_TEAM_IDENTITIES, type MlbTeamIdentity } from "../mlb-team-mapping";
import type { MlbOfficialScheduleGame } from "../mlb-game-mapper";
import type { OffensiveRollingWindow, OffensiveSampleQuality, OffensiveTeamForm } from "../types";
import type { VerifiedOffensiveRollingStats } from "./offensive-form-engine";
import { buildOffensiveFormFeatures } from "./offensive-form-engine";

type WindowMap = Record<OffensiveRollingWindow, OffensiveCompletedGame[]>;

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dateRangeChunks(startDate: string, endDate: string, chunkDays = 6) {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      startDate: addDays(chunkStart.toISOString().slice(0, 10), -1),
      endDate: addDays(chunkEnd.toISOString().slice(0, 10), 1),
    });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function round(value: number | undefined, digits = 3) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function qualityDistribution(forms: OffensiveTeamForm[], window: OffensiveRollingWindow) {
  const counts: Record<OffensiveSampleQuality, number> = {
    SUFFICIENT: 0,
    LIMITED: 0,
    INSUFFICIENT: 0,
    UNAVAILABLE: 0,
  };
  const pa: number[] = [];
  const bbe: number[] = [];

  forms.forEach((form) => {
    const item = form.rollingWindows[window];
    const quality = item?.sampleQuality ?? "UNAVAILABLE";
    counts[quality] += 1;
    if (item?.plateAppearances) pa.push(item.plateAppearances);
    if (item?.battedBallEvents) bbe.push(item.battedBallEvents);
  });

  const total = forms.length || 1;
  return {
    counts,
    sufficientPct: round(counts.SUFFICIENT / total),
    limitedPct: round(counts.LIMITED / total),
    insufficientPct: round(counts.INSUFFICIENT / total),
    medianPA: percentile(pa, 0.5),
    medianBBE: percentile(bbe, 0.5),
    p25PA: percentile(pa, 0.25),
    p75PA: percentile(pa, 0.75),
    p25BBE: percentile(bbe, 0.25),
    p75BBE: percentile(bbe, 0.75),
  };
}

function teamFormsFromStats(stats: VerifiedOffensiveRollingStats[], asOf: string) {
  return stats.map((team) =>
    buildOffensiveFormFeatures({
      home: team,
      observedAt: asOf,
      scoringEnabled: false,
    }).home,
  ).filter(Boolean) as OffensiveTeamForm[];
}

export async function captureMlbOffensiveFormSnapshots(options: {
  asOf?: string;
  officialClient?: Pick<MlbOfficialClient, "getSchedule">;
  statcastClient?: StatcastClient;
  persist?: boolean;
  scoreEnabled?: boolean;
} = {}) {
  const asOf = options.asOf ?? new Date().toISOString();
  const officialClient = options.officialClient ?? cachedMlbOfficialClient;
  const statcastClient = options.statcastClient ?? cachedStatcastClient;
  const officialGames: MlbOfficialScheduleGame[] = [];
  const teams = MLB_TEAM_IDENTITIES;
  const windowsByTeam = new Map<string, WindowMap>();
  let scheduleRequests = 0;

  for (let index = 0; index < 75; index += 1) {
    const date = new Date(new Date(asOf).getTime() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    officialGames.push(...await officialClient.getSchedule(date));
    scheduleRequests += 1;
    const complete = teams.every((team) =>
      selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 30 }).length >= 30,
    );
    if (complete) break;
  }

  teams.forEach((team) => {
    windowsByTeam.set(team.officialTeamId, {
      last7: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 7 }),
      last14: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 14 }),
      last30: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 30 }),
    });
  });

  const allGames = Array.from(windowsByTeam.values()).flatMap((windows) => windows.last30);
  const dates = allGames.map((game) => game.gameDate.slice(0, 10)).filter(Boolean).sort();
  if (dates.length === 0) throw new Error("No completed official MLB games available for offensive capture.");

  const chunks = dateRangeChunks(dates[0], dates.at(-1) ?? dates[0]);
  const statcastResults = await Promise.all(chunks.map((chunk) => statcastClient.getRows(chunk)));
  const rowMap = new Map<string, (typeof statcastResults)[number]["rows"][number]>();
  statcastResults.flatMap((result) => result.rows).forEach((row) => {
    const key = `${row.gamePk ?? "no-game"}:${row.atBatNumber ?? "no-ab"}:${row.pitchNumber ?? "no-pitch"}:${row.events ?? "no-event"}:${row.description ?? "no-description"}`;
    rowMap.set(key, row);
  });
  const statcastRows = Array.from(rowMap.values());
  const teamStats = teams.map((team): VerifiedOffensiveRollingStats => {
    const windows = windowsByTeam.get(team.officialTeamId);
    return {
      teamId: team.officialTeamId,
      teamName: team.officialTeamName,
      asOf,
      source: "BASEBALL_SAVANT",
      windows: {
        last7: aggregateStatcastRowsForTeam({ team, rows: statcastRows, games: windows?.last7 ?? [], window: "last7" }),
        last14: aggregateStatcastRowsForTeam({ team, rows: statcastRows, games: windows?.last14 ?? [], window: "last14" }),
        last30: aggregateStatcastRowsForTeam({ team, rows: statcastRows, games: windows?.last30 ?? [], window: "last30" }),
      },
    };
  });
  const teamForms = teamFormsFromStats(teamStats, asOf);
  const storage = options.persist === false
    ? { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] }
    : await insertOffensiveFormSnapshotsDeduped({ teams: teamForms, asOf });
  const baselinePersistence = options.persist === false
    ? { inserted: 0, skipped: 0, errors: [] as string[], metrics: {}, asOf, season: new Date(asOf).getUTCFullYear() }
    : await buildAndPersistOffensiveBaselines({ asOf, season: new Date(asOf).getUTCFullYear() });
  const scoreEnabled = options.scoreEnabled ?? process.env.MLB_OFFENSIVE_SCORE_ENABLED === "true";
  const scoredTeamForms = scoreEnabled
    ? applyAuditOnlyOffensiveScores(teamForms, baselinePersistence as any)
    : teamForms;
  const scoreStorage = scoreEnabled && options.persist !== false
    ? await insertOffensiveFormSnapshotsDeduped({ teams: scoredTeamForms, asOf })
    : { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const baseline = buildStatcastLeagueBaselineSummary({ teamWindows: teamStats, asOf });
  const windows = ["last7", "last14", "last30"] as OffensiveRollingWindow[];
  const distribution = Object.fromEntries(windows.map((window) => [window, qualityDistribution(teamForms, window)]));
  const sampleWindows = scoredTeamForms.flatMap((form) => Object.values(form.rollingWindows).filter(Boolean));
  const statcastRowsProcessed = sampleWindows.reduce((sum, window) => sum + (window.rawRows ?? 0), 0);
  const uniquePlateAppearances = sampleWindows.reduce((sum, window) => sum + (window.uniquePlateAppearances ?? 0), 0);

  return {
    asOf,
    teamsInspected: teams.length,
    teamsMapped: teamForms.length,
    windowsCalculated: sampleWindows.length,
    snapshotsInserted: storage.inserted + scoreStorage.inserted,
    duplicateSnapshotsSkipped: storage.skipped + scoreStorage.skipped,
    sufficientWindows: sampleWindows.filter((window) => window.sampleQuality === "SUFFICIENT").length,
    limitedWindows: sampleWindows.filter((window) => window.sampleQuality === "LIMITED").length,
    insufficientWindows: sampleWindows.filter((window) => window.sampleQuality === "INSUFFICIENT").length,
    unavailableWindows: sampleWindows.filter((window) => window.sampleQuality === "UNAVAILABLE").length,
    statcastRowsProcessed,
    uniquePlateAppearances,
    providerErrors: [...storage.errors, ...scoreStorage.errors, ...baselinePersistence.errors],
    storageHealth: {
      healthy: storage.errors.length === 0 && scoreStorage.errors.length === 0,
      raw: storage,
      score: scoreStorage,
    },
    baselinesInserted: baselinePersistence.inserted,
    duplicateBaselinesSkipped: baselinePersistence.skipped,
    scoreEnabled,
    scoreMode: scoreEnabled ? "AUDIT_ONLY" : "DISABLED",
    teamsScored: scoredTeamForms.filter((form) => form.atlasOffensiveScore !== undefined).length,
    teamsUnscored: scoredTeamForms.filter((form) => form.atlasOffensiveScore === undefined).length,
    scoreDistribution: scoreDistribution(scoredTeamForms),
    baselineStatus: baseline,
    requestHealth: {
      scheduleRequests,
      statcastRequests: statcastResults.length,
      statcastCacheHits: statcastResults.filter((result) => result.cacheHit).length,
      statcastCacheMisses: statcastResults.filter((result) => !result.cacheHit).length,
      statcastRows: statcastRows.length,
      statcastLatencyMs: statcastResults.reduce((sum, result) => sum + result.latencyMs, 0),
      sourceUrls: statcastResults.map((result) => result.sourceUrl),
    },
    sampleQualityDistribution: distribution,
    teamForms: scoredTeamForms,
  };
}

export function selectOffensiveDiagnosticExamples(forms: OffensiveTeamForm[]) {
  const withLast7 = forms
    .map((form) => ({ form, window: form.rollingWindows.last7 }))
    .filter((item) => item.window);
  const byMetric = (metric: keyof NonNullable<OffensiveTeamForm["rollingWindows"]["last7"]>, direction: "asc" | "desc") =>
    [...withLast7]
      .filter((item) => typeof item.window?.[metric] === "number")
      .sort((a, b) => {
        const av = a.window?.[metric] as number;
        const bv = b.window?.[metric] as number;
        return direction === "asc" ? av - bv : bv - av;
      })[0];
  const limited = withLast7.find((item) => item.window?.sampleQuality !== "SUFFICIENT");
  const format = (label: string, item: (typeof withLast7)[number] | undefined) => item ? {
    label,
    team: item.form.teamName,
    window: "last7",
    hardHitRate: item.window?.hardHitRate,
    barrelRate: item.window?.barrelRate,
    walkRate: item.window?.walkRate,
    strikeoutRate: item.window?.strikeoutRate,
    plateAppearances: item.window?.plateAppearances,
    battedBallEvents: item.window?.battedBallEvents,
    sampleQuality: item.window?.sampleQuality,
  } : undefined;

  return [
    format("highest hard-hit rate", byMetric("hardHitRate", "desc")),
    format("lowest hard-hit rate", byMetric("hardHitRate", "asc")),
    format("highest walk rate", byMetric("walkRate", "desc")),
    format("highest strikeout rate", byMetric("strikeoutRate", "desc")),
    format("limited or unavailable sample", limited),
  ].filter(Boolean);
}
