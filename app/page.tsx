"use client";

import { Suspense, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
// import mlbSignals from "@/data/mlb-public-signals.json";
import nbaSignals from "@/data/nba-public-signals.json";
import nhlSignals from "@/data/nhl-public-signals.json";
import soccerSignals from "@/data/soccer-public-signals.json";
import mlbTop5 from "@/data/mlb-top5.json";
import nbaTop5 from "@/data/nba-top5.json";
import nhlTop5 from "@/data/nhl-top5.json";
import soccerTop5 from "@/data/soccer-top5.json";
import { teamBranding } from "./lib/teamBranding";
import { useRouter, useSearchParams } from "next/navigation";
import {getMlbPublicSignals,getMlbTop5Live,} from "@/app/lib/supabase/mlbLiveSignals";
import { getNbaPublicSignals, getNbaTop5Live } from "@/app/lib/supabase/nbaLiveSignals";
import { getNhlPublicSignals, getNhlTop5Live } from "@/app/lib/supabase/nhlLiveSignals";
import {getSoccerPublicSignals,getSoccerTop5Live,} from "@/app/lib/supabase/soccerLiveSignals";
import { atlasPulseMock } from "@/app/data/atlasPulseMock";
import { createAtlasEventsFromPulseItems } from "@/lib/market-impact/eventEngine";
import type { AtlasEvent, AtlasSource } from "@/types/atlasEvent";
import type { PulseImpact, PulseSport } from "@/types/marketImpact";
import type { TeamImpactEvent } from "@/types/teamImpact";
import type { MarketImpactEvent } from "@/types/marketImpactEvent";
import type { AtlasIntelligenceEvent } from "@/types/atlasIntelligenceEvent";
import {
  SignalsHomePage,
  type PrecisionNotifyResult,
  type PrecisionUnlockResult,
  type SignalsLiveRow,
} from "@/app/components/signals/SignalsHomePage";
import { AtlasBottomNavigation } from "@/app/components/AtlasBottomNavigation";
import { HowItWorksSheet } from "@/app/components/signals/HowItWorksSheet";
import type { SignalDetectedRow } from "@/app/components/signals/SignalDetectedFeed";
import {
  ATLAS_RECOMMENDED_PERCENTAGE,
  HIGHER_EXPOSURE_PERCENTAGE,
  calculateRecommendedUnit,
  buildFinancialPlan,
  clearBankrollConfig,
  createBankrollConfig,
  createManualTracking,
  createTrackedPick,
  calculateRiskPercentage,
  formatPercentage,
  formatCurrency,
  formatPlanPackage,
  formatPlanStatus,
  getReplacementSummary,
  getPlanStatusTone,
  buildManualAnalytics,
  buildComparison,
  loadBankrollConfig,
  loadAvailableAtlasPicks,
  loadManualSummaryHistory,
  loadTrackingHistory,
  loadBankrollUIState,
  normalizeBankrollConfig,
  saveBankrollConfig,
  saveBankrollUIState,
  saveManualTracking,
  syncPlans,
  syncManualTrackingWithAtlas,
  createSnapshot,
  createSnapshotFromSources,
  deactivateDemoMode,
  activateDemoMode,
  atlasSourcesToTrackingPicks,
  loadLatestSnapshot,
  resolveSnapshotMode,
  snapshotToAtlasSources,
  updateBankrollConfig,
  validateBankroll,
  type AtlasTrackedPickInput,
  type AtlasPackageSourcePick,
  type AtlasPackageSources,
  type AtlasTrackingPickOption,
  type AtlasDailySnapshot,
  type AtlasPlanPackage,
  type AtlasPlanSport,
  type AtlasPlanStatus,
  type BankrollConfig,
  type AtlasPlan,
  type AtlasPlanCollection,
  type FinancialMetrics,
  type TrackingHistoryPick,
  type TrackingRange,
  type ManualTrackingAnalytics,
  type TrackingComparison,
  type ComparisonLeader,
  type ManualTrackingCollection,
  type BankrollProfile,
  type BankrollUIState,
} from "@/app/lib/bankroll";
import {
  OfficialSportSelectorRow,
  officialSelectedSportToSportCode,
  officialSportCodeToSelectedSport,
  type OfficialSelectedSport,
} from "@/app/components/signals/OfficialSportSelectorRow";
import { AtlasControlCenterTabBar } from "@/app/admin/AdminDashboard";




type Outcome = {
  name: string;
  price: number;
  point?: number;
};

type Market = {
  key: string;
  outcomes: Outcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  markets: Market[];
};

type OddsGame = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Bookmaker[];
};

type SignalGame = {
  gameId: string | number;
  awayTeam?: string;
  homeTeam?: string;
  pick: string;
  market?: string | null;
  line?: number | null;
  odds?: number | null;
  status?: string;
  isTop5?: boolean;
  isTopSignal?: boolean;
  topRank?: number | null;
  analysisSummary?: string | null;
  confidenceLabel?: string | null;
  edgeLabel?: string | null;
  riskNote?: string | null;
  modelFactors?: string[] | null;
  startTime?: string | null;
};

type Top5Entry = {
  gameId?: string | number | null;
  rank?: number;
  awayTeam?: string;
  homeTeam?: string;
  pick: string;
  market?: string | null;
  line?: number | string | null;
  odds?: number | null;
  startTime?: string | null;
  status?: string;
  isTopSignal?: boolean;
  label?: string;
  confidence?: number | string | null;
  internalScore?: number | string | null;
};

type TopSignalCard = Top5Entry & {
  sport: "MLB" | "NBA" | "NHL" | "SOCCER";
};

type LiveScore = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed?: boolean;
  scores?: Array<{
    name: string;
    score: string;
  }>;
  rawStatus?: string;
  period?: string | number | null;
  inningHalf?: string | null;
  statusDetail?: string | null;
  timeRemaining?: string | null;
};

type UserPlan = "free" | "exclusive" | "premium" | "elite" | "unlimited" | "admin";
type PlanAccess = {
  plan: Exclude<UserPlan, "admin">;
  selectedSport?: SportTab;
  canViewTop3: boolean;
  canViewRankedTop3: boolean;
  canViewAllSports: boolean;
  canViewTopSignal: false;
  canViewTopPlay: false;
};
type CheckoutProduct =
  | "exclusive"
  | "premium"
  | "elite"
  | "unlimited"
  | "top_signal_mlb"
  | "top_signal_nba"
  | "top_signal_nhl"
  | "top_signal_soccer"
  | "top_signal_nfl"
  | "top_play";

type UserAccess = {
  plan: UserPlan;
  sports: SportTab[];
  unlocks: {
    topPlay: boolean;
    topSignals: SportTab[];
  };
};

const planAccessRules: Record<Exclude<UserPlan, "admin">, Omit<PlanAccess, "plan" | "selectedSport">> = {
  free: {
    canViewTop3: false,
    canViewRankedTop3: false,
    canViewAllSports: false,
    canViewTopSignal: false,
    canViewTopPlay: false,
  },
  exclusive: {
    canViewTop3: true,
    canViewRankedTop3: false,
    canViewAllSports: false,
    canViewTopSignal: false,
    canViewTopPlay: false,
  },
  premium: {
    canViewTop3: true,
    canViewRankedTop3: true,
    canViewAllSports: false,
    canViewTopSignal: false,
    canViewTopPlay: false,
  },
  elite: {
    canViewTop3: true,
    canViewRankedTop3: true,
    canViewAllSports: true,
    canViewTopSignal: false,
    canViewTopPlay: false,
  },
  unlimited: {
    canViewTop3: true,
    canViewRankedTop3: true,
    canViewAllSports: true,
    canViewTopSignal: false,
    canViewTopPlay: false,
  },
};

type RecordStats = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decided: number;
  total: number;
  winRate: number;
};

type AuthSessionState = {
  authenticated: boolean;
  email: string | null;
};

type AuthSessionResponse = {
  authenticated?: unknown;
  email?: unknown;
  plan?: unknown;
  sports?: unknown;
  unlocks?: {
    topPlay?: unknown;
    topSignals?: unknown;
  } | null;
};

type JoinAuthMode = "signin" | "signup";

type SignalsJourneyMessage = {
  tone: "success" | "info" | "error";
  title: string;
  body?: string;
};

const nbaSignalsData = nbaSignals as { games: SignalGame[] };
const nhlSignalsData = nhlSignals as { games: SignalGame[] };
const soccerSignalsData = soccerSignals as { games: SignalGame[] };

const nbaTop5Data = nbaTop5 as { top5: Top5Entry[] };
const nhlTop5Data = nhlTop5 as { top5: Top5Entry[] };
const soccerTop5Data = soccerTop5 as { top5: Top5Entry[] };

const sportsTabs = ["NHL", "NBA", "TOP", "MLB", "NFL", "SOCCER"] as const;
type SportTab = (typeof sportsTabs)[number];
type CheckoutSport = Exclude<SportTab, "TOP">;
type ImpactFeedFilter = "ALL" | "TEAM" | "MARKET" | "INTELLIGENCE" | PulseImpact;
const checkoutSports = ["MLB", "NBA", "NHL", "SOCCER", "NFL"] as const satisfies readonly CheckoutSport[];
const precisionDisplaySports = ["MLB", "NBA", "NFL", "NHL", "SOCCER"] as const satisfies readonly CheckoutSport[];
const snapshotLookupSports = ["MLB", "NBA", "NFL", "NHL", "SOCCER"] as const satisfies readonly AtlasPlanSport[];
const scoreBoardSports = ["MLB", "SOCCER"] as const satisfies readonly SportTab[];
type PrecisionLifecycleStatus =
  | "scanning"
  | "validating"
  | "strong_candidate"
  | "final_review"
  | "available_now"
  | "locked"
  | "no_play";
type PrecisionPickPreview = {
  gameId: string | null;
  startTime: string | null;
  pickLabel: string;
  market: string | null;
  selection: string | null;
  line: number | null;
  odds: number | null;
};
type PrecisionPublicResponse = {
  ok: boolean;
  productType: "top_signal" | "top_play";
  sport: Lowercase<CheckoutSport> | "global";
  date: string;
  status: PrecisionLifecycleStatus;
  releaseAt: string | null;
  lockedAt: string | null;
  progressPercent: number;
  minutesToRelease: number | null;
  minutesToKickoff: number | null;
  canPurchase: boolean;
  canRevealPick: boolean;
  purchased: boolean;
  admin: boolean;
  availableForPurchase: boolean;
  noPlayReason: string | null;
  preview: {
    title: string;
    subtitle: string;
    message: string;
  };
  pick: PrecisionPickPreview | null;
};
type AppSection = "signals" | "scores" | "bankroll" | "news" | "alerts" | "more";
type AtlasAlert = {
  id: string;
  tone: "cyan" | "yellow" | "green" | "red" | "white";
  label: string;
  title: string;
  body: string;
  action?: () => void;
};

type SignalInsight = {
  sport: SportTab;
  awayTeam: string;
  homeTeam: string;
  pick: string;
  analysisSummary: string;
  confidenceLabel?: string | null;
  edgeLabel?: string | null;
  riskNote?: string | null;
  modelFactors: string[];
};

const emptyRecordStats = (): RecordStats => ({
  wins: 0,
  losses: 0,
  pushes: 0,
  pending: 0,
  decided: 0,
  total: 0,
  winRate: 0,
});

function toRecordStats(data: any): RecordStats {
  return {
    wins: Number(data?.wins ?? 0),
    losses: Number(data?.losses ?? 0),
    pushes: Number(data?.pushes ?? 0),
    pending: Number(data?.pending ?? 0),
    decided: Number(data?.decided ?? 0),
    total: Number(data?.total ?? 0),
    winRate: Number(data?.winRate ?? 0),
  };
}

function getRecordEndpoint(
  selectedSport: SportTab,
  recordType: "top-signal" | "top5"
) {
  if (selectedSport === "MLB") return `/api/${recordType}-record/mlb`;
  if (selectedSport === "NBA") return `/api/${recordType}-record/nba`;
  if (selectedSport === "NHL") return `/api/${recordType}-record/nhl`;
  if (selectedSport === "SOCCER") return `/api/${recordType}-record/soccer`;

  return "";
}

function isUserPlan(value: unknown): value is UserPlan {
  return (
    value === "free" ||
    value === "exclusive" ||
    value === "premium" ||
    value === "elite" ||
    value === "unlimited" ||
    value === "admin"
  );
}

function isCheckoutProduct(value: unknown): value is CheckoutProduct {
  return (
    value === "exclusive" ||
    value === "premium" ||
    value === "elite" ||
    value === "unlimited" ||
    value === "top_signal_mlb" ||
    value === "top_signal_nba" ||
    value === "top_signal_nhl" ||
    value === "top_signal_soccer" ||
    value === "top_signal_nfl" ||
    value === "top_play"
  );
}

function isSubscriptionCheckoutProduct(value: CheckoutProduct): value is "exclusive" | "premium" | "elite" | "unlimited" {
  return value === "exclusive" || value === "premium" || value === "elite" || value === "unlimited";
}

function topSignalProductForSport(sport: CheckoutSport): CheckoutProduct {
  return `top_signal_${sport.toLowerCase()}` as CheckoutProduct;
}

function hasAllSportsAccessPlan(plan: UserPlan) {
  return plan === "elite" || plan === "unlimited" || plan === "admin";
}

function buildBankrollAtlasSources(params: {
  mlbSignals: SignalGame[];
  nbaSignals: SignalGame[];
  nhlSignals: SignalGame[];
  soccerSignals: SignalGame[];
  mlbTop5: Top5Entry[];
  nbaTop5: Top5Entry[];
  nhlTop5: Top5Entry[];
  soccerTop5: Top5Entry[];
}): AtlasPackageSources {
  const signalSources = [
    ...params.mlbSignals.map((pick, index) => signalGameToAtlasSourcePick(pick, "MLB", index)),
    ...params.nbaSignals.map((pick, index) => signalGameToAtlasSourcePick(pick, "NBA", index)),
    ...params.nhlSignals.map((pick, index) => signalGameToAtlasSourcePick(pick, "NHL", index)),
    ...params.soccerSignals.map((pick, index) => signalGameToAtlasSourcePick(pick, "SOCCER", index)),
  ].filter((pick): pick is AtlasPackageSourcePick => Boolean(pick));
  const topFiveSources = [
    ...params.mlbTop5.map((pick, index) => topFiveEntryToAtlasSourcePick(pick, "MLB", index)),
    ...params.nbaTop5.map((pick, index) => topFiveEntryToAtlasSourcePick(pick, "NBA", index)),
    ...params.nhlTop5.map((pick, index) => topFiveEntryToAtlasSourcePick(pick, "NHL", index)),
    ...params.soccerTop5.map((pick, index) => topFiveEntryToAtlasSourcePick(pick, "SOCCER", index)),
  ].filter((pick): pick is AtlasPackageSourcePick => Boolean(pick));

  return {
    signals: signalSources,
    top3: topFiveSources.filter((pick) => (pick.rank ?? 999) <= 3),
    top5: topFiveSources,
  };
}

function getBankrollMembershipFromAccess(userAccess: UserAccess, selectedPackSport: CheckoutSport, sources: AtlasPackageSources): {
  package: AtlasPlanPackage;
  selectedSport: AtlasPlanSport | null;
  availableSports: AtlasPlanSport[];
} {
  const planPackage = userAccess.plan === "exclusive" || userAccess.plan === "premium" ? userAccess.plan : userAccess.plan === "free" ? "free" : "unlimited";
  const sourceSports = getAtlasSourceSports(planPackage === "free" ? sources.signals : planPackage === "exclusive" ? sources.top3 : sources.top5);
  const userSports = userAccess.sports
    .map((sport) => sportToAtlasPlanSport(sport))
    .filter((sport): sport is AtlasPlanSport => Boolean(sport));
  const selectedSport = planPackage === "premium"
    ? userSports[0] ?? sportToAtlasPlanSport(selectedPackSport) ?? sourceSports[0] ?? "MLB"
    : null;
  const availableSports = planPackage === "premium"
    ? selectedSport ? [selectedSport] : []
    : sourceSports;

  return {
    package: planPackage,
    selectedSport,
    availableSports,
  };
}

function signalGameToAtlasSourcePick(pick: SignalGame, sport: AtlasPlanSport, index: number): AtlasPackageSourcePick | null {
  const odds = Number(pick.odds);
  const market = String(pick.market ?? "").trim();
  const startTime = normalizeAtlasSourceStartTime(pick.startTime);
  if (!pick.pick || !market || !Number.isFinite(odds) || !startTime) return null;

  return {
    id: `signals-${sport.toLowerCase()}-${String(pick.gameId ?? index)}`,
    sport,
    league: sport,
    eventId: pick.gameId ? String(pick.gameId) : null,
    homeTeam: pick.homeTeam ?? "",
    awayTeam: pick.awayTeam ?? "",
    selection: pick.pick,
    market,
    odds,
    status: normalizeAtlasSourceStatus(pick.status),
    rank: index + 1,
    startTime,
  };
}

function topFiveEntryToAtlasSourcePick(pick: Top5Entry, sport: AtlasPlanSport, index: number): AtlasPackageSourcePick | null {
  const odds = Number(pick.odds);
  const market = String(pick.market ?? "").trim();
  const startTime = normalizeAtlasSourceStartTime(pick.startTime);
  if (!pick.pick || !market || !Number.isFinite(odds) || !startTime) return null;

  return {
    id: `top5-${sport.toLowerCase()}-${String(pick.gameId ?? pick.rank ?? index)}`,
    sport,
    league: sport,
    eventId: pick.gameId ? String(pick.gameId) : null,
    homeTeam: pick.homeTeam ?? "",
    awayTeam: pick.awayTeam ?? "",
    selection: pick.pick,
    market,
    odds,
    status: normalizeAtlasSourceStatus(pick.status),
    rank: pick.rank ?? index + 1,
    startTime,
  };
}

function normalizeAtlasSourceStatus(status: unknown): AtlasPlanStatus {
  const normalized = String(status ?? "pending").toLowerCase().replace(/\s+/g, "_");
  if (normalized === "confirmed" || normalized === "validated") return "confirmed";
  if (normalized === "started" || normalized === "live" || normalized === "in_progress") return "started";
  if (normalized === "won" || normalized === "win") return "won";
  if (normalized === "lost" || normalized === "loss") return "lost";
  if (normalized === "push") return "push";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "removed") return "removed";
  if (normalized === "downgraded") return "downgraded";
  if (normalized === "no_eligible_replacement") return "no_eligible_replacement";
  return "pending";
}

function normalizeAtlasSourceStartTime(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getAtlasSourceSports(picks: AtlasPackageSourcePick[]) {
  return Array.from(new Set(picks.map((pick) => pick.sport))).sort((a, b) => a.localeCompare(b));
}

function sportToAtlasPlanSport(sport: string): AtlasPlanSport | null {
  if (sport === "MLB" || sport === "NBA" || sport === "NFL" || sport === "NHL" || sport === "SOCCER") return sport;
  return null;
}

function getTeamLogoKey(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const internationalSoccerTeams = [
  { abbr: "USA", file: "worldcup-us.svg", aliases: ["USA", "United States", "United States of America", "USMNT"] },
  { abbr: "MEX", file: "worldcup-mx.svg", aliases: ["Mexico", "México"] },
  { abbr: "CAN", file: "worldcup-ca.svg", aliases: ["Canada"] },
  { abbr: "BRA", file: "worldcup-br.svg", aliases: ["Brazil", "Brasil"] },
  { abbr: "ARG", file: "worldcup-ar.svg", aliases: ["Argentina"] },
  { abbr: "ENG", file: "worldcup-eng.svg", aliases: ["England"] },
  { abbr: "FRA", file: "worldcup-fr.svg", aliases: ["France"] },
  { abbr: "GER", file: "worldcup-de.svg", aliases: ["Germany", "Deutschland"] },
  { abbr: "ESP", file: "worldcup-es.svg", aliases: ["Spain", "España"] },
  { abbr: "POR", file: "worldcup-pt.svg", aliases: ["Portugal"] },
  { abbr: "NED", file: "worldcup-nl.svg", aliases: ["Netherlands", "Holland"] },
  { abbr: "JPN", file: "worldcup-jp.svg", aliases: ["Japan"] },
  { abbr: "MAR", file: "worldcup-ma.svg", aliases: ["Morocco"] },
  { abbr: "URU", file: "worldcup-uy.svg", aliases: ["Uruguay"] },
  { abbr: "BEL", file: "worldcup-be.svg", aliases: ["Belgium"] },
  { abbr: "CRO", file: "worldcup-hr.svg", aliases: ["Croatia"] },
  { abbr: "COL", file: "worldcup-co.svg", aliases: ["Colombia"] },
  { abbr: "ITA", file: "worldcup-it.svg", aliases: ["Italy", "Italia"] },
  { abbr: "SUI", file: "worldcup-ch.svg", aliases: ["Switzerland", "Swiss"] },
  { abbr: "DEN", file: "worldcup-dk.svg", aliases: ["Denmark"] },
  { abbr: "POL", file: "worldcup-pl.svg", aliases: ["Poland"] },
  { abbr: "SEN", file: "worldcup-sn.svg", aliases: ["Senegal"] },
  { abbr: "NGA", file: "worldcup-ng.svg", aliases: ["Nigeria"] },
  { abbr: "KOR", file: "worldcup-kr.svg", aliases: ["South Korea", "Korea Republic", "Republic of Korea"] },
  { abbr: "AUS", file: "worldcup-au.svg", aliases: ["Australia"] },
  { abbr: "ECU", file: "worldcup-ec.svg", aliases: ["Ecuador"] },
  { abbr: "CHI", file: "worldcup-cl.svg", aliases: ["Chile"] },
  { abbr: "CRC", file: "worldcup-cr.svg", aliases: ["Costa Rica"] },
  { abbr: "PAN", file: "worldcup-pa.svg", aliases: ["Panama", "Panamá"] },
  { abbr: "QAT", file: "worldcup-qa.svg", aliases: ["Qatar"] },
  { abbr: "KSA", file: "worldcup-sa.svg", aliases: ["Saudi Arabia"] },
] as const;

const internationalSoccerLogoMap = Object.fromEntries(
  internationalSoccerTeams.flatMap((team) =>
    team.aliases.map((alias) => [
      getTeamLogoKey(alias),
      `/team-logos/soccer/${team.file}`,
    ])
  )
) as Record<string, string>;

const internationalSoccerAbbrMap = Object.fromEntries(
  internationalSoccerTeams.flatMap((team) =>
    team.aliases.map((alias) => [getTeamLogoKey(alias), team.abbr])
  )
) as Record<string, string>;

function getTeamData(teamName: string) {
  return teamBranding[teamName] ?? null;
}

function getDisplayName(teamName: string) {
  return getTeamData(teamName)?.shortName ?? teamName;
}

function getDisplayAbbr(teamName: string) {
  return (
    getTeamData(teamName)?.abbr ??
    internationalSoccerAbbrMap[getTeamLogoKey(teamName)] ??
    teamName.slice(0, 3).toUpperCase()
  );
}

function getLogo(teamName: string, sport: SportTab) {
  const cleanName = getTeamLogoKey(teamName);

  if (sport === "NBA") {
    return `/team-logos/nba/${cleanName}.png`;
  }

  if (sport === "NHL") {
    return `/team-logos/nhl/${cleanName}.png`;
  }

  if (sport === "MLB") {
    return `/team-logos/mlb/${cleanName}.png`;
  }

  if (sport === "SOCCER") {
    const internationalLogo = internationalSoccerLogoMap[cleanName];

    if (internationalLogo) return internationalLogo;

    return `/team-logos/soccer/${cleanName}.png`;
  }

  return null;
}

function resolveTeamNameForSport(teamName: string | null | undefined, sport: SportTab) {
  if (!teamName) return null;
  if (teamBranding[teamName]) return teamName;

  const normalized = getTeamLogoKey(teamName);
  const sportAliases: Partial<Record<SportTab, Record<string, string>>> = {
    MLB: {
      ari: "Arizona Diamondbacks",
      az: "Arizona Diamondbacks",
      bal: "Baltimore Orioles",
      chc: "Chicago Cubs",
      cws: "Chicago White Sox",
      kc: "Kansas City Royals",
      laa: "Los Angeles Angels",
      lad: "Los Angeles Dodgers",
      nyy: "New York Yankees",
      nym: "New York Mets",
      sd: "San Diego Padres",
      sf: "San Francisco Giants",
      stl: "St. Louis Cardinals",
      tb: "Tampa Bay Rays",
      wsn: "Washington Nationals",
      wsh: "Washington Nationals",
      nat: "Washington Nationals",
      ame: "Arizona Diamondbacks",
    },
  };
  const aliased = sportAliases[sport]?.[normalized];

  if (aliased) return aliased;

  const sportSegment = `/team-logos/${sport.toLowerCase()}/`;
  const match = Object.entries(teamBranding).find(([name, data]) => {
    if (!data.logo.includes(sportSegment)) return false;
    return (
      getTeamLogoKey(name) === normalized ||
      getTeamLogoKey(data.shortName) === normalized ||
      data.abbr.toLowerCase() === teamName.toLowerCase()
    );
  });

  return match?.[0] ?? teamName;
}

function getSportDisplayTeamName(teamName: string | null | undefined, sport: SportTab) {
  return resolveTeamNameForSport(teamName, sport) ?? teamName ?? "";
}

function getOfficialMatchupLabel(awayTeam: string | null | undefined, homeTeam: string | null | undefined, sport: SportTab) {
  const away = getSportDisplayTeamName(awayTeam ?? "", sport);
  const home = getSportDisplayTeamName(homeTeam ?? "", sport);

  if (away && home && away !== home) return `${away} @ ${home}`;
  return home || away || "Team Impact";
}

function getMarketDisplayTeamName(teamName: string | null | undefined, sport: SportTab) {
  const normalized = (teamName ?? "").trim().toLowerCase();
  if (sport === "MLB" && (normalized === "ame" || normalized === "american league")) return "American League";
  if (sport === "MLB" && (normalized === "nat" || normalized === "national league")) return "National League";
  return getSportDisplayTeamName(teamName, sport);
}

function getMarketMatchupLabel(awayTeam: string | null | undefined, homeTeam: string | null | undefined, sport: SportTab) {
  const away = getMarketDisplayTeamName(awayTeam, sport);
  const home = getMarketDisplayTeamName(homeTeam, sport);

  if (away && home && away !== home) return `${away} @ ${home}`;
  return home || away || "Market Impact";
}

function getTeamImpactSubjectTeam(event: TeamImpactEvent, sport: SportTab) {
  const home = getSportDisplayTeamName(event.homeTeam ?? "", sport);
  const away = getSportDisplayTeamName(event.awayTeam ?? "", sport);
  const candidates = [home, away].filter((team): team is string => Boolean(team));
  const searchable = [event.why, event.impact, event.eventType, event.playerName].filter(Boolean).join(" ").toLowerCase();
  const mentioned = candidates.find((team) => {
    const branding = getTeamData(team);
    const checks = [team, branding?.shortName, branding?.abbr].filter(Boolean).map((value) => value!.toLowerCase());
    return checks.some((value) => searchable.includes(value));
  });

  return mentioned ?? home ?? away ?? event.sport;
}

function getPreviewSentence(text: string) {
  const maxPreviewLength = 72;
  const trimmed = text.replace(/\s+/g, " ").trim();
  const sentence = trimmed.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  const preview = sentence || trimmed;
  return preview.length > maxPreviewLength ? `${preview.slice(0, maxPreviewLength - 3).trim()}...` : preview;
}

function TeamBadge({
  teamName,
  sport,
}: {
  teamName: string;
  sport: SportTab;
}) {
  const logo = getLogo(teamName, sport);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  if (logo && !logoFailed) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1">
        <img
          src={logo}
          alt={teamName}
          className="h-full w-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[10px] font-bold text-white/70">
      {getDisplayAbbr(teamName)}
    </div>
  );
}

function getSportTheme(sport: CheckoutSport | SportTab) {
  if (sport === "MLB") {
    return {
      accent: "green" as const,
      border: "border-lime-400/55",
      text: "text-lime-300",
      glow: "shadow-[0_0_22px_rgba(74,222,128,0.15)]",
      bar: "from-lime-300 to-green-500",
      bg: "bg-lime-400/10",
    };
  }

  if (sport === "NFL") {
    return {
      accent: "purple" as const,
      border: "border-purple-400/55",
      text: "text-purple-300",
      glow: "shadow-[0_0_22px_rgba(168,85,247,0.15)]",
      bar: "from-purple-300 to-violet-500",
      bg: "bg-purple-400/10",
    };
  }

  if (sport === "NHL") {
    return {
      accent: "yellow" as const,
      border: "border-yellow-400/55",
      text: "text-yellow-300",
      glow: "shadow-[0_0_22px_rgba(250,204,21,0.16)]",
      bar: "from-yellow-300 to-amber-500",
      bg: "bg-yellow-400/10",
    };
  }

  return {
    accent: "cyan" as const,
    border: "border-cyan-400/55",
    text: "text-cyan-300",
    glow: "shadow-[0_0_22px_rgba(34,211,238,0.14)]",
    bar: "from-cyan-300 to-sky-500",
    bg: "bg-cyan-400/10",
  };
}

function SportMark({
  sport,
  size = "md",
}: {
  sport: CheckoutSport | SportTab;
  size?: "sm" | "md" | "lg";
}) {
  const imageSize =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const imageMap: Partial<Record<SportTab, string>> = {
    MLB: "/assets/sports/mlb.svg",
    NBA: "/assets/sports/nba.svg",
    NFL: "/assets/sports/nfl.svg",
    NHL: "/assets/sports/nhl.svg",
    SOCCER: "/assets/sports/soccer.png",
  };
  const sportLogo = imageMap[sport];

  if (!sportLogo) return null;

  return (
    <img
      src={sportLogo}
      alt={`${sport} logo`}
      className={`${imageSize} object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.18)]`}
    />
  );
}

function AtlasSplashScreen({ entered }: { entered: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-[#020716] transition-opacity duration-500 ease-out ${
        entered ? "opacity-100" : "opacity-0"
      }`}
    >
      <style>{`
        @keyframes atlasSplashImageMotion {
          0% {
            transform: scale(0.9) translateY(22px);
            filter: brightness(0.45) saturate(0.7) blur(10px);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          52% {
            transform: scale(1.035) translateY(0);
            filter: brightness(1.2) saturate(1.15) blur(0);
          }
          76% {
            transform: scale(1.005) translateY(0);
            filter: brightness(1.08) saturate(1.08);
          }
          100% {
            transform: scale(1) translateY(0);
            filter: brightness(1) saturate(1);
            opacity: 1;
          }
        }

        @keyframes atlasSplashLightSweep {
          0% {
            transform: translateX(-130%) rotate(16deg);
            opacity: 0;
          }
          42% {
            opacity: 0.22;
          }
          100% {
            transform: translateX(135%) rotate(16deg);
            opacity: 0;
          }
        }

        @keyframes atlasSplashLoadingSweep {
          0% {
            transform: translateX(-110%);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          82% {
            opacity: 1;
          }
          100% {
            transform: translateX(210%);
            opacity: 0;
          }
        }
      `}</style>

      <div
        className="relative mx-auto h-full w-full max-w-md bg-[#020716]"
        style={{
          animation: entered
            ? "atlasSplashImageMotion 1500ms cubic-bezier(0.16, 1, 0.3, 1) both"
            : undefined,
        }}
      >
        <img
          src="/splash-screen.png"
          alt="Atlas Signals"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="pointer-events-none absolute bottom-[4.85%] left-[26%] h-[4px] w-[48%] overflow-hidden rounded-full">
          <div
            className="h-full w-[42%] rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.95)]"
            style={{
              animation: entered
                ? "atlasSplashLoadingSweep 1450ms cubic-bezier(0.22, 0.9, 0.22, 1) 120ms both"
                : undefined,
            }}
          />
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent blur-xl"
          style={{
            animation: entered
              ? "atlasSplashLightSweep 1150ms cubic-bezier(0.3, 0.7, 0.2, 1) 180ms both"
              : undefined,
          }}
        />
      </div>
    </div>
  );
}

function getPreferredBookmaker(game: OddsGame) {
  return (
    game.bookmakers?.find((b) => b.key === "draftkings") ||
    game.bookmakers?.[0] ||
    null
  );
}

function getMarket(game: OddsGame, marketKey: string) {
  const bookmaker = getPreferredBookmaker(game);
  return bookmaker?.markets?.find((m) => m.key === marketKey) || null;
}

function formatAmericanOdds(value?: number | null) {
  if (value === null || value === undefined) return "N/A";
  return value > 0 ? `+${value}` : `${value}`;
}

function getMoneyline(game: OddsGame, teamName: string) {
  const market = getMarket(game, "h2h");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);
  return outcome?.price ?? null;
}

function getDrawOdds(game: OddsGame) {
  const market = getMarket(game, "h2h");
  const outcome = market?.outcomes?.find((o) => normalizeName(o.name) === "draw");
  return outcome?.price ?? null;
}

function getSpreadValue(game: OddsGame, teamName: string) {
  const market = getMarket(game, "spreads");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);

  if (!outcome) return "N/A";
  if (outcome.point === undefined) return "N/A";

  return outcome.point > 0 ? `+${outcome.point}` : `${outcome.point}`;
}

function getSpreadPrice(game: OddsGame, teamName: string) {
  const market = getMarket(game, "spreads");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);
  return formatAmericanOdds(outcome?.price);
}

function getTotalValues(game: OddsGame) {
  const market = getMarket(game, "totals");

  if (!market) {
    return {
      overLabel: "N/A",
      underLabel: "N/A",
      summary: "N/A",
    };
  }

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  if (!over || !under) {
    return {
      overLabel: "N/A",
      underLabel: "N/A",
      summary: "N/A",
    };
  }

  const overPoint = over.point !== undefined ? over.point : "N/A";
  const underPoint = under.point !== undefined ? under.point : "N/A";

  return {
    overLabel: `O ${overPoint}`,
    underLabel: `U ${underPoint}`,
    summary: `O ${overPoint} / U ${underPoint}`,
  };
}

function getTotalPrices(game: OddsGame) {
  const market = getMarket(game, "totals");

  if (!market) {
    return {
      overPrice: "N/A",
      underPrice: "N/A",
    };
  }

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  return {
    overPrice: formatAmericanOdds(over?.price),
    underPrice: formatAmericanOdds(under?.price),
  };
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  .replace(" AM", " am")
  .replace(" PM", " pm");
}

function getGameMinute(game: LiveScore) {
  if (game.completed) return "Final";

  const sportKey = String(game.sport_key ?? "").toLowerCase();

  const clock =
    (game as any)?.clock ??
    (game as any)?.time_remaining ??
    (game as any)?.timer ??
    (game as any)?.display_clock ??
    null;

  const period =
    (game as any)?.period ??
    (game as any)?.current_period ??
    (game as any)?.quarter ??
    null;

  const inning =
    (game as any)?.inning ??
    (game as any)?.current_inning ??
    (game as any)?.inning_number ??
    null;

  const inningHalf =
    (game as any)?.inning_half ??
    (game as any)?.half_inning ??
    (game as any)?.inning_state ??
    null;

  const minute =
    (game as any)?.minute ??
    (game as any)?.match_minute ??
    (game as any)?.elapsed ??
    null;

  const status =
    (game as any)?.status ??
    (game as any)?.rawStatus ??
    (game as any)?.game_status ??
    (game as any)?.status_detail ??
    null;

  if (sportKey.includes("baseball")) {
    if (inning && inningHalf) {
      const half = String(inningHalf).toLowerCase().includes("top")
        ? "Top"
        : String(inningHalf).toLowerCase().includes("bottom")
        ? "Bot"
        : String(inningHalf);

      return `${half} ${inning}`;
    }

    if (inning) return `Inning ${inning}`;
    if (status) return String(status);
    return "Live";
  }

  if (sportKey.includes("soccer")) {
    if (minute) return `${minute}'`;
    if (status) return String(status);
    return "Live";
  }

  if (sportKey.includes("basketball")) {
    if (clock && period) return `${clock} • Q${period}`;
    if (period) return `Q${period}`;
    if (clock) return String(clock);
    return "Live";
  }

  if (sportKey.includes("icehockey")) {
    if (clock && period) return `${clock} • P${period}`;
    if (period) return `P${period}`;
    if (clock) return String(clock);
    return "Live";
  }

  if (clock && period) return `${clock} • ${period}`;
  if (clock) return String(clock);
  if (period) return String(period);

  return "Live";
}

function getLiveSportFromKey(sportKey: string): SportTab {
  if (sportKey.includes("basketball")) return "NBA";
  if (sportKey.includes("icehockey")) return "NHL";
  if (sportKey.includes("baseball")) return "MLB";
  return "SOCCER";
}

function getLeagueDisplayName(sportKey: string) {
  const leagueMap: Record<string, string> = {
    basketball_nba: "NBA (Estados Unidos)",
    icehockey_nhl: "NHL (Estados Unidos)",
    baseball_mlb: "MLB (Estados Unidos)",
    soccer_epl: "Premier League (Inglaterra)",
    soccer_spain_la_liga: "La Liga (España)",
    soccer_italy_serie_a: "Serie A (Italia)",
    soccer_germany_bundesliga: "Bundesliga (Alemania)",
    soccer_france_ligue_one: "Ligue 1 (Francia)",
    soccer_usa_mls: "MLS (Estados Unidos)",
    soccer_mexico_ligamx: "Liga MX (México)",
    soccer_uefa_champs_league: "Champions League",
    soccer_uefa_europa_league: "Europa League",
    soccer_uefa_europa_conference_league: "Conference League",
    soccer_england_championship: "Championship (Inglaterra)",
    soccer_portugal_primeira_liga: "Primeira Liga (Portugal)",
    soccer_netherlands_eredivisie: "Eredivisie (Países Bajos)",
    soccer_fifa_world_cup: "FIFA World Cup",
  };

  return (
    leagueMap[sportKey] ??
    sportKey.replace(/^soccer_/, "").replace(/_/g, " ").toUpperCase()
  );
}

function getDayKey(date: Date) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getRelativeDayKey(offset: number) {
  const now = new Date();

  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  nyNow.setHours(0, 0, 0, 0);
  nyNow.setDate(nyNow.getDate() + offset);

  return nyNow.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getGameDayKey(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function isDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveScheduleDay(value: string | null) {
  if (isDateKey(value)) return value as string;
  if (value === "yesterday") return getRelativeDayKey(-1);
  if (value === "tomorrow") return getRelativeDayKey(1);
  return getRelativeDayKey(0);
}

function formatScheduleMonth(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .toUpperCase();
}

function formatScheduleWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(date)
    .toUpperCase();
}

function ScheduleDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const day = value.split("-")[2] ?? "--";
  const isToday = value === getRelativeDayKey(0);

  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <label className="relative grid h-[58px] w-[58px] shrink-0 place-items-center overflow-hidden rounded-[16px] border border-cyan-400/25 bg-cyan-400/[0.08] shadow-[0_0_18px_rgba(34,211,238,0.08)]">
        <input
          type="date"
          value={value}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          aria-label="Schedule date"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-300">
          {formatScheduleMonth(value)}
        </span>
        <span className="-mt-1 text-[22px] font-black leading-none text-white">
          {day}
        </span>
      </label>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          Schedule
        </p>
        <p className="mt-1 truncate text-[15px] font-black text-white">
          {isToday ? "Today" : formatScheduleWeekday(value)}
        </p>
      </div>

      {!isToday ? (
        <button
          type="button"
          onClick={() => onChange(getRelativeDayKey(0))}
          className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-[11px] font-bold text-white/65"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}

function CompactScheduleDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const day = value.split("-")[2] ?? "--";

  return (
    <label className="relative grid h-[54px] w-[54px] shrink-0 place-items-center overflow-hidden rounded-[15px] border border-cyan-400/25 bg-cyan-400/[0.08] shadow-[0_0_18px_rgba(34,211,238,0.08)]">
      <input
        type="date"
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
        aria-label="Schedule date"
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-cyan-300">
        {formatScheduleMonth(value)}
      </span>
      <span className="-mt-1 text-[21px] font-black leading-none text-white">
        {day}
      </span>
    </label>
  );
}

function isLiveStatus(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  return (
    normalized === "inprogress" ||
    normalized === "in_progress" ||
    normalized === "live" ||
    normalized === "halftime" ||
    normalized === "delayed" ||
    normalized.includes("in progress")
  );
}

function isGameLive(game: LiveScore) {
  return (
    !game.completed &&
    (isLiveStatus((game as any).rawStatus) ||
      isLiveStatus((game as any).status) ||
      (Array.isArray(game.scores) && game.scores.length > 0))
  );
}

function getLiveScoreValue(game: LiveScore, teamName: string) {
  return game.scores?.find((score) => score.name === teamName)?.score ?? "-";
}

function getMlbInningText(game: LiveScore) {
  const sportKey = String(game.sport_key ?? "").toLowerCase();

  if (!sportKey.includes("baseball")) {
    return getGameMinute(game);
  }

  const detail = String(game.statusDetail ?? "");
  const detailMatch = detail.match(/(?:top|bot|bottom)?\s*(\d+)/i);
  const inning = Number(game.period ?? detailMatch?.[1] ?? NaN);

  if (!Number.isFinite(inning)) return getGameMinute(game);

  const suffix = inning === 1 ? "ra" : inning === 2 ? "da" : "ta";
  return `${inning}${suffix} Entrada`;
}

function formatScoreboardTime(dateString: string) {
  const date = new Date(dateString);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
  const dayPeriod =
    parts.find((part) => part.type === "dayPeriod")?.value.toLowerCase() ?? "";

  return `${hour}:${minute} ${dayPeriod === "am" ? "a.m." : "p.m."}`;
}

function getScoreboardTotalLabel(oddsGame: OddsGame | null) {
  if (!oddsGame) return "N/A";

  const market = getMarket(oddsGame, "totals");
  const point = market?.outcomes?.find((outcome) => outcome.point !== undefined)?.point;

  return point !== undefined ? `O/U ${point}` : "N/A";
}

function LiveScoreboardRow({
  game,
  sport,
  oddsGame,
  isLast,
  topSignalHighlight = false,
  topSignalCta = null,
  onOpen,
}: {
  game: LiveScore;
  sport: SportTab;
  oddsGame: OddsGame | null;
  isLast: boolean;
  topSignalHighlight?: boolean;
  topSignalCta?: { label: string; onClick?: () => void } | null;
  onOpen: () => void;
}) {
  const awayScore = getLiveScoreValue(game, game.away_team);
  const homeScore = getLiveScoreValue(game, game.home_team);
  const hasScore = awayScore !== "-" || homeScore !== "-";
  const live = isGameLive(game);
  const statusLabel = game.completed
    ? "Final"
    : live
    ? getGameMinute(game)
    : "";
  const centerValue = hasScore
    ? `${awayScore}-${homeScore}`
    : live
    ? getGameMinute(game)
    : formatScoreboardTime(game.commence_time);
  const centerValueClass = hasScore
    ? "text-[19px]"
    : live
    ? "text-[12px]"
    : "text-[16px]";
  const awayOdds = oddsGame ? formatAmericanOdds(getMoneyline(oddsGame, game.away_team)) : "N/A";
  const homeOdds = oddsGame ? formatAmericanOdds(getMoneyline(oddsGame, game.home_team)) : "N/A";
  const totalLabel = getScoreboardTotalLabel(oddsGame);

  return (
    <div
      className={`relative block w-full px-3 py-3 text-left transition-all active:scale-[0.995] ${
        !isLast ? "border-b border-white/10" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`block w-full text-left ${
          topSignalHighlight
            ? "rounded-[18px] border border-cyan-300/45 bg-cyan-400/[0.08] px-3 py-3 shadow-[0_0_22px_rgba(34,211,238,0.16)]"
            : ""
        }`}
      >
        <div className="grid grid-cols-[1fr_36px_88px_36px_1fr] items-center gap-2">
          <p className="min-w-0 truncate text-right text-[13px] font-semibold text-white">
            {getDisplayName(game.away_team)}
          </p>

          <TeamBadge teamName={game.away_team} sport={sport} />

          <div className="text-center">
            {statusLabel ? (
              <p
                className={`mb-1 text-[10px] font-bold leading-none ${
                  game.completed ? "text-white/45" : live ? "text-red-300" : "text-cyan-300"
                }`}
              >
                {statusLabel}
              </p>
            ) : null}
            <p className={`whitespace-nowrap font-black leading-none text-white ${centerValueClass}`}>
              {centerValue}
            </p>
          </div>

          <TeamBadge teamName={game.home_team} sport={sport} />

          <p className="min-w-0 truncate text-[13px] font-semibold text-white">
            {getDisplayName(game.home_team)}
          </p>
        </div>

        <div className="mx-auto mt-2 grid max-w-[330px] grid-cols-3 gap-3">
          <span className="rounded-full bg-black/55 px-2 py-1 text-center text-[11px] font-semibold text-white/80">
            {awayOdds}
          </span>
          <span className="rounded-full bg-black/55 px-2 py-1 text-center text-[11px] font-semibold text-white/80">
            {totalLabel}
          </span>
          <span className="rounded-full bg-black/55 px-2 py-1 text-center text-[11px] font-semibold text-white/80">
            {homeOdds}
          </span>
        </div>
      </button>

      {topSignalCta ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            topSignalCta.onClick?.();
          }}
          className="mt-2 flex w-full items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[0_0_18px_rgba(34,211,238,0.22)]"
        >
          {topSignalCta.label}
        </button>
      ) : null}
    </div>
  );
}

function formatDisplayedPick(rawPick: string, sport: string) {
  const pick = String(rawPick ?? "").trim();

  if (!pick) return "N/A";
  if (pick === "Signal Detected") return "Pending";

  const totalMatch = pick.match(
    /^(over|under)\s*[\(\s]?([0-9]+(?:\.[0-9]+)?)\)?$/i
  );
  if (totalMatch) {
    const side = totalMatch[1].toLowerCase() === "over" ? "Over" : "Under";
    return `${side} ${totalMatch[2]}`;
  }

  const spreadPlain = pick.match(/^(.*?)(?:\s+)([+-]\d+(?:\.\d+)?)$/);
  if (spreadPlain) {
    const team = spreadPlain[1].trim();
    const line = spreadPlain[2];

    if (sport === "SOCCER" && (line === "-0.5" || line === "+0.5")) {
      return `${team} ML`;
    }

    return `${team} (${line})`;
  }

  const spreadParen = pick.match(/^(.*)\(\s*([+-]?\d+(?:\.\d+)?)\s*\)$/);
  if (spreadParen) {
    const team = spreadParen[1].trim();
    const line = spreadParen[2];

    if (sport === "SOCCER" && (line === "-0.5" || line === "+0.5")) {
      return `${team} ML`;
    }

    const formatted =
      line.startsWith("+") || line.startsWith("-")
        ? line
        : Number(line) > 0
          ? `+${line}`
          : line;

    return `${team} (${formatted})`;
  }

  if (/^(over|under)$/i.test(pick)) {
    return pick;
  }

  if (/\bml\b/i.test(pick)) {
    return pick;
  }

  return `${pick} ML`;
}

function normalizeName(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameMatch(
  game: OddsGame,
  signal: { awayTeam?: string; homeTeam?: string }
) {
  const gameAway = normalizeName(game.away_team);
  const gameHome = normalizeName(game.home_team);
  const signalAway = normalizeName(signal.awayTeam ?? "");
  const signalHome = normalizeName(signal.homeTeam ?? "");

  return gameAway === signalAway && gameHome === signalHome;
}

function findPick(
  game: OddsGame,
  sport: string,
  mlbSignalsDataParam: { games: SignalGame[] }
): SignalGame | null {
  if (sport === "MLB") {
    const direct = mlbSignalsDataParam.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      mlbSignalsDataParam.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    // 🔴 IMPORTANTE: ya NO usamos top5 aquí para evitar errores
    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "NBA") {
    const direct = nbaSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      nbaSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "NHL") {
    const direct = nhlSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      nhlSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "SOCCER") {
    const direct = soccerSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      soccerSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  return null;
}

function findLivePick(
  game: LiveScore,
  sport: SportTab,
  signalsDataParam: { games: SignalGame[] }
): SignalGame | null {
  const signalSource = signalsDataParam?.games ?? [];

  const direct = signalSource.find(
    (g) => String(g.gameId) === String(game.id)
  );

  if (direct) return direct;

  const liveAway = normalizeName(game.away_team ?? "");
  const liveHome = normalizeName(game.home_team ?? "");

  const byExactName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    return liveAway === signalAway && liveHome === signalHome;
  });

  if (byExactName) return byExactName;

  const byFlexibleName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    const sameAway =
      liveAway.includes(signalAway) ||
      signalAway.includes(liveAway);

    const sameHome =
      liveHome.includes(signalHome) ||
      signalHome.includes(liveHome);

    return sameAway && sameHome;
  });

  if (byFlexibleName) return byFlexibleName;

  const byReversedName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    return liveAway === signalHome && liveHome === signalAway;
  });

  return byReversedName ?? null;
}

function getLivePickForSport(
  game: LiveScore,
  sport: SportTab,
  data: {
    mlb: { games: SignalGame[] };
    nba: { games: SignalGame[] };
    nhl: { games: SignalGame[] };
    soccer: { games: SignalGame[] };
  }
) {
  if (sport === "MLB") return findLivePick(game, sport, data.mlb);
  if (sport === "NBA") return findLivePick(game, sport, data.nba);
  if (sport === "NHL") return findLivePick(game, sport, data.nhl);
  if (sport === "SOCCER") return findLivePick(game, sport, data.soccer);
  return null;
}

function formatInsightOdds(value: unknown) {
  const odds = Number(value);
  if (!Number.isFinite(odds)) return "available odds";

  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getInsightImpliedProbability(value: unknown) {
  const odds = Number(value);
  if (!Number.isFinite(odds)) return null;

  const probability =
    odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

  return Number((probability * 100).toFixed(1));
}

function getInsightConfidenceLabel(value: unknown) {
  const odds = Number(value);
  if (!Number.isFinite(odds)) return "Qualified";

  if (odds <= -125) return "High";
  if (odds <= -105) return "Strong";
  return "Value";
}

function buildSignalInsight(
  game: LiveScore,
  sport: SportTab,
  pickData: SignalGame
): SignalInsight {
  const pick = formatDisplayedPick(pickData.pick, sport);
  if (pickData.pick === "Signal Detected" || pick === "Signal Detected ML") {
    return {
      sport,
      awayTeam: getDisplayName(game.away_team),
      homeTeam: getDisplayName(game.home_team),
      pick: "Pending",
      analysisSummary: "Atlas found a possible opportunity in the morning scan and is monitoring it internally.",
      confidenceLabel: "Monitoring",
      edgeLabel: "Hidden",
      riskNote: "Signals Detected are not official picks. Picks are shown to subscribers only after Atlas Core validation.",
      modelFactors: [
        "Detected in the official 7:00 AM ET Atlas Core morning scan.",
        "No pick, market, edge, confidence or conviction is shown for free users.",
        "Atlas continues internal validation throughout the day.",
      ],
    };
  }
  const market = String((pickData as any).market ?? "").toLowerCase();
  const marketLabel =
    market === "spreads"
      ? "spread"
      : market === "totals"
      ? "total"
      : "moneyline";
  const oddsText = formatInsightOdds(pickData.odds);
  const implied = getInsightImpliedProbability(pickData.odds);
  const lineText =
    pickData.line !== null && pickData.line !== undefined && market !== "h2h"
      ? ` at ${pickData.line}`
      : "";
  const confidenceFallback = getInsightConfidenceLabel(pickData.odds);
  const analysisSummary =
    pickData.analysisSummary ??
    `Atlas selected ${pick} because the ${marketLabel}${lineText} qualified at ${oddsText}${
      implied !== null ? ` with implied probability near ${implied}%` : ""
    }. Among available plays for this matchup, Atlas rated this market as the best blend of price safety, model confidence and practical value before premium Top 5 filtering.`;

  return {
    sport,
    awayTeam: getDisplayName(game.away_team),
    homeTeam: getDisplayName(game.home_team),
    pick,
    analysisSummary,
    confidenceLabel: pickData.confidenceLabel ?? confidenceFallback,
    edgeLabel: pickData.edgeLabel ?? (Number(pickData.odds) > 0 ? "Plus-money value" : "Model edge"),
    riskNote:
      pickData.riskNote ??
      "Signals are model-driven probabilities, not guarantees. Line movement, lineup news and late market shifts can change risk before start time.",
    modelFactors:
      Array.isArray(pickData.modelFactors) && pickData.modelFactors.length > 0
        ? pickData.modelFactors
        : [
            `Pick qualified inside Atlas odds range at ${oddsText}.`,
            `${marketLabel.charAt(0).toUpperCase()}${marketLabel.slice(1)} market passed Atlas safety filters.`,
            implied !== null
              ? `Implied probability checked in near ${implied}% before signal approval.`
              : "Implied probability passed model screening.",
            pickData.line !== null && pickData.line !== undefined
              ? `Line ${pickData.line} passed Atlas line validation.`
              : "No line adjustment was required for this pick.",
            "Signal ranked above other available plays for this matchup.",
          ],
  };
}

function isTop5LiveGame(
  game: LiveScore,
  top5: Top5Entry[]
) {
  return top5.some((p) => {
    return (
      String((p as any).gameId) === String(game.id) ||
      (
        normalizeName(p.awayTeam ?? "") === normalizeName(game.away_team ?? "") &&
        normalizeName(p.homeTeam ?? "") === normalizeName(game.home_team ?? "")
      )
    );
  });
}

function getLivePickResult(game: LiveScore, pickData: SignalGame | null) {
  if (!pickData) return null;
  if (!game.completed) return "PENDING";

  const awayScore = Number(
    game.scores?.find((s) => s.name === game.away_team)?.score ?? NaN
  );

  const homeScore = Number(
    game.scores?.find((s) => s.name === game.home_team)?.score ?? NaN
  );

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const pickRaw = String(pickData.pick ?? "").trim();
  if (!pickRaw) return "PENDING";

  const pick = pickRaw.toLowerCase();
  const pickNorm = normalizeName(pickRaw);

  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);

  const awayLast = getLastWord(game.away_team);
  const homeLast = getLastWord(game.home_team);

  // TOTALS: Over 8.5 / Under 6 / O 8.5 / U 6
  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);
    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // SPREADS: Team +1.5 / Team (-1.5)
  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  // MONEYLINE: Team ML / Team solo / último nombre
  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

function getLastWord(value: string) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function isNameClose(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (!na || !nb) return false;

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const lastA = getLastWord(a);
  const lastB = getLastWord(b);

  if (lastA && lastB && lastA === lastB) return true;

  return false;
}

function findScoreGameForPick(
  pick: { awayTeam?: string; homeTeam?: string },
  scoreGames: LiveScore[]
) {
  const pickAway = pick.awayTeam ?? "";
  const pickHome = pick.homeTeam ?? "";

  // 1. match exacto o invertido
  const exactMatch =
    scoreGames.find((game) => {
      return (
        (normalizeName(pickAway) === normalizeName(game.away_team) &&
          normalizeName(pickHome) === normalizeName(game.home_team)) ||
        (normalizeName(pickAway) === normalizeName(game.home_team) &&
          normalizeName(pickHome) === normalizeName(game.away_team))
      );
    }) || null;

  if (exactMatch) return exactMatch;

  // 2. match flexible o invertido
  const flexibleMatch =
    scoreGames.find((game) => {
      const normalMatch =
        isNameClose(pickAway, game.away_team) &&
        isNameClose(pickHome, game.home_team);

      const reversedMatch =
        isNameClose(pickAway, game.home_team) &&
        isNameClose(pickHome, game.away_team);

      return normalMatch || reversedMatch;
    }) || null;

  return flexibleMatch;
}

function gradePickFromScoreGame(
  game: LiveScore | null,
  rawPick: string
): "WON" | "LOST" | "PUSH" | "PENDING" {
  if (!game) return "PENDING";
  if (!game.completed) return "PENDING";

  const awayScore = Number(
    game.scores?.find((s) => s.name === game.away_team)?.score ?? NaN
  );
  const homeScore = Number(
    game.scores?.find((s) => s.name === game.home_team)?.score ?? NaN
  );

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const pickRaw = String(rawPick ?? "").trim();
  if (!pickRaw) return "PENDING";

  const pick = pickRaw.toLowerCase();
  const pickNorm = normalizeName(pickRaw);
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);
  const awayLast = getLastWord(game.away_team);
  const homeLast = getLastWord(game.home_team);

  // =========================
  // 1. TOTALS
  // Soporta:
  // Over 5.5
  // Under 219
  // O 5.5
  // U 219
  // Over (5.5)
  // Under (219)
  // =========================
  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);

    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // =========================
  // 2. SPREADS
  // Soporta:
  // Team +1.5
  // Team -3
  // Team (+1.5)
  // Team (-3)
  // =========================
  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  // =========================
  // 3. MONEYLINE
  // Soporta:
  // Team ML
  // Team
  // solo apellido / último nombre del equipo
  // =========================
  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

function getSubsPickResult(
  pick: { awayTeam?: string; homeTeam?: string; pick: string },
  scoreGames: LiveScore[]
) {
  const game = findScoreGameForPick(pick, scoreGames);
  return gradePickFromScoreGame(game, pick.pick);
}

function buildRecordStats(
  picks: Array<{ awayTeam?: string; homeTeam?: string; pick: string; isTopSignal?: boolean }>,
  scoreGames: LiveScore[]
) {
  const graded = picks.map((pick) => getSubsPickResult(pick, scoreGames));

  const wins = graded.filter((r) => r === "WON").length;
  const losses = graded.filter((r) => r === "LOST").length;
  const pushes = graded.filter((r) => r === "PUSH").length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  return {
    wins,
    losses,
    pushes,
    decided,
    winRate,
  };
}

function buildHistoryRecordStats(history: any[]) {
  const wins = history.filter((item) => item.result === "WON").length;
  const losses = history.filter((item) => item.result === "LOST").length;
  const pushes = history.filter((item) => item.result === "PUSH").length;

  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  return {
    wins,
    losses,
    pushes,
    decided,
    winRate,
  };
}

function getStatusStyles(status?: string) {
  const s = String(status ?? "PENDING").toUpperCase();

  if (s === "CONFIRMED") {
    return "bg-green-500/15 text-green-300 border-green-400/30";
  }

  if (s === "REMOVED") {
    return "bg-red-500/15 text-red-300 border-red-400/30";
  }

  if (s === "DOWNGRADED") {
    return "bg-yellow-500/15 text-yellow-300 border-yellow-400/30";
  }

  return "bg-white/10 text-white/60 border-white/15";
}

function formatStatusLabel(status?: string) {
  const s = String(status ?? "PENDING").toUpperCase();

  if (s === "CONFIRMED") return "CONFIRMED ✅";
  if (s === "REMOVED") return "REMOVED ❌";
  if (s === "DOWNGRADED") return "DOWNGRADED ⬇️";

  return s;
}

function getTop5BySport(
  sport: SportTab,
  mlbTop5DataParam: { top5: Top5Entry[] },
  nbaTop5DataParam: { top5: Top5Entry[] },
  nhlTop5DataParam: { top5: Top5Entry[] },
  soccerTop5DataParam: { top5: Top5Entry[] }
): Top5Entry[] {
  if (sport === "MLB") return mlbTop5DataParam.top5 ?? [];
  if (sport === "NBA") return nbaTop5DataParam.top5 ?? [];
  if (sport === "NHL") return nhlTop5DataParam.top5 ?? [];
  if (sport === "SOCCER") return soccerTop5DataParam.top5 ?? [];

  return [];
}

function sortPicksByStartTime<T extends Top5Entry>(picks: T[]) {
  return [...picks].sort((a, b) => {
    const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;

    if (aTime !== bTime) return aTime - bTime;

    return Number(a.rank ?? 999) - Number(b.rank ?? 999);
  });
}

function getPickValuePriority(pick: Top5Entry) {
  const rankScore = Number.isFinite(Number(pick.rank))
    ? 1000 - Number(pick.rank) * 100
    : 0;
  const internalScore = Number(pick.internalScore);
  const confidence = Number(pick.confidence);

  return (
    rankScore +
    (Number.isFinite(internalScore) ? internalScore : 0) +
    (Number.isFinite(confidence) ? confidence : 0)
  );
}

function sortPicksByAtlasValue<T extends Top5Entry>(picks: T[]) {
  return [...picks].sort((a, b) => {
    const valueDiff = getPickValuePriority(b) - getPickValuePriority(a);
    if (valueDiff !== 0) return valueDiff;

    const rankDiff = Number(a.rank ?? 999) - Number(b.rank ?? 999);
    if (rankDiff !== 0) return rankDiff;

    const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function getSubscriptionEligiblePicks(picks: Top5Entry[]) {
  return picks.filter((pick) => pick.isTopSignal !== true && pick.rank !== 1);
}

function labelSubscriptionPicks(picks: Top5Entry[], ranked: boolean) {
  return picks.slice(0, 3).map((pick, index) => ({
    ...pick,
    label: ranked ? `Ranked Top 3 #${index + 1}` : "Top 3",
  }));
}

function mapHistoryRowToTop5Entry(row: any): Top5Entry {
  return {
    gameId: row.game_id ?? row.gameId ?? null,
    awayTeam: row.away_team ?? row.awayTeam ?? "",
    homeTeam: row.home_team ?? row.homeTeam ?? "",
    pick: row.pick ?? "",
    market: row.market ?? null,
    line: row.line ?? null,
    odds: row.odds ?? null,
    status: row.result ?? row.status ?? "PENDING",
    rank: row.rank ?? null,
    isTopSignal: row.is_top_signal ?? row.isTopSignal ?? row.rank === 1,
    confidence: row.confidence ?? null,
    internalScore: row.internal_score ?? row.internalScore ?? null,
    edge: row.edge ?? null,
    analysisSummary: row.analysis_summary ?? row.analysisSummary ?? null,
    confidenceLabel: row.confidence_label ?? row.confidenceLabel ?? null,
    edgeLabel: row.edge_label ?? row.edgeLabel ?? null,
    riskNote: row.risk_note ?? row.riskNote ?? null,
    modelFactors: row.model_factors ?? row.modelFactors ?? null,
    startTime: row.start_time ?? row.startTime ?? null,
  } as Top5Entry;
}

function getTop5HistoryEndpointForSport(sport: AtlasPlanSport) {
  if (sport === "MLB") return "/api/top5-history-live/mlb";
  if (sport === "NBA") return "/api/top5-history-live/nba";
  if (sport === "NHL") return "/api/top5-history-live/nhl";
  if (sport === "SOCCER") return "/api/top5-history-live/soccer";
  return "";
}

function getSnapshotLookupDates(daysBack = 21) {
  const dates: string[] = [];
  const baseDate = new Date();

  for (let offset = 1; offset <= daysBack; offset += 1) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - offset);
    dates.push(date.toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  }

  return dates;
}

async function loadHistoricalSnapshotSources(): Promise<{ sources: AtlasPackageSources; snapshotDate: string | null }> {
  for (const date of getSnapshotLookupDates()) {
    const top5BySport = await Promise.all(
      snapshotLookupSports.map(async (sport) => {
        const endpoint = getTop5HistoryEndpointForSport(sport);
        if (!endpoint) return { sport, top5: [] as Top5Entry[] };

        try {
          const response = await fetch(`${endpoint}?date=${encodeURIComponent(date)}`, { cache: "no-store" });
          if (!response.ok) return { sport, top5: [] as Top5Entry[] };

          const data = await response.json();
          const top5 = data?.success && Array.isArray(data.history)
            ? sortPicksByStartTime(data.history.map(mapHistoryRowToTop5Entry))
            : [];

          return { sport, top5 };
        } catch {
          return { sport, top5: [] as Top5Entry[] };
        }
      }),
    );

    const sources = buildBankrollAtlasSources({
      mlbSignals: [],
      nbaSignals: [],
      nhlSignals: [],
      soccerSignals: [],
      mlbTop5: top5BySport.find((item) => item.sport === "MLB")?.top5 ?? [],
      nbaTop5: top5BySport.find((item) => item.sport === "NBA")?.top5 ?? [],
      nhlTop5: top5BySport.find((item) => item.sport === "NHL")?.top5 ?? [],
      soccerTop5: top5BySport.find((item) => item.sport === "SOCCER")?.top5 ?? [],
    });

    if (atlasSourcesToTrackingPicks(sources).length > 0) {
      return { sources, snapshotDate: date };
    }
  }

  return {
    sources: {
      signals: [],
      top3: [],
      top5: [],
    },
    snapshotDate: null,
  };
}

function getSubPicksForUser(
  userAccess: UserAccess,
  selectedSport: SportTab,
  mlbTop5DataParam: { top5: Top5Entry[] },
  nbaTop5DataParam: { top5: Top5Entry[] },
  nhlTop5DataParam: { top5: Top5Entry[] },
  soccerTop5DataParam: { top5: Top5Entry[] }
) {
  if (!hasSportAccess(userAccess, selectedSport)) return [];

  const top5 = getTop5BySport(
    selectedSport,
    mlbTop5DataParam,
    nbaTop5DataParam,
    nhlTop5DataParam,
    soccerTop5DataParam
  );
  const subscriptionPicks = getSubscriptionEligiblePicks(top5);

  if (userAccess.plan === "exclusive") {
    return labelSubscriptionPicks(sortPicksByStartTime(subscriptionPicks), false);
  }

  if (userAccess.plan === "premium") {
    return labelSubscriptionPicks(sortPicksByAtlasValue(subscriptionPicks), true);
  }

  if (userAccess.plan === "elite" || userAccess.plan === "unlimited") {
    return labelSubscriptionPicks(sortPicksByAtlasValue(subscriptionPicks), true);
  }

  if (userAccess.plan === "admin") {
    return top5.map((pick) => ({
      ...pick,
      label:
        pick.isTopSignal === true || pick.rank === 1
          ? `Top Signal #${pick.rank ?? 1}`
          : `Top 5 #${pick.rank ?? ""}`,
    }));
  }

  return [];
}

function hasSportAccess(userAccess: UserAccess, sport: SportTab) {
  if (hasAllSportsAccessPlan(userAccess.plan)) return true;
  return userAccess.sports.includes(sport);
}

function canViewTopTab(userAccess: UserAccess) {
  return (
    userAccess.plan === "admin" ||
    userAccess.unlocks.topPlay ||
    userAccess.unlocks.topSignals.length > 0
  );
}

function canViewStatsAndHistory(userAccess: UserAccess) {
  return (
    userAccess.plan === "premium" ||
    userAccess.plan === "elite" || userAccess.plan === "unlimited" ||
    userAccess.plan === "admin"
  );
}

function canViewTop5History(userAccess: UserAccess) {
  return (
    userAccess.plan === "exclusive" ||
    userAccess.plan === "premium" ||
    userAccess.plan === "elite" || userAccess.plan === "unlimited" ||
    userAccess.plan === "admin"
  );
}

function isSeasonClosedSport(sport: SportTab) {
  return sport === "NBA" || sport === "NHL";
}

function isUnavailableSport(sport: SportTab) {
  return sport === "NFL" || isSeasonClosedSport(sport);
}

function canViewPickInSubs(
  userAccess: UserAccess,
  sport: SportTab,
  pickData: SignalGame | null
) {
  if (!pickData) return false;
  if (!hasSportAccess(userAccess, sport)) return false;

  if (userAccess.plan === "exclusive") {
    return !!pickData.isTop5 && !pickData.isTopSignal;
  }

  if (userAccess.plan === "premium") {
    return !!pickData.isTop5 && !pickData.isTopSignal;
  }

  if (userAccess.plan === "elite" || userAccess.plan === "unlimited") {
    return !!pickData.isTop5 && !pickData.isTopSignal;
  }

  if (userAccess.plan === "admin") {
    return true;
  }

  return false;
}

function getSubsBadgeLabel(
  userAccess: UserAccess,
  pickData: SignalGame
) {
  if (userAccess.plan === "exclusive" && pickData.isTop5 && !pickData.isTopSignal) {
    return "Top 3";
  }

  if (
    userAccess.plan === "premium" ||
    userAccess.plan === "elite" || userAccess.plan === "unlimited"
  ) {
    if (pickData.isTop5) {
      return `Ranked Top 3 #${pickData.topRank ?? ""}`;
    }
  }

  if (userAccess.plan === "admin") {
    if (pickData.isTopSignal) {
      return `Top Signal #${pickData.topRank ?? 1}`;
    }

    if (pickData.isTop5) {
      return `Top 5 #${pickData.topRank ?? ""}`;
    }
  }

  return null;
}

type PackPlan = {
  plan: "exclusive" | "premium" | "unlimited";
  name: string;
  price: string;
  icon: string;
  tone: "bronze" | "blue" | "purple";
  badge?: string;
  description: string;
  included: string[];
  locked?: string[];
  cta: string;
};

const subscriptionPackPlans: PackPlan[] = [
  {
    plan: "exclusive",
    name: "EXCLUSIVE",
    price: "$34.99",
    icon: "★",
    tone: "bronze",
    description: "Top 3 ranked Signals Detected across all available sports.",
    included: [
      "All Available Sports",
      "Top 3 Signals Detected",
      "Ranked Signals",
      "Live Status Updates",
    ],
    locked: ["Top Signal sold separately"],
    cta: "Choose Exclusive",
  },
  {
    plan: "premium",
    name: "PREMIUM",
    price: "$59.99",
    icon: "◎",
    tone: "blue",
    badge: "Recommended",
    description: "Up to 5 official ranked Atlas Signals for one selected sport.",
    included: [
      "Choose Your Sport",
      "Up to 5 Official Signals",
      "Ranked Signals",
      "Live Status Updates",
    ],
    locked: ["Top Signal sold separately"],
    cta: "Choose Premium",
  },
  {
    plan: "unlimited",
    name: "ATLAS UNLIMITED",
    price: "$99.99",
    icon: "◆",
    tone: "purple",
    description: "Up to 5 official ranked Atlas Signals for every available sport.",
    included: [
      "All Available Sports",
      "Up to 5 Per Sport",
      "Ranked Signals",
      "Auto-Includes New Sports",
    ],
    locked: ["Top Signal sold separately"],
    cta: "Choose Unlimited",
  },
];

const packToneStyles = {
  bronze: {
    card: "border-orange-300/35 bg-orange-500/[0.045] shadow-[0_0_22px_rgba(251,146,60,0.10)]",
    icon: "border-orange-300/60 bg-orange-400/10 text-orange-200 shadow-[0_0_16px_rgba(251,146,60,0.22)]",
    title: "text-orange-300",
    check: "border-orange-300/70 text-orange-300",
    button: "bg-gradient-to-r from-orange-500 to-orange-300 text-white shadow-[0_0_16px_rgba(251,146,60,0.22)]",
  },
  blue: {
    card: "border-sky-300/35 bg-sky-500/[0.045] shadow-[0_0_22px_rgba(56,189,248,0.10)]",
    icon: "border-sky-300/60 bg-sky-400/10 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.22)]",
    title: "text-sky-300",
    check: "border-sky-300/70 text-sky-300",
    button: "bg-gradient-to-r from-sky-600 to-cyan-400 text-white shadow-[0_0_16px_rgba(56,189,248,0.22)]",
  },
  purple: {
    card: "border-purple-300/35 bg-purple-500/[0.045] shadow-[0_0_22px_rgba(192,132,252,0.12)]",
    icon: "border-purple-300/65 bg-purple-400/10 text-purple-200 shadow-[0_0_16px_rgba(192,132,252,0.24)]",
    title: "text-purple-300",
    check: "border-purple-300/70 text-purple-300",
    button: "bg-gradient-to-r from-purple-700 to-fuchsia-500 text-white shadow-[0_0_16px_rgba(192,132,252,0.24)]",
  },
};

function PackIcon({ plan }: { plan: PackPlan["plan"] }) {
  if (plan === "exclusive") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="h-[22px] w-[22px] drop-shadow-[0_0_8px_currentColor]">
        <path
          fill="currentColor"
          d="M32 7.5 39.5 23l17.1 2.5-12.4 12.1 2.9 17-15.1-8-15.1 8 2.9-17L7.4 25.5 24.5 23 32 7.5Z"
        />
      </svg>
    );
  }

  if (plan === "premium") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="h-[24px] w-[24px] drop-shadow-[0_0_8px_currentColor]">
        <path
          fill="currentColor"
          d="M23.2 38.6 17.8 57l10.5-5.7 5.8 10 4.5-17.4a19.4 19.4 0 0 1-15.4-5.3Z"
          opacity=".72"
        />
        <path
          fill="currentColor"
          d="M40.8 38.6 46.2 57l-10.5-5.7-5.8 10-4.5-17.4a19.4 19.4 0 0 0 15.4-5.3Z"
          opacity=".82"
        />
        <circle cx="32" cy="25" r="17" fill="none" stroke="currentColor" strokeWidth="7" />
        <circle cx="32" cy="25" r="7.5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-[24px] w-[24px] drop-shadow-[0_0_8px_currentColor]">
      <path
        fill="currentColor"
        d="M12 19 22 8h20l10 11-20 37L12 19Z"
      />
      <path
        fill="rgba(5,8,22,.55)"
        d="M22 8 27 19H12L22 8Zm20 0-5 11h15L42 8ZM27 19h10l-5 37-5-37Z"
      />
      <path
        fill="rgba(255,255,255,.28)"
        d="M27 19 22 8h20l-5 11H27Zm-15 0h15L32 56 12 19Zm25 0h15L32 56l5-37Z"
      />
    </svg>
  );
}

function PackCard({
  pack,
  onChoose,
  disabled,
  compact = false,
}: {
  pack: PackPlan;
  onChoose: (plan: PackPlan["plan"]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const styles = packToneStyles[pack.tone];

  return (
    <article
      className={`flex min-w-0 flex-col border text-left ${styles.card} ${
        compact
          ? "min-h-[226px] rounded-[17px] p-2"
          : "min-h-[258px] rounded-[20px] p-2.5"
      }`}
    >
      <div className="flex justify-center">
        <div
          className={`flex items-center justify-center rounded-full border font-black ${styles.icon} ${
            compact ? "h-7 w-7 text-[15px]" : "h-8 w-8 text-[17px]"
          }`}
        >
          <PackIcon plan={pack.plan} />
        </div>
      </div>

      <p
        className={`whitespace-nowrap text-center font-black uppercase ${styles.title} ${
          compact
            ? "mt-1 text-[8.5px] tracking-[0.13em]"
            : "mt-1.5 text-[9.5px] tracking-[0.16em]"
        }`}
      >
        {pack.name}
      </p>

      {pack.badge ? (
        <div className="mt-1 flex justify-center">
          <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[6.5px] font-black uppercase tracking-[0.08em] text-black">
            {pack.badge}
          </span>
        </div>
      ) : null}

      <div className={compact ? "mt-1.5" : "mt-2"}>
        <span className={`${compact ? "text-[15px]" : "text-[17px]"} font-black leading-none text-white`}>
          {pack.price}
        </span>
        <span className={`${compact ? "ml-0.5 text-[7px]" : "ml-1 text-[8px]"} font-semibold text-white/58`}>
          / month
        </span>
      </div>

      <p className={`mt-1 text-white/68 ${
        compact ? "min-h-[24px] text-[7.2px] leading-[1.25]" : "min-h-[28px] text-[8px] leading-[1.3]"
      }`}>
        {pack.description}
      </p>

      <div className={`${compact ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"}`}>
        {pack.included.map((item) => (
          <div key={item} className={`${compact ? "grid-cols-[10px_1fr] gap-1" : "grid-cols-[12px_1fr] gap-1.5"} grid items-center`}>
            <span
              className={`flex items-center justify-center rounded-full border leading-none ${styles.check} ${
                compact ? "h-2.5 w-2.5 text-[6px]" : "h-3 w-3 text-[7px]"
              }`}
            >
              ✓
            </span>
            <span className={`${compact ? "text-[6.8px]" : "text-[7.5px]"} min-w-0 self-center leading-none text-white/70`}>
              {item}
            </span>
          </div>
        ))}

        {pack.locked?.map((item) => (
          <div key={item} className={`${compact ? "grid-cols-[10px_1fr] gap-1" : "grid-cols-[12px_1fr] gap-1.5"} grid items-center`}>
            <span className={`${compact ? "h-2.5 w-2.5 text-[7px]" : "h-3 w-3 text-[8px]"} flex items-center justify-center leading-none text-white/35`}>
              🔒
            </span>
            <span className={`${compact ? "text-[6.8px]" : "text-[7.5px]"} min-w-0 self-center leading-none text-white/42`}>
              {item}
            </span>
          </div>
        ))}
      </div>

      <div className={`${compact ? "pt-1.5" : "pt-2"} mt-auto`}>
        <button
          type="button"
          onClick={() => onChoose(pack.plan)}
          disabled={disabled}
          className={`w-full whitespace-nowrap rounded-[10px] px-1 font-black uppercase tracking-[0.10em] transition-all disabled:cursor-not-allowed disabled:opacity-60 ${styles.button} ${
            compact ? "py-1.5 text-[6.5px]" : "py-2 text-[7px]"
          }`}
        >
          {pack.cta}
        </button>
      </div>
    </article>
  );
}

function CompactTopPlayCard({
  onChoose,
  disabled,
}: {
  onChoose: () => void;
  disabled?: boolean;
}) {
  return (
    <article className="rounded-[20px] border border-cyan-300/30 bg-cyan-400/[0.055] p-3 shadow-[0_0_24px_rgba(34,211,238,0.10)]">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-cyan-300/45 bg-cyan-300/10 text-[28px] font-black text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.22)]">
          ϟ
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-cyan-200">
              Best of all sports
            </span>
          </div>
          <div className="mt-1 flex items-end gap-2">
            <h3 className="text-[18px] font-black uppercase tracking-[0.14em] text-white">
              Top Play
            </h3>
            <p className="pb-0.5 text-[12px] font-semibold text-white/55">
              $149.99 / day
            </p>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-white/62">
            The strongest Atlas pick of the day across every available sport.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[8.5px] leading-3 text-white/70">
        {["#1 daily pick", "Highest confidence", "Expert analysis"].map((item) => (
          <div key={item} className="flex items-center gap-1">
            <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-cyan-300/70 text-[7px] text-cyan-300">
              ✓
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center rounded-[13px] bg-gradient-to-r from-cyan-400 to-cyan-300 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(34,211,238,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Get Top Play
      </button>
    </article>
  );
}

function PackSportSelector({
  value,
  onChange,
  sports,
}: {
  value: CheckoutSport;
  onChange: (sport: CheckoutSport) => void;
  sports: CheckoutSport[];
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">
          Choose sport
        </p>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/42">
          Required for pack
        </p>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {sports.map((sport) => {
          const active = value === sport;

          return (
            <button
              key={`pack-sport-${sport}`}
              type="button"
              onClick={() => onChange(sport)}
              className={`rounded-[11px] border px-1 py-2 text-[8px] font-black uppercase tracking-[0.06em] transition-all ${
                active
                  ? "border-cyan-300 bg-cyan-400 text-black shadow-[0_0_14px_rgba(34,211,238,0.22)]"
                  : "border-white/10 bg-white/[0.04] text-white/55"
              }`}
            >
              {sport}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StripeTrustBar() {
  return (
    <div className="mt-4 rounded-[18px] border border-cyan-400/15 bg-cyan-400/[0.045] p-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-[16px] text-cyan-300">
          ♢
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-cyan-300">
            Secure • Reliable • Transparent
          </p>
          <p className="mt-0.5 text-[8.5px] leading-3 text-white/58">
            Your payments are processed securely by Stripe. Cancel anytime. No hidden fees.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[16px] font-black tracking-tight text-white">
            stripe
          </p>
          <span className="mt-0.5 inline-flex whitespace-nowrap rounded-full border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[7px] font-bold text-cyan-200">
            Secure Checkout
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-[9px] font-semibold text-cyan-300/75">
        Trusted by serious bettors. Built for winners.
      </p>
    </div>
  );
}

type DailyProductCard = {
  product: CheckoutProduct;
  badge: string;
  name: string;
  title: string;
  price: string;
  period: string;
  tone: "cyan" | "emerald";
  features: string[];
  cta: string;
};

const dailyProductCards: DailyProductCard[] = [
  {
    product: "top_play",
    badge: "Best of all sports",
    name: "TOP PLAY",
    title: "Best pick across all sports",
    price: "$149.99",
    period: "day",
    tone: "cyan",
    features: [
      "The #1 pick of the day across all sports",
      "Highest confidence rating",
      "Expert analysis & reasoning",
      "Daily pick delivered",
      "Maximize your edge",
    ],
    cta: "Get Top Play",
  },
  {
    product: "top_signal_mlb",
    badge: "By sport",
    name: "TOP SIGNAL",
    title: "Best pick for your favorite sport",
    price: "$24.99",
    period: "day",
    tone: "emerald",
    features: [
      "Choose your sport (MLB, NBA, NHL, SOCCER, NFL)",
      "Top signal for that sport",
      "Expert analysis & reasoning",
      "Daily pick delivered",
      "Focused. Accurate. Profitable.",
    ],
    cta: "Get Top Signal",
  },
];

function DailyProductIcon({ tone }: { tone: DailyProductCard["tone"] }) {
  if (tone === "cyan") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className="h-8 w-8 drop-shadow-[0_0_12px_currentColor]">
        <path
          fill="currentColor"
          d="M37.8 4 12 36.8h18.2L25.8 60 52 26.8H33.6L37.8 4Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-8 w-8 drop-shadow-[0_0_12px_currentColor]">
      <circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="32" cy="32" r="6" fill="currentColor" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="4" d="M32 7v12M32 45v12M7 32h12M45 32h12" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" d="M32 2v8M32 54v8M2 32h8M54 32h8" opacity=".7" />
    </svg>
  );
}

function DailyProductCardView({
  card,
  onChoose,
}: {
  card: DailyProductCard;
  onChoose: (product: CheckoutProduct) => void;
}) {
  const emerald = card.tone === "emerald";

  return (
    <article
      className={`rounded-[24px] border p-4 ${
        emerald
          ? "border-emerald-300/35 bg-emerald-400/[0.045] shadow-[0_0_26px_rgba(52,211,153,0.10)]"
          : "border-cyan-300/35 bg-cyan-400/[0.045] shadow-[0_0_26px_rgba(34,211,238,0.10)]"
      }`}
    >
      <div className="mb-3 flex justify-center">
        <span
          className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.10em] ${
            emerald
              ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
              : "border-cyan-300/35 bg-cyan-400/10 text-cyan-200"
          }`}
        >
          {card.badge}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-[12px] border ${
            emerald
              ? "border-emerald-300/45 bg-emerald-400/10 text-emerald-200"
              : "border-cyan-300/45 bg-cyan-400/10 text-cyan-200"
          }`}
        >
          <DailyProductIcon tone={card.tone} />
        </div>

        <div className="min-w-0">
          <h2 className="text-[18px] font-black uppercase tracking-[0.16em] text-white">
            {card.name}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-white/65">
            {card.title}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <span
          className={`text-[30px] font-black leading-none ${
            emerald ? "text-emerald-300" : "text-cyan-300"
          }`}
        >
          {card.price}
        </span>
        <span className="ml-2 text-[14px] font-semibold text-white/55">
          / {card.period}
        </span>
      </div>

      <div
        className={`my-4 h-px ${
          emerald ? "bg-emerald-300/25" : "bg-cyan-300/25"
        }`}
      />

      <div className="space-y-2">
        {card.features.map((feature) => (
          <div key={feature} className="grid grid-cols-[18px_1fr] items-start gap-2">
            <span
              className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border text-[10px] ${
                emerald
                  ? "border-emerald-300/80 text-emerald-300"
                  : "border-cyan-300/80 text-cyan-300"
              }`}
            >
              ✓
            </span>
            <span className="text-[13px] leading-5 text-white/72">
              {feature}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChoose(card.product)}
        className={`mt-5 flex w-full items-center justify-between rounded-[14px] px-5 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-slate-950 ${
          emerald
            ? "bg-gradient-to-r from-emerald-300 to-teal-400 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
            : "bg-gradient-to-r from-cyan-300 to-cyan-500 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
        }`}
      >
        <span>{card.cta}</span>
        <span className="text-[20px] leading-none">›</span>
      </button>
    </article>
  );
}

function getTopSignalCheckoutProduct(sport: CheckoutSport): CheckoutProduct {
  if (sport === "NBA") return "top_signal_nba";
  if (sport === "NHL") return "top_signal_nhl";
  if (sport === "SOCCER") return "top_signal_soccer";
  if (sport === "NFL") return "top_signal_nfl";

  return "top_signal_mlb";
}

function getPrecisionTone(status?: PrecisionLifecycleStatus) {
  if (status === "available_now") return "border-emerald-300/35 bg-emerald-400/[0.06] text-emerald-200";
  if (status === "locked") return "border-white/12 bg-white/[0.04] text-white/55";
  if (status === "no_play") return "border-red-300/25 bg-red-500/[0.06] text-red-200";
  if (status === "final_review") return "border-yellow-300/30 bg-yellow-400/[0.06] text-yellow-200";
  if (status === "strong_candidate") return "border-cyan-300/35 bg-cyan-400/[0.06] text-cyan-200";

  return "border-cyan-300/25 bg-cyan-400/[0.04] text-cyan-200";
}

function getPrecisionStatusCopy(status?: PrecisionLifecycleStatus) {
  if (status === "available_now") return "Available now";
  if (status === "locked") return "Locked";
  if (status === "no_play") return "No play";
  if (status === "final_review") return "Final review";
  if (status === "strong_candidate") return "Strong candidate";
  if (status === "validating") return "Validating";

  return "Scanning";
}

function formatPrecisionCountdown(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  if (minutes <= 0) return "Ready";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours <= 0) return `${mins}m`;

  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function getPrecisionActionLabel(
  product: "top_signal" | "top_play",
  data: PrecisionPublicResponse | null
) {
  if (!data) return "Scanning";
  if (data.noPlayReason || data.status === "no_play") return "No Play Today";
  if (data.canRevealPick && data.pick) return "Unlocked";
  if (data.availableForPurchase) {
    return product === "top_play" ? "Unlock Top Play" : "Unlock Top Signal";
  }
  if (data.status === "locked") return "Locked";

  return "Opens Soon";
}

function getPrecisionProgress(data: PrecisionPublicResponse | null, loading: boolean) {
  return Math.max(0, Math.min(100, Number(loading ? 18 : data?.progressPercent ?? 0)));
}

function getPrecisionAccent(status?: PrecisionLifecycleStatus) {
  if (status === "available_now") return "emerald";
  if (status === "strong_candidate") return "green";
  if (status === "final_review") return "yellow";
  if (status === "no_play") return "red";
  if (status === "locked") return "slate";
  if (status === "scanning") return "purple";

  return "cyan";
}

function getPrecisionAccentClasses(
  accent: "cyan" | "emerald" | "green" | "yellow" | "purple" | "red" | "slate"
) {
  if (accent === "emerald") {
    return {
      border: "border-emerald-300/45",
      text: "text-emerald-300",
      bg: "bg-emerald-400/10",
      bar: "from-emerald-300 to-teal-400",
      glow: "shadow-[0_0_22px_rgba(52,211,153,0.15)]",
    };
  }

  if (accent === "green") {
    return {
      border: "border-lime-300/45",
      text: "text-lime-300",
      bg: "bg-lime-400/10",
      bar: "from-lime-300 to-green-400",
      glow: "shadow-[0_0_22px_rgba(132,204,22,0.15)]",
    };
  }

  if (accent === "yellow") {
    return {
      border: "border-yellow-300/50",
      text: "text-yellow-300",
      bg: "bg-yellow-400/10",
      bar: "from-yellow-300 to-amber-400",
      glow: "shadow-[0_0_22px_rgba(250,204,21,0.16)]",
    };
  }

  if (accent === "purple") {
    return {
      border: "border-purple-300/45",
      text: "text-purple-300",
      bg: "bg-purple-400/10",
      bar: "from-purple-300 to-violet-500",
      glow: "shadow-[0_0_22px_rgba(168,85,247,0.14)]",
    };
  }

  if (accent === "red") {
    return {
      border: "border-red-300/35",
      text: "text-red-300",
      bg: "bg-red-400/10",
      bar: "from-red-300 to-rose-500",
      glow: "shadow-[0_0_22px_rgba(248,113,113,0.10)]",
    };
  }

  if (accent === "slate") {
    return {
      border: "border-white/14",
      text: "text-white/50",
      bg: "bg-white/8",
      bar: "from-white/35 to-white/20",
      glow: "",
    };
  }

  return {
    border: "border-cyan-300/45",
    text: "text-cyan-300",
    bg: "bg-cyan-400/10",
    bar: "from-cyan-300 to-sky-500",
    glow: "shadow-[0_0_22px_rgba(34,211,238,0.14)]",
  };
}

function getSportVisual(sport: CheckoutSport) {
  if (sport === "MLB") return { label: "MLB", icon: "MLB" };
  if (sport === "NBA") return { label: "NBA", icon: "NBA" };
  if (sport === "NHL") return { label: "NHL", icon: "NHL" };
  if (sport === "NFL") return { label: "NFL", icon: "NFL" };
  return { label: "SOCCER", icon: "SOCCER" };
}

function PrecisionTopPlayOpportunity({
  data,
  loading,
  onUnlock,
}: {
  data: PrecisionPublicResponse | null;
  loading: boolean;
  onUnlock: () => void;
}) {
  const progress = getPrecisionProgress(data, loading);
  const accent = getPrecisionAccentClasses("yellow");
  const canUnlock = Boolean(data?.availableForPurchase && !data.canRevealPick);

  return (
    <article className={`rounded-[22px] border ${accent.border} bg-[radial-gradient(circle_at_left,rgba(250,204,21,0.18),rgba(250,204,21,0.035)_42%,rgba(5,8,22,0.88))] p-3.5 ${accent.glow}`}>
      <div className="grid grid-cols-[58px_1fr_92px] items-center gap-3">
        <div className="grid h-[58px] w-[58px] place-items-center overflow-hidden rounded-full bg-yellow-400/10 shadow-[0_0_26px_rgba(250,204,21,0.26)]">
          <img
            src="/sport-marks/top-play.png"
            alt="Top Play"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[18px] font-black uppercase tracking-tight text-white">
              Top Play
            </h3>
            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.10em] text-cyan-300">
              All Sports
            </span>
          </div>
          <p className="mt-1 truncate text-[12px] leading-4 text-white/62">
            Atlas is comparing every sport.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.22)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.22)_50%,rgba(255,255,255,0.22)_75%,transparent_75%,transparent)] bg-[length:12px_12px] bg-gradient-to-r ${accent.bar}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={`text-[11px] font-black ${accent.text}`}>{progress}%</span>
          </div>
        </div>

        <div className="grid gap-2 border-l border-white/10 pl-3">
          <div className="min-w-0">
            <p className={`truncate text-[12px] font-black ${accent.text}`}>
              {loading ? "Loading" : getPrecisionStatusCopy(data?.status)}
            </p>
            <p className="mt-1 text-[10px] text-white/55">Available in</p>
            <p className="text-[18px] font-black leading-tight text-white">
              {formatPrecisionCountdown(data?.minutesToRelease) || "--"}
            </p>
          </div>
          <button
            type="button"
            onClick={onUnlock}
            disabled={!canUnlock}
            className={`rounded-full border px-2.5 py-2 text-[10px] font-black ${
              canUnlock
                ? "border-yellow-300/45 bg-yellow-300 text-black"
                : "border-white/12 bg-white/[0.04] text-white/70"
            }`}
          >
            {canUnlock ? "Unlock" : "Notify Me"}
          </button>
        </div>
      </div>
    </article>
  );
}

function PrecisionSportOpportunityCard({
  sport,
  data,
  loading,
  selected,
  onSelect,
}: {
  sport: CheckoutSport;
  data: PrecisionPublicResponse | null;
  loading: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const progress = getPrecisionProgress(data, loading);
  const accent = getPrecisionAccentClasses(getPrecisionAccent(data?.status));
  const sportTheme = getSportTheme(sport);
  const visual = getSportVisual(sport);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-w-0 rounded-[16px] border p-2.5 text-center transition-all active:scale-[0.99] ${sportTheme.border} ${
        selected ? `${sportTheme.bg} ${sportTheme.glow}` : "bg-white/[0.025]"
      }`}
    >
      <p className="text-[12px] font-black tracking-tight text-white">{visual.label}</p>
      <div className="mx-auto mt-1.5 flex justify-center">
        <SportMark sport={sport} size="md" />
      </div>
      <p className={`mt-2 min-h-[24px] text-[10px] font-black leading-3 ${accent.text}`}>
        {loading ? "Loading" : getPrecisionStatusCopy(data?.status)}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:10px_10px] bg-gradient-to-r ${accent.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-[9px] font-black ${accent.text}`}>{progress}%</span>
      </div>
      <p className="mt-2 text-[10px] leading-3 text-white/52">
        Available in
      </p>
      <p className="text-[15px] font-black leading-tight text-white">
        {formatPrecisionCountdown(data?.minutesToRelease) || "--"}
      </p>
      <span className="mt-2 inline-flex rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-bold text-white/78">
        Notify Me
      </span>
    </button>
  );
}

function SignalsActivitySummary({
  signalGroupCount,
  topSignals,
  topPlay,
}: {
  signalGroupCount: number;
  topSignals: Partial<Record<CheckoutSport, PrecisionPublicResponse>>;
  topPlay: PrecisionPublicResponse | null;
}) {
  const values = Object.values(topSignals).filter(Boolean) as PrecisionPublicResponse[];
  const underReview = values.filter((item) =>
    item.status === "validating" || item.status === "scanning"
  ).length;
  const strongCandidates = values.filter((item) => item.status === "strong_candidate").length;
  const finalReview = values.filter((item) => item.status === "final_review").length;

  return (
    <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[12px] font-black uppercase tracking-[0.13em] text-cyan-300">
        Today&apos;s Activity
      </p>
      <div className="mt-2.5 grid grid-cols-5 divide-x divide-white/10 text-center">
        {[
          ["◉", signalGroupCount, "Pending", "text-lime-300"],
          ["⌕", underReview, "Under Review", "text-cyan-300"],
          ["↗", strongCandidates, "Strong Candidates", "text-cyan-300"],
          ["◎", finalReview, "Final Review", "text-fuchsia-300"],
          ["🏆", topPlay ? 1 : 0, "Top Play", "text-yellow-300"],
        ].map(([icon, value, label, color]) => (
          <div key={String(label)} className="px-1">
            <p className={`text-[17px] ${color}`}>{icon}</p>
            <p className="mt-0.5 text-[17px] font-black leading-tight text-white">{value}</p>
            <p className="text-[9px] leading-3 text-white/48">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function getSignalResultBadge(result: string | null | undefined) {
  if (result === "WON") return "WON";
  if (result === "LOST") return "LOST";
  if (result === "PUSH") return "PUSH";
  return "PENDING";
}

function SignalDetectedRow({
  game,
  sport,
  pickLabel,
  odds,
  result,
  isLast,
  onOpen,
}: {
  game: LiveScore;
  sport: SportTab;
  pickLabel: string;
  odds?: number | null;
  result: string | null | undefined;
  isLast: boolean;
  onOpen: () => void;
}) {
  const awayScore = getLiveScoreValue(game, game.away_team);
  const homeScore = getLiveScoreValue(game, game.home_team);
  const hasScore = awayScore !== "-" || homeScore !== "-";
  const live = isGameLive(game);
  const resultLabel =
    result && getSignalResultBadge(result) !== "PENDING"
      ? getSignalResultBadge(result)
      : game.completed
      ? "FINAL"
      : live
      ? "LIVE"
      : "PENDING";
  const oddsLabel = formatAmericanOdds(odds ?? null);
  const timeLabel = hasScore
    ? `${awayScore}-${homeScore}`
    : live
    ? getGameMinute(game)
    : formatTime(game.commence_time);
  const detailLabel = game.completed ? "Final" : live ? getGameMinute(game) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`grid w-full grid-cols-[62px_1fr_auto_14px] items-center gap-2.5 px-3 py-2.5 text-left transition-all active:scale-[0.995] ${
        !isLast ? "border-b border-white/10" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <SportMark sport={sport} size="sm" />
        <span className="text-[10px] font-black text-white/64">{sport}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-white">
          {getDisplayName(game.away_team)} vs {getDisplayName(game.home_team)}
        </p>
        <p className="truncate text-[13px] font-semibold text-cyan-300">
          {pickLabel === "N/A" ? "Pending" : pickLabel}
          {oddsLabel !== "N/A" ? <span className="ml-1 text-white/58">{oddsLabel}</span> : null}
        </p>
      </div>

      <div className="text-right">
        <span
          className={`inline-flex rounded-[9px] border px-2 py-0.5 text-[9px] font-black ${
            resultLabel === "WON"
              ? "border-green-400/25 bg-green-500/15 text-green-300"
              : resultLabel === "LOST"
              ? "border-red-400/25 bg-red-500/15 text-red-300"
              : resultLabel === "PUSH"
              ? "border-yellow-400/25 bg-yellow-500/15 text-yellow-300"
              : resultLabel === "FINAL"
              ? "border-white/20 bg-white/8 text-white/70"
              : resultLabel === "LIVE"
              ? "border-green-400/25 bg-green-500/15 text-green-300"
              : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
          }`}
        >
          {resultLabel}
        </span>
        <p className="mt-1 whitespace-nowrap text-[10px] font-medium text-white/45">
          {timeLabel}
        </p>
        {detailLabel ? (
          <p className="whitespace-nowrap text-[8px] font-black uppercase tracking-[0.08em] text-cyan-300/70">
            {detailLabel}
          </p>
        ) : null}
      </div>

      <span className="text-[20px] leading-none text-white/28">›</span>
    </button>
  );
}

function PrecisionSignalCard({
  eyebrow,
  title,
  price,
  description,
  data,
  loading,
  tone,
  onUnlock,
}: {
  eyebrow: string;
  title: string;
  price: string;
  description: string;
  data: PrecisionPublicResponse | null;
  loading: boolean;
  tone: "cyan" | "emerald";
  onUnlock: () => void;
}) {
  const isEmerald = tone === "emerald";
  const progress = Math.max(0, Math.min(100, Number(data?.progressPercent ?? 0)));
  const statusCopy = loading ? "Loading" : getPrecisionStatusCopy(data?.status);
  const canUnlock = Boolean(data?.availableForPurchase && !data.canRevealPick);
  const actionLabel = getPrecisionActionLabel(data?.productType ?? "top_signal", data);

  return (
    <article
      className={`rounded-[26px] border p-4 ${
        isEmerald
          ? "border-emerald-300/30 bg-emerald-400/[0.045] shadow-[0_0_26px_rgba(52,211,153,0.08)]"
          : "border-cyan-300/30 bg-cyan-400/[0.045] shadow-[0_0_26px_rgba(34,211,238,0.08)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
              isEmerald
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                : "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
            }`}
          >
            {eyebrow}
          </span>

          <h2 className="mt-3 text-[22px] font-black uppercase tracking-[0.12em] text-white">
            {title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-5 text-white/62">
            {description}
          </p>
        </div>

        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-[16px] border ${
            isEmerald
              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
              : "border-cyan-300/35 bg-cyan-300/10 text-cyan-200"
          }`}
        >
          <DailyProductIcon tone={isEmerald ? "emerald" : "cyan"} />
        </div>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span
          className={`text-[32px] font-black leading-none ${
            isEmerald ? "text-emerald-300" : "text-cyan-300"
          }`}
        >
          {price}
        </span>
        <span className="pb-1 text-[13px] font-semibold text-white/50">
          / day
        </span>
      </div>

      <div className="mt-4 rounded-[18px] border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.10em] ${getPrecisionTone(data?.status)}`}>
            {statusCopy}
          </span>
          <span className="text-[11px] font-semibold text-white/48">
            {formatPrecisionCountdown(data?.minutesToRelease) || data?.preview?.message || "Atlas is scanning"}
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${
              isEmerald
                ? "bg-gradient-to-r from-emerald-300 to-teal-400"
                : "bg-gradient-to-r from-cyan-300 to-cyan-500"
            }`}
            style={{ width: `${loading ? 18 : progress}%` }}
          />
        </div>

        {data?.pick ? (
          <div className="mt-3 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/42">
              Pick Released
            </p>
            <p className="mt-1 text-[18px] font-black tracking-tight text-white">
              {data.pick.pickLabel}
            </p>
            {data.pick.odds !== null ? (
              <p className="mt-0.5 text-[12px] font-semibold text-white/55">
                Odds {formatAmericanOdds(data.pick.odds)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[13px] leading-5 text-white/58">
            {data?.preview?.message ?? "Atlas is scanning the market."}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onUnlock}
        disabled={!canUnlock}
        className={`mt-4 flex w-full items-center justify-between rounded-[16px] px-5 py-3 text-[12px] font-black uppercase tracking-[0.18em] transition-all ${
          canUnlock
            ? isEmerald
              ? "bg-gradient-to-r from-emerald-300 to-teal-400 text-slate-950 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
              : "bg-gradient-to-r from-cyan-300 to-cyan-500 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
            : "cursor-not-allowed border border-white/10 bg-white/[0.04] text-white/42"
        }`}
      >
        <span>{actionLabel}</span>
        <span className="text-[20px] leading-none">›</span>
      </button>
    </article>
  );
}

function SignalsHome({
  selectedSport,
  selectedSignalSport,
  topPlay,
  topSignals,
  loading,
  signalGroupCount,
  onSelectSignalSport,
  onUnlockTopPlay,
}: {
  selectedSport: SportTab;
  selectedSignalSport: CheckoutSport;
  topPlay: PrecisionPublicResponse | null;
  topSignals: Partial<Record<CheckoutSport, PrecisionPublicResponse>>;
  loading: boolean;
  signalGroupCount: number;
  onSelectSignalSport: (sport: CheckoutSport) => void;
  onUnlockTopPlay: () => void;
}) {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  return (
    <section>
      <div className="rounded-[20px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),rgba(5,8,22,0.96)_56%)] p-3">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-black uppercase tracking-[0.14em] text-cyan-300">
              Today&apos;s Opportunities
            </p>
            <p className="mt-0.5 text-[12px] text-white/68">
              Powered by Atlas Precision Engine
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHowItWorksOpen(true)}
            className="rounded-full px-2 py-1 text-[10px] font-semibold text-white/58"
          >
            ⓘ How it works
          </button>
        </div>

        <PrecisionTopPlayOpportunity
          data={topPlay}
          loading={loading}
          onUnlock={onUnlockTopPlay}
        />

        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {precisionDisplaySports.map((sport) => (
            <PrecisionSportOpportunityCard
              key={`precision-sport-card-${sport}`}
              sport={sport}
              data={topSignals[sport] ?? null}
              loading={loading}
              selected={selectedSignalSport === sport}
              onSelect={() => onSelectSignalSport(sport)}
            />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.025] px-2.5 py-2 text-[10px] leading-4 text-white/58">
          <p>
            <span className="mr-1 text-cyan-300">ⓘ</span>
            Top Signal releases 1 hour before each game.
          </p>
          <span className="h-5 w-px bg-white/10" />
          <p>
            <span className="mr-1 text-white/45">▣</span>
            Picks remain locked after kickoff.
          </p>
        </div>
      </div>

      <HowItWorksSheet
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />
    </section>
  );
}

function AtlasAccessGate({
  onFree,
  onLogin,
  onViewBoard,
}: {
  onFree: () => void;
  onLogin: () => void;
  onViewBoard: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#020716] text-white">
      <div className="mx-auto min-h-screen w-full max-w-md bg-[#020716]">
        <div className="relative mx-auto aspect-[853/1844] min-h-screen w-full max-w-[430px] overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="/access-board.png"
              alt="Atlas Signals member access"
              className="absolute inset-0 h-full w-full object-cover"
            />

            <button
              type="button"
              aria-label="Continue as guest"
              onClick={onViewBoard}
              className="absolute left-[13%] top-[60.45%] h-[5.1%] w-[74%] rounded-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-[#020716]"
            />

            <button
              type="button"
              aria-label="Sign in"
              onClick={onLogin}
              className="absolute left-[13%] top-[69.75%] h-[4.45%] w-[74%] rounded-[15px] focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-[#020716]"
            />

            <button
              type="button"
              aria-label="Sign up"
              onClick={onFree}
              className="absolute left-[13%] top-[75.25%] h-[4.45%] w-[74%] rounded-[15px] focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-[#020716]"
            />

            <button
              type="button"
              aria-label="Continue with Google"
              onClick={onFree}
              className="hidden"
            />

            <button
              type="button"
              aria-label="Continue with Apple"
              onClick={onFree}
              className="hidden"
            />

            <button
              type="button"
              aria-label="Continue with Email"
              onClick={onFree}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function HomeContent() {

const [mlbRecord, setMlbRecord] = useState<RecordStats>(emptyRecordStats);
const [nbaRecord, setNbaRecord] = useState<RecordStats>(emptyRecordStats);
const [nhlRecord, setNhlRecord] = useState<RecordStats>(emptyRecordStats);
const [soccerRecord, setSoccerRecord] = useState<RecordStats>(emptyRecordStats);
const [top5RecordStats, setTop5RecordStats] = useState<RecordStats>(emptyRecordStats);

  const router = useRouter();
  const searchParams = useSearchParams();
  const guestBoardMode = searchParams.get("board") === "1";
  const initialSectionParam = searchParams.get("section");
  const initialAppSection: AppSection =
    initialSectionParam === "signals" ||
    initialSectionParam === "scores" ||
    initialSectionParam === "bankroll" ||
    initialSectionParam === "news" ||
    initialSectionParam === "alerts" ||
    initialSectionParam === "more"
      ? initialSectionParam
      : "signals";
  const useBankrollSplashOverlay = initialAppSection === "bankroll";

  const [selectedSport, setSelectedSport] = useState<SportTab>("TOP");
  const [games, setGames] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveOddsGames, setLiveOddsGames] = useState<OddsGame[]>([]);
const [showSplash, setShowSplash] = useState(true);
const [splashEntered, setSplashEntered] = useState(false);

const [userAccess, setUserAccess] = useState<UserAccess>({
  plan: "free",
  sports: [],
  unlocks: {
    topPlay: false,
    topSignals: [],
  },
});
const [authSession, setAuthSession] = useState<AuthSessionState>({
  authenticated: false,
  email: null,
});
const [authLoaded, setAuthLoaded] = useState(false);
const [authBusy, setAuthBusy] = useState(false);
const [joinAuthMode, setJoinAuthMode] = useState<JoinAuthMode>("signup");
const [joinAuthOpen, setJoinAuthOpen] = useState(false);
const [joinEmail, setJoinEmail] = useState("");
const [joinPassword, setJoinPassword] = useState("");
const [joinAuthMessage, setJoinAuthMessage] = useState<SignalsJourneyMessage | null>(null);
const [checkoutPlan, setCheckoutPlan] = useState<CheckoutProduct | null>(null);
const [selectedPackSport, setSelectedPackSport] = useState<CheckoutSport>("MLB");
const [billingBusy, setBillingBusy] = useState(false);
const [selectedSignalInsight, setSelectedSignalInsight] = useState<SignalInsight | null>(null);
const [signalListExpanded, setSignalListExpanded] = useState(false);
const [activeDay, setActiveDay] = useState(() => getRelativeDayKey(0));
const [precisionTopPlay, setPrecisionTopPlay] = useState<PrecisionPublicResponse | null>(null);
const [precisionTopSignals, setPrecisionTopSignals] = useState<
  Partial<Record<CheckoutSport, PrecisionPublicResponse>>
>({});
const [precisionLoading, setPrecisionLoading] = useState(false);
const [precisionError, setPrecisionError] = useState<string | null>(null);
const [precisionRefreshKey, setPrecisionRefreshKey] = useState(0);
const [signalsJourneyMessage, setSignalsJourneyMessage] = useState<SignalsJourneyMessage | null>(null);
const checkoutIntentStarted = useRef(false);
const currentTodayKey = useRef(getRelativeDayKey(0));

useEffect(() => {
  const frameId = requestAnimationFrame(() => {
    setSplashEntered(true);
  });

  const timeoutId = setTimeout(() => {
    setShowSplash(false);
  }, 1500);

  return () => {
    cancelAnimationFrame(frameId);
    clearTimeout(timeoutId);
  };
}, []);

useEffect(() => {
  const interval = setInterval(() => {
    const latestTodayKey = getRelativeDayKey(0);

    if (currentTodayKey.current !== latestTodayKey) {
      setActiveDay((current) =>
        current === currentTodayKey.current ? latestTodayKey : current
      );
      currentTodayKey.current = latestTodayKey;
    }
  }, 60000);

  return () => clearInterval(interval);
}, []);

useEffect(() => {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function loadPrecisionProducts() {
    try {
      setPrecisionLoading(true);
      setPrecisionError(null);

      const dateQuery = activeDay ? `?date=${activeDay}` : "";
      const [topPlayResponse, ...topSignalResponses] = await Promise.all([
        fetch(`/api/precision/top-play${dateQuery}`, { cache: "no-store" }).then((res) =>
          res.ok ? res.json() : null
        ),
        ...checkoutSports.map((sport) =>
          fetch(`/api/precision/top-signal/${sport.toLowerCase()}${dateQuery}`, {
            cache: "no-store",
          }).then((res) => (res.ok ? res.json() : null))
        ),
      ]);

      if (cancelled) return;

      setPrecisionTopPlay(topPlayResponse?.ok ? topPlayResponse : null);
      setPrecisionTopSignals(
        checkoutSports.reduce<Partial<Record<CheckoutSport, PrecisionPublicResponse>>>(
          (acc, sport, index) => {
            const response = topSignalResponses[index];

            if (response?.ok) {
              acc[sport] = response;
            }

            return acc;
          },
          {}
        )
      );
    } catch {
      if (!cancelled) {
        setPrecisionError("Unable to load market data.");
        setPrecisionTopPlay(null);
        setPrecisionTopSignals({});
      }
    } finally {
      if (!cancelled) {
        setPrecisionLoading(false);
        timeoutId = setTimeout(loadPrecisionProducts, 60000);
      }
    }
  }

  loadPrecisionProducts();

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [
  activeDay,
  authSession.authenticated,
  userAccess.plan,
  userAccess.unlocks.topPlay,
  userAccess.unlocks.topSignals,
  precisionRefreshKey,
]);

useEffect(() => {
  const checkoutStatus = searchParams.get("checkout");
  if (!checkoutStatus) return;

  setAppSection("signals");
  setViewMode("live");
  setSelectedSport("TOP");

  if (checkoutStatus === "success") {
    setSignalsJourneyMessage({
      tone: "success",
      title: "Purchase confirmed.",
      body: "Atlas is refreshing your unlocked signal.",
    });
    setPrecisionRefreshKey((value) => value + 1);
  } else if (checkoutStatus === "cancel") {
    setSignalsJourneyMessage({
      tone: "info",
      title: "Checkout canceled.",
      body: "No purchase was made.",
    });
  } else if (checkoutStatus === "error") {
    setSignalsJourneyMessage({
      tone: "error",
      title: "Checkout could not be completed.",
      body: "Please try again when the signal is available.",
    });
  }

  router.replace("/?board=1&section=signals&view=live&sport=TOP");
}, [searchParams, router]);

function applyAuthSessionData(data: AuthSessionResponse) {
  const nextPlan = isUserPlan(data.plan) ? data.plan : "free";

  setUserAccess({
    plan: nextPlan,
    sports: Array.isArray(data.sports) ? data.sports : [],
    unlocks: {
      topPlay: Boolean(data.unlocks?.topPlay),
      topSignals: Array.isArray(data.unlocks?.topSignals)
        ? data.unlocks.topSignals.filter((sport: unknown): sport is SportTab =>
            sportsTabs.includes(sport as SportTab)
          )
        : [],
    },
  });
  setAuthSession({
    authenticated: Boolean(data.authenticated),
    email: typeof data.email === "string" ? data.email : null,
  });
}

async function refreshAuthSession() {
  const res = await fetch("/api/auth/session", {
    cache: "no-store",
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? "Unable to load account.");
  }

  applyAuthSessionData(data);
  return Boolean(data.authenticated);
}

useEffect(() => {
  let mounted = true;

  async function loadUserAccess() {
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!mounted) return;

      applyAuthSessionData(data);
      setAuthLoaded(true);
    } catch {
      if (!mounted) return;

      setUserAccess({
        plan: "free",
        sports: [],
        unlocks: {
          topPlay: false,
          topSignals: [],
        },
      });
      setAuthSession({
        authenticated: false,
        email: null,
      });
      setAuthLoaded(true);
    }
  }

  loadUserAccess();

  return () => {
    mounted = false;
  };
}, []);

async function handleSubscribe(product: CheckoutProduct, sport?: CheckoutSport): Promise<PrecisionUnlockResult> {
  const checkoutSport = isSubscriptionCheckoutProduct(product)
    ? sport ?? selectedPackSport
    : sport;

  if (!authSession.authenticated) {
    const params = new URLSearchParams({
      intent: "subscribe",
      product,
    });

    if (checkoutSport) {
      params.set("sport", checkoutSport);
    }

    router.push(`/login?${params.toString()}`);
    return { status: "login" };
  }

  try {
    setCheckoutPlan(product);

    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product,
        sport: checkoutSport,
        ...(!isSubscriptionCheckoutProduct(product) ? { date: activeDay } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.url) {
      throw new Error(data?.error ?? "Unable to start checkout");
    }

    window.location.href = data.url;
    return { status: "checkout" };
  } catch (error) {
    console.log("Checkout error", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not start checkout. Try again.",
    };
  } finally {
    setCheckoutPlan(null);
  }
}

async function handlePrecisionNotify(product: CheckoutProduct, sport?: CheckoutSport): Promise<PrecisionNotifyResult> {
  if (!authSession.authenticated) {
    const params = new URLSearchParams({
      mode: "login",
      intent: "notify",
      product,
    });

    if (sport) params.set("sport", sport);

    router.push(`/login?${params.toString()}`);
    return { status: "login" };
  }

  try {
    const productType = product === "top_play" ? "top_play" : "top_signal";
    const notifySport = product === "top_play" ? "global" : sport?.toLowerCase();
    const notification = {
      productType,
      sport: notifySport,
      date: activeDay,
      requestedAt: new Date().toISOString(),
    };

    const response = await fetch("/api/precision/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notification),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      return { status: "error", message: data?.error ?? "Unable to reserve notification" };
    }

    const existing = JSON.parse(
      window.localStorage.getItem("atlas_precision_notifications") ?? "[]"
    ) as unknown[];

    window.localStorage.setItem(
      "atlas_precision_notifications",
      JSON.stringify([...existing, notification].slice(-50))
    );

    if (data.persisted === false) {
      return { status: "prepared", prepared: Boolean(data.prepared), persisted: false };
    }

    return { status: "reserved", prepared: Boolean(data.prepared), persisted: true };
  } catch (error) {
    console.log("Notify Me error", error);
    return { status: "error", message: "Unable to reserve notification" };
  }
}

async function handleTopPlayCommerceAction(): Promise<PrecisionUnlockResult> {
  const data = precisionTopPlay;

  if (data?.admin || (data?.purchased && data?.canRevealPick)) {
    setPrecisionRefreshKey((value) => value + 1);
    return { status: "view_pick" };
  }

  if (data?.status === "no_play") {
    return { status: "error", message: "No Top Play Today." };
  }

  const closed =
    data?.status === "locked" ||
    (data?.minutesToKickoff !== null &&
      data?.minutesToKickoff !== undefined &&
      data.minutesToKickoff <= 0);

  if (closed) {
    return { status: "error", message: "Today's Top Play is closed." };
  }

  const canUnlock =
    data?.status === "available_now" &&
    data.availableForPurchase === true &&
    data.purchased === false &&
    data.admin === false;

  if (canUnlock) {
    return handleSubscribe("top_play");
  }

  if (data?.status && data.status !== "available_now") {
    return { status: "error", message: "Top Play is not available yet." };
  }

  return { status: "error", message: "Product is not available." };
}

async function handleTopSignalCommerceAction(sport: CheckoutSport): Promise<PrecisionUnlockResult> {
  const data = precisionTopSignals[sport];
  const product = topSignalProductForSport(sport);

  if (data?.admin || (data?.purchased && data?.canRevealPick)) {
    setPrecisionRefreshKey((value) => value + 1);
    return { status: "view_pick" };
  }

  const nflUnavailable =
    sport === "NFL" &&
    !data?.releaseAt &&
    !data?.lockedAt &&
    !data?.pick &&
    !data?.noPlayReason;

  if (nflUnavailable) {
    return { status: "error", message: "NFL signals are not available yet." };
  }

  if (data?.status === "no_play") {
    return { status: "error", message: "No Top Signal Today." };
  }

  const closed =
    data?.status === "locked" ||
    (data?.minutesToKickoff !== null &&
      data?.minutesToKickoff !== undefined &&
      data.minutesToKickoff <= 0);

  if (closed) {
    return { status: "error", message: "Today's Top Signal is closed." };
  }

  const canUnlock =
    data?.status === "available_now" &&
    data.availableForPurchase === true &&
    data.purchased === false &&
    data.admin === false;

  if (canUnlock) {
    return handleSubscribe(product, sport);
  }

  if (data?.status && data.status !== "available_now") {
    return { status: "error", message: "This Top Signal is not available yet." };
  }

  return { status: "error", message: "Product is not available." };
}

useEffect(() => {
  const product = searchParams.get("subscribe") ?? searchParams.get("checkout_product");
  const sportParam = searchParams.get("sport")?.toUpperCase();
  const checkoutSport = checkoutSports.includes(sportParam as CheckoutSport)
    ? (sportParam as CheckoutSport)
    : undefined;

  if (
    !authSession.authenticated ||
    checkoutIntentStarted.current ||
    checkoutPlan !== null ||
    !isCheckoutProduct(product)
  ) {
    return;
  }

  checkoutIntentStarted.current = true;
  router.replace("/");
  handleSubscribe(product, checkoutSport);
}, [authSession.authenticated, checkoutPlan, searchParams, router]);

useEffect(() => {
  if (!authSession.authenticated || searchParams.get("plans") !== "1") {
    return;
  }

  setAppSection("signals");
  setViewMode("odds");
  router.replace("/");
}, [authSession.authenticated, searchParams, router]);

async function handleManageBilling() {
  if (!authSession.authenticated) {
    setAppSection("more");
    setJoinAuthMode("signin");
    setJoinAuthMessage({
      tone: "info",
      title: "Sign in to manage billing.",
      body: "Use your Atlas account email and password.",
    });
    return;
  }

  try {
    setBillingBusy(true);

    const res = await fetch("/api/stripe/create-portal-session", {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok || !data?.url) {
      throw new Error(data?.error ?? "Unable to open billing portal");
    }

    window.location.href = data.url;
  } catch (error) {
    console.log("Billing portal error", error);
  } finally {
    setBillingBusy(false);
  }
}

async function handleInlineAuthSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setAuthBusy(true);
  setJoinAuthMessage(null);

  try {
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: joinAuthMode,
        email: joinEmail,
        password: joinPassword,
      }),
    });
    const data = await res.json();

    if (!res.ok || data?.success === false) {
      throw new Error(data?.error ?? "Unable to complete account access.");
    }

    if (data.authenticated) {
      await refreshAuthSession();
      setJoinPassword("");
      setJoinAuthMessage({
        tone: "success",
        title: joinAuthMode === "signin" ? "Signed in." : "Account ready.",
        body: "You can choose a plan below without leaving Atlas Signals.",
      });
      return;
    }

    setJoinPassword("");
    setJoinAuthMessage({
      tone: "info",
      title: "Confirm your email.",
      body: "We sent a confirmation link. After confirmation, return here and sign in to choose your pack.",
    });
  } catch (error) {
    setJoinAuthMessage({
      tone: "error",
      title: "Account access failed.",
      body: error instanceof Error ? error.message : "Try again in a moment.",
    });
  } finally {
    setAuthBusy(false);
  }
}

function handleJoinPlanChoose(plan: PackPlan["plan"]) {
  if (!authSession.authenticated) {
    setJoinAuthMode("signup");
    setJoinAuthOpen(true);
    setJoinAuthMessage({
      tone: "info",
      title: "Create your account first.",
      body: `Sign up here, then choose ${plan.toUpperCase()} without leaving Atlas Signals.`,
    });
    return;
  }

  void handleSubscribe(plan, plan === "unlimited" ? undefined : selectedPackSport);
}

async function handleLogout() {
  setAuthBusy(true);

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    setUserAccess({
      plan: "free",
      sports: [],
      unlocks: {
        topPlay: false,
        topSignals: [],
      },
    });
    setAuthSession({
      authenticated: false,
      email: null,
    });
    setAuthBusy(false);
  }
}

const [viewMode, setViewMode] = useState<"odds" | "live">("live");
const [appSection, setAppSection] = useState<AppSection>(() => initialAppSection);
const [pulseSportFilter, setPulseSportFilter] = useState<"ALL" | PulseSport>("ALL");
const [pulseImpactFilter, setPulseImpactFilter] = useState<ImpactFeedFilter>("TEAM");
const [pulseMlbItems, setPulseMlbItems] = useState<AtlasEvent[]>(() =>
  createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport === "MLB"))
);
const [teamImpactEvents, setTeamImpactEvents] = useState<TeamImpactEvent[]>([]);
const [marketImpactEvents, setMarketImpactEvents] = useState<MarketImpactEvent[]>([]);
const [atlasIntelligenceEvents, setAtlasIntelligenceEvents] = useState<AtlasIntelligenceEvent[]>([]);
const [pulseLoading, setPulseLoading] = useState(false);
const [pulseLastUpdatedAt, setPulseLastUpdatedAt] = useState<string | null>(null);
const [impactDetailSheet, setImpactDetailSheet] = useState<ImpactDetailSheetState>(null);
const [pulseSourcesSheet, setPulseSourcesSheet] = useState<{
  title: string;
  sources: AtlasSource[];
} | null>(null);
const [followedSports, setFollowedSports] = useState<SportTab[]>([]);
const [followedTeams, setFollowedTeams] = useState<string[]>([]);
const [liveGames, setLiveGames] = useState<LiveScore[]>([]);
const [liveLoading, setLiveLoading] = useState(false);
const [subsScoreGames, setSubsScoreGames] = useState<LiveScore[]>([]);
const [subsScoresLoading, setSubsScoresLoading] = useState(false);
const [topSignalHistory, setTopSignalHistory] = useState<any[]>([]);
const [top5History, setTop5History] = useState<any[]>([]);
const [mlbSignalsData, setMlbSignalsData] = useState<{ games: SignalGame[] }>({games: [],
});
const [mlbTop5Data, setMlbTop5Data] = useState<{ top5: Top5Entry[] }>({top5: [],
});
const [nbaSignalsData, setNbaSignalsData] = useState<{
  games: SignalGame[];
}>({
  games: [],
});
const [nbaTop5Data, setNbaTop5Data] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});
const [nhlSignalsData, setNhlSignalsData] = useState<{ games: SignalGame[] }>({
  games: [],
});

const [nhlTop5Data, setNhlTop5Data] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});

const [soccerSignalsLiveData, setSoccerSignalsLiveData] = useState<{ games: SignalGame[] }>({
  games: [],
});

const [soccerTop5LiveData, setSoccerTop5LiveData] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});
const [globalSnapshot, setGlobalSnapshot] = useState<AtlasDailySnapshot | null>(null);
const [globalSnapshotLookupComplete, setGlobalSnapshotLookupComplete] = useState(false);
const globalSnapshotNowRef = useRef(new Date().toISOString());
const globalSnapshotLookupRunRef = useRef(0);
const bankrollAtlasSources = useMemo(
  () =>
    buildBankrollAtlasSources({
      mlbSignals: mlbSignalsData.games,
      nbaSignals: nbaSignalsData.games,
      nhlSignals: nhlSignalsData.games,
      soccerSignals: soccerSignalsLiveData.games,
      mlbTop5: mlbTop5Data.top5,
      nbaTop5: nbaTop5Data.top5,
      nhlTop5: nhlTop5Data.top5,
      soccerTop5: soccerTop5LiveData.top5,
    }),
  [mlbSignalsData, mlbTop5Data, nbaSignalsData, nbaTop5Data, nhlSignalsData, nhlTop5Data, soccerSignalsLiveData, soccerTop5LiveData],
);
const globalLiveSnapshotPicks = useMemo(() => atlasSourcesToTrackingPicks(bankrollAtlasSources), [bankrollAtlasSources]);
const globalSnapshotMode = useMemo(() => resolveSnapshotMode(globalLiveSnapshotPicks, globalSnapshot), [globalLiveSnapshotPicks, globalSnapshot]);
const effectiveBankrollAtlasSources = useMemo(
  () => (globalSnapshotMode.demoModeEnabled ? snapshotToAtlasSources(globalSnapshotMode.snapshot) : bankrollAtlasSources),
  [bankrollAtlasSources, globalSnapshotMode.demoModeEnabled, globalSnapshotMode.snapshot],
);
const bankrollMembership = useMemo(
  () => getBankrollMembershipFromAccess(userAccess, selectedPackSport, effectiveBankrollAtlasSources),
  [effectiveBankrollAtlasSources, selectedPackSport, userAccess],
);

useEffect(() => {
  const storedConfig = loadBankrollConfig();
  const storedSnapshot = loadLatestSnapshot(storedConfig);
  setGlobalSnapshot(storedSnapshot);
  if (storedSnapshot) setGlobalSnapshotLookupComplete(true);
}, []);

useEffect(() => {
  let cancelled = false;

  async function initializeHistoricalSnapshot() {
    if (globalLiveSnapshotPicks.length > 0 || globalSnapshot || globalSnapshotLookupComplete) return;

    const storedSnapshot = loadLatestSnapshot(loadBankrollConfig());
    if (storedSnapshot) {
      setGlobalSnapshot(storedSnapshot);
      setGlobalSnapshotLookupComplete(true);
      return;
    }

    const lookupRunId = globalSnapshotLookupRunRef.current + 1;
    globalSnapshotLookupRunRef.current = lookupRunId;

    const { sources, snapshotDate } = await loadHistoricalSnapshotSources();
    if (cancelled || lookupRunId !== globalSnapshotLookupRunRef.current) return;

    setGlobalSnapshotLookupComplete(true);
    if (!snapshotDate || atlasSourcesToTrackingPicks(sources).length === 0) return;

    const createdAt = globalSnapshotNowRef.current;
    const historicalSnapshot = createSnapshotFromSources(sources, {
      snapshotDate,
      createdAt,
      package: bankrollMembership.package,
    });
    if (!historicalSnapshot) return;

    setGlobalSnapshot(historicalSnapshot);

    const storedConfig = loadBankrollConfig();
    if (!storedConfig) return;

    const nextConfig = normalizeBankrollConfig({
      ...storedConfig,
      lastGlobalSnapshot: historicalSnapshot,
      lastAtlasSnapshot: historicalSnapshot,
      lastSnapshotDate: historicalSnapshot.snapshotDate,
      demoModeEnabled: true,
      updatedAt: createdAt,
    });
    const currentState = JSON.stringify({
      lastGlobalSnapshot: storedConfig.lastGlobalSnapshot ?? null,
      lastAtlasSnapshot: storedConfig.lastAtlasSnapshot ?? null,
      lastSnapshotDate: storedConfig.lastSnapshotDate ?? null,
      demoModeEnabled: Boolean(storedConfig.demoModeEnabled),
    });
    const nextState = JSON.stringify({
      lastGlobalSnapshot: nextConfig.lastGlobalSnapshot ?? null,
      lastAtlasSnapshot: nextConfig.lastAtlasSnapshot ?? null,
      lastSnapshotDate: nextConfig.lastSnapshotDate ?? null,
      demoModeEnabled: Boolean(nextConfig.demoModeEnabled),
    });

    if (currentState !== nextState) saveBankrollConfig(nextConfig);
  }

  void initializeHistoricalSnapshot();

  return () => {
    cancelled = true;
  };
}, [bankrollMembership.package, globalLiveSnapshotPicks.length, globalSnapshot, globalSnapshotLookupComplete]);

useEffect(() => {
  const now = globalSnapshotNowRef.current;
  const liveSnapshot = globalLiveSnapshotPicks.length > 0
    ? createSnapshotFromSources(bankrollAtlasSources, {
        createdAt: now,
        package: bankrollMembership.package,
      })
    : null;
  const nextSnapshot = liveSnapshot ?? globalSnapshot;
  const nextDemoEnabled = globalLiveSnapshotPicks.length === 0 && Boolean(nextSnapshot?.picks.length);

  if (JSON.stringify(nextSnapshot ?? null) !== JSON.stringify(globalSnapshot ?? null)) {
    setGlobalSnapshot(nextSnapshot);
  }

  const storedConfig = loadBankrollConfig();
  if (!storedConfig) return;

  const nextConfig = normalizeBankrollConfig({
    ...storedConfig,
    lastGlobalSnapshot: nextSnapshot,
    lastAtlasSnapshot: nextSnapshot ?? storedConfig.lastAtlasSnapshot ?? null,
    lastSnapshotDate: nextSnapshot?.snapshotDate ?? storedConfig.lastSnapshotDate ?? null,
    demoModeEnabled: nextDemoEnabled,
    updatedAt: now,
  });
  const currentState = JSON.stringify({
    lastGlobalSnapshot: storedConfig.lastGlobalSnapshot ?? null,
    lastAtlasSnapshot: storedConfig.lastAtlasSnapshot ?? null,
    lastSnapshotDate: storedConfig.lastSnapshotDate ?? null,
    demoModeEnabled: Boolean(storedConfig.demoModeEnabled),
  });
  const nextState = JSON.stringify({
    lastGlobalSnapshot: nextConfig.lastGlobalSnapshot ?? null,
    lastAtlasSnapshot: nextConfig.lastAtlasSnapshot ?? null,
    lastSnapshotDate: nextConfig.lastSnapshotDate ?? null,
    demoModeEnabled: Boolean(nextConfig.demoModeEnabled),
  });

  if (currentState !== nextState) saveBankrollConfig(nextConfig);
}, [bankrollAtlasSources, bankrollMembership.package, globalLiveSnapshotPicks.length, globalSnapshot]);

function navigateAppState(
  updates: Partial<{
    section: AppSection;
    sport: SportTab;
    view: "odds" | "live";
    day: string;
  }>
) {
  const nextSection = updates.section ?? appSection;
  const nextSport = updates.sport ?? selectedSport;
  const nextView = updates.view ?? viewMode;
  const nextDay = updates.day ?? activeDay;
  const params = new URLSearchParams();

  params.set("section", nextSection);
  params.set("sport", nextSport);
  params.set("view", nextView);
  params.set("day", nextDay);

  if (!authSession.authenticated && guestBoardMode) {
    params.set("board", "1");
  }

  if (updates.section) setAppSection(updates.section);
  if (updates.sport) setSelectedSport(updates.sport);
  if (updates.view) setViewMode(updates.view);
  if (updates.day) setActiveDay(updates.day);

  router.push(`/?${params.toString()}`, { scroll: false });
}

useEffect(() => {
  try {
    const sports = JSON.parse(localStorage.getItem("atlas_followed_sports") ?? "[]");
    const teams = JSON.parse(localStorage.getItem("atlas_followed_teams") ?? "[]");

    if (Array.isArray(sports)) {
      setFollowedSports(
        sports.filter((sport): sport is SportTab =>
          sportsTabs.includes(sport as SportTab)
        )
      );
    }

    if (Array.isArray(teams)) {
      setFollowedTeams(teams.filter((team) => typeof team === "string"));
    }
  } catch {
    setFollowedSports([]);
    setFollowedTeams([]);
  }
}, []);

useEffect(() => {
  localStorage.setItem("atlas_followed_sports", JSON.stringify(followedSports));
}, [followedSports]);

useEffect(() => {
  localStorage.setItem("atlas_followed_teams", JSON.stringify(followedTeams));
}, [followedTeams]);

useEffect(() => {
  if (!authSession.authenticated) return;

  let mounted = true;

  async function loadRemoteFollows() {
    try {
      const res = await fetch("/api/user-follows", {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      const follows = Array.isArray(data.follows) ? data.follows : [];

      const remoteSports = follows
        .filter((follow: any) => follow.follow_type === "sport")
        .map((follow: any) => String(follow.sport ?? "").toUpperCase())
        .filter((sport: string): sport is SportTab =>
          sportsTabs.includes(sport as SportTab)
        );

      const remoteTeams = follows
        .filter((follow: any) => follow.follow_type === "team")
        .map((follow: any) => String(follow.team_key ?? ""))
        .filter(Boolean);

      if (!mounted) return;

      const mergedSports = Array.from(new Set([...remoteSports, ...followedSports]));
      const mergedTeams = Array.from(new Set([...remoteTeams, ...followedTeams]));

      setFollowedSports(mergedSports);
      setFollowedTeams(mergedTeams);

      await Promise.all([
        ...followedSports
          .filter((sport) => !remoteSports.includes(sport))
          .map((sport) =>
            fetch("/api/user-follows", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ followType: "sport", sport }),
            })
          ),
        ...followedTeams
          .filter((teamKey) => !remoteTeams.includes(teamKey))
          .map((teamKey) => {
            const teamName =
              availableTeamsForFollowing.find((team) => team.key === teamKey)?.name ??
              teamKey;

            return fetch("/api/user-follows", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                followType: "team",
                sport: selectedSport,
                teamKey,
                teamName,
              }),
            });
          }),
      ]);
    } catch {
      // Keep local follows if server sync is unavailable.
    }
  }

  loadRemoteFollows();

  return () => {
    mounted = false;
  };
}, [authSession.authenticated]);

  useEffect(() => {
  async function loadAllSupabaseSignals() {
    const signalDate = activeDay;
    const [
      mlbPublic,
      mlbTop5,
      nbaPublic,
      nbaTop5,
      nhlPublic,
      nhlTop5,
      soccerPublic,
      soccerTop5,
    ] = await Promise.all([
      getMlbPublicSignals(signalDate),
      getMlbTop5Live(signalDate),
      getNbaPublicSignals(signalDate),
      getNbaTop5Live(signalDate),
      getNhlPublicSignals(signalDate),
      getNhlTop5Live(signalDate),
      getSoccerPublicSignals(signalDate),
      getSoccerTop5Live(signalDate),
    ]);

    setMlbSignalsData({
      games: (mlbPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setMlbTop5Data({
  top5: (mlbTop5 || []).map((g: any) => ({
    gameId: g.gameId ?? g.game_id,
    awayTeam: g.awayTeam ?? g.away_team,
    homeTeam: g.homeTeam ?? g.home_team,
    pick: g.pick,
    market: g.market,
    line: g.line,
    odds: g.odds,
    status: g.status,
    rank: g.rank,
    isTopSignal: g.isTopSignal ?? g.is_top_signal ?? g.rank === 1,
    confidence: g.confidence,
    internalScore: g.internalScore ?? g.internal_score,
    edge: g.edge,
    analysisSummary: g.analysisSummary ?? g.analysis_summary,
    confidenceLabel: g.confidenceLabel ?? g.confidence_label,
    edgeLabel: g.edgeLabel ?? g.edge_label,
    riskNote: g.riskNote ?? g.risk_note,
    modelFactors: g.modelFactors ?? g.model_factors,
    startTime: g.startTime ?? g.start_time,
  })),
});

    setNbaSignalsData({
      games: (nbaPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setNbaTop5Data({
      top5: (nbaTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setNhlSignalsData({
      games: (nhlPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setNhlTop5Data({
      top5: (nhlTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setSoccerSignalsLiveData({
      games: (soccerPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });

    setSoccerTop5LiveData({
      top5: (soccerTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        analysisSummary: g.analysis_summary,
        confidenceLabel: g.confidence_label,
        edgeLabel: g.edge_label,
        riskNote: g.risk_note,
        modelFactors: g.model_factors,
        startTime: g.start_time,
      })),
    });
  }

  loadAllSupabaseSignals();

  const interval = setInterval(() => {
    loadAllSupabaseSignals();
  }, 30000);

  return () => clearInterval(interval);
}, [activeDay]);

  const topSignals: TopSignalCard[] = useMemo(
  () =>
    [
      mlbTop5Data.top5?.[0]
        ? { ...(mlbTop5Data.top5[0] as Top5Entry), sport: "MLB" as const }
        : null,
      nbaTop5Data.top5?.[0]
        ? { ...(nbaTop5Data.top5[0] as Top5Entry), sport: "NBA" as const }
        : null,
      nhlTop5Data.top5?.[0]
        ? { ...(nhlTop5Data.top5[0] as Top5Entry), sport: "NHL" as const }
        : null,
      soccerTop5Data.top5?.[0]
        ? { ...(soccerTop5Data.top5[0] as Top5Entry), sport: "SOCCER" as const }
        : null,
    ].filter((pick): pick is TopSignalCard => Boolean(pick)),
  [mlbTop5Data, nbaTop5Data, nhlTop5Data]
);

const groupedLiveGames = useMemo(() => {
  const groups: Record<string, LiveScore[]> = {};

  liveGames.forEach((game) => {
    const key = game.sport_key || "unknown";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(game);
  });

  return Object.entries(groups).map(([leagueKey, games]) => ({
    leagueKey,
    title: getLeagueDisplayName(leagueKey),
    sport: getLiveSportFromKey(leagueKey),
    games,
  }));
}, [liveGames]);

const filteredLiveGames = useMemo(() => {
  const todayKey = getRelativeDayKey(0);

  return liveGames.filter((game) => {
    const gameDayKey = getGameDayKey(game.commence_time);
    const live = isGameLive(game);

    if (activeDay === todayKey) {
      return gameDayKey === todayKey || live;
    }

    return gameDayKey === activeDay;
  });
}, [liveGames, activeDay]);

const groupedFilteredLiveGames = useMemo(() => {
  const groups: Record<string, LiveScore[]> = {};

  filteredLiveGames.forEach((game) => {
    const key = game.sport_key || "unknown";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(game);
  });

  return Object.entries(groups).map(([leagueKey, games]) => ({
    leagueKey,
    title: getLeagueDisplayName(leagueKey),
    sport: getLiveSportFromKey(leagueKey),
    games,
  })).sort((a, b) => {
    const aIndex = scoreBoardSports.indexOf(a.sport as (typeof scoreBoardSports)[number]);
    const bIndex = scoreBoardSports.indexOf(b.sport as (typeof scoreBoardSports)[number]);

    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}, [filteredLiveGames]);

const isHistoricalDay = activeDay < getRelativeDayKey(0);
const historicalTop5Data = useMemo(
  () => ({
    top5: sortPicksByStartTime(
      top5History
        .filter((row) => String(row.date ?? "") === activeDay)
        .map(mapHistoryRowToTop5Entry)
    ),
  }),
  [top5History, activeDay]
);

const hasTop5HistoryForActiveDay = historicalTop5Data.top5.length > 0;
const activeMlbTop5Data =
  selectedSport === "MLB" && hasTop5HistoryForActiveDay
    ? historicalTop5Data
    : mlbTop5Data;
const activeNbaTop5Data =
  selectedSport === "NBA" && hasTop5HistoryForActiveDay
    ? historicalTop5Data
    : nbaTop5Data;
const activeNhlTop5Data =
  selectedSport === "NHL" && hasTop5HistoryForActiveDay
    ? historicalTop5Data
    : nhlTop5Data;
const activeSoccerTop5Data =
  selectedSport === "SOCCER" && hasTop5HistoryForActiveDay
    ? historicalTop5Data
    : soccerTop5LiveData;

const activeSubscriptionSports = useMemo(() => {
  const available = checkoutSports.filter((sport) => {
    if (sport === "NFL") return false;
    return getTop5BySport(
      sport,
      activeMlbTop5Data,
      activeNbaTop5Data,
      activeNhlTop5Data,
      activeSoccerTop5Data
    ).some((pick) => pick.isTopSignal !== true && pick.rank !== 1);
  });

  return available.length > 0 ? available : (["MLB"] as CheckoutSport[]);
}, [activeMlbTop5Data, activeNbaTop5Data, activeNhlTop5Data, activeSoccerTop5Data]);

useEffect(() => {
  if (!activeSubscriptionSports.includes(selectedPackSport)) {
    setSelectedPackSport(activeSubscriptionSports[0] ?? "MLB");
  }
}, [activeSubscriptionSports, selectedPackSport]);

function getSignalSourceForSport(sport: SportTab) {
  if (sport === "MLB") return mlbSignalsData.games;
  if (sport === "NBA") return nbaSignalsData.games;
  if (sport === "NHL") return nhlSignalsData.games;
  if (sport === "SOCCER") return soccerSignalsLiveData.games;
  return [];
}

function getSignalSportKey(sport: SportTab) {
  if (sport === "MLB") return "baseball_mlb";
  if (sport === "NBA") return "basketball_nba";
  if (sport === "NHL") return "icehockey_nhl";
  if (sport === "SOCCER") return "soccer_public_signals";
  return String(sport).toLowerCase();
}

function getOddsSportKeyForScores(sport: SportTab) {
  if (sport === "MLB") return "baseball_mlb";
  if (sport === "NBA") return "basketball_nba";
  if (sport === "NHL") return "icehockey_nhl";
  if (sport === "SOCCER") return "soccer_public_signals";
  return String(sport).toLowerCase();
}

function oddsGameToScheduledScore(game: OddsGame, sport: SportTab): LiveScore {
  return {
    id: String(game.id),
    sport_key: getOddsSportKeyForScores(sport),
    sport_title: sport,
    commence_time: game.commence_time,
    home_team: game.home_team,
    away_team: game.away_team,
    completed: false,
    scores: [],
    rawStatus: "Scheduled",
  };
}

function findLiveGameForSignal(signal: SignalGame, sport: SportTab) {
  return filteredLiveGames.find((game) => {
    if (getLiveSportFromKey(game.sport_key) !== sport) return false;

    if (signal.gameId && game.id && String(signal.gameId) === String(game.id)) {
      return true;
    }

    return isSameMatch(game, signal);
  });
}

function signalToLiveScore(signal: SignalGame, sport: SportTab): LiveScore {
  const matchedLiveGame = findLiveGameForSignal(signal, sport);

  if (matchedLiveGame) return matchedLiveGame;

  return {
    id: String(
      signal.gameId ??
      `${sport}-${normalizeName(signal.awayTeam ?? "")}-${normalizeName(
        signal.homeTeam ?? ""
      )}-${signal.startTime ?? activeDay}`
    ),
    sport_key: getSignalSportKey(sport),
    commence_time: signal.startTime ?? `${activeDay}T12:00:00-04:00`,
    completed: false,
    home_team: signal.homeTeam ?? "",
    away_team: signal.awayTeam ?? "",
    scores: [],
  };
}

const groupedSignalLiveGames = useMemo(() => {
  const sportsToShow: SportTab[] =
    selectedSport === "TOP"
      ? [...scoreBoardSports]
      : isUnavailableSport(selectedSport)
      ? []
      : [selectedSport];

  return sportsToShow
    .map((sport) => {
      const top5 = getTop5BySport(
        sport,
        activeMlbTop5Data,
        activeNbaTop5Data,
        activeNhlTop5Data,
        activeSoccerTop5Data
      );

      const games = getSignalSourceForSport(sport)
        .filter(
          (signal) =>
            signal.awayTeam &&
            signal.homeTeam &&
            signal.pick &&
            !top5.some((pick) =>
              isSameMatch(
                {
                  away_team: signal.awayTeam ?? "",
                  home_team: signal.homeTeam ?? "",
                  commence_time: signal.startTime ?? `${activeDay}T12:00:00-04:00`,
                } as LiveScore,
                pick
              )
            )
        )
        .map((signal) => signalToLiveScore(signal, sport))
        .sort(
          (a, b) =>
            new Date(a.commence_time).getTime() -
            new Date(b.commence_time).getTime()
        );

      return {
        leagueKey: getSignalSportKey(sport),
        title: sport === "SOCCER" ? "SOCCER Signals" : getLeagueDisplayName(getSignalSportKey(sport)),
        sport,
        games,
      };
    })
    .filter((group) => group.games.length > 0);
}, [
  selectedSport,
  filteredLiveGames,
  mlbSignalsData,
  nbaSignalsData,
  nhlSignalsData,
  soccerSignalsLiveData,
  activeMlbTop5Data,
  activeNbaTop5Data,
  activeNhlTop5Data,
  activeSoccerTop5Data,
]);

function getLiveDisplayName(teamName: string) {
  return getTeamData(teamName)?.shortName ?? teamName;
}

function getLiveGameIdentity(game: LiveScore) {
  const away = normalizeName(game.away_team);
  const home = normalizeName(game.home_team);
  const day = getGameDayKey(game.commence_time);

  return [away, home].sort().join("|") + `|${day}`;
}

function mergeLiveScoreSnapshots(currentGames: LiveScore[], nextGames: LiveScore[]) {
  const merged = new Map<string, LiveScore>();

  currentGames.forEach((game) => {
    merged.set(getLiveGameIdentity(game), game);
  });

  nextGames.forEach((game) => {
    merged.set(getLiveGameIdentity(game), {
      ...merged.get(getLiveGameIdentity(game)),
      ...game,
    });
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
  );
}

function getLiveScoresStorageKey(sport: SportTab, dateKey: string) {
  return `atlas_live_scores_${sport}_${dateKey}`;
}

function handleLiveGameClick(game: LiveScore, sport: SportTab) {
  router.push(
    `/live-game?sport=${encodeURIComponent(sport)}&gameId=${encodeURIComponent(
      game.id
    )}&awayTeam=${encodeURIComponent(game.away_team)}&homeTeam=${encodeURIComponent(
      game.home_team
    )}&commenceTime=${encodeURIComponent(
      game.commence_time
    )}&returnSport=${encodeURIComponent(sport)}&returnSection=${encodeURIComponent(
      appSection
    )}&returnView=${encodeURIComponent(viewMode)}&returnDay=${encodeURIComponent(
      activeDay
    )}`
  );
}

function findOddsGameForLive(
  liveGame: LiveScore,
  oddsGames: OddsGame[]
) {
  const liveAway = normalizeName(liveGame.away_team);
  const liveHome = normalizeName(liveGame.home_team);

  return (
    oddsGames.find((game) => {
      const away = normalizeName(game.away_team);
      const home = normalizeName(game.home_team);

      return (
        (liveAway === away && liveHome === home) ||
        (liveAway === home && liveHome === away)
      );
    }) || null
  );
}

useEffect(() => {
  const sectionFromUrl = searchParams.get("section") as AppSection | null;
  const sportFromUrl = searchParams.get("sport") as SportTab | null;
  const viewFromUrl = searchParams.get("view") as "odds" | "live" | null;
  const dayFromUrl = searchParams.get("day");

  if (
    sectionFromUrl === "signals" ||
    sectionFromUrl === "scores" ||
    sectionFromUrl === "bankroll" ||
    sectionFromUrl === "news" ||
    sectionFromUrl === "alerts" ||
    sectionFromUrl === "more"
  ) {
    setAppSection(sectionFromUrl);
  }

  if (sportFromUrl && sportsTabs.includes(sportFromUrl)) {
    setSelectedSport(sportFromUrl);
  }

  if (viewFromUrl === "live" || viewFromUrl === "odds") {
    setViewMode(viewFromUrl);
  }

  if (dayFromUrl) {
    setActiveDay(resolveScheduleDay(dayFromUrl));
  }
}, [searchParams]);

useEffect(() => {
  if (appSection === "news") {
    setPulseImpactFilter("TEAM");
  }
}, [appSection]);

useEffect(() => {
  if (appSection !== "news") return;

  const controller = new AbortController();

  async function loadTeamImpactEvents() {
    setPulseLoading(true);

    try {
      const confidenceParam =
        pulseImpactFilter === "HIGH" || pulseImpactFilter === "MEDIUM" || pulseImpactFilter === "LOW"
          ? pulseImpactFilter
          : "ALL";
      const params = new URLSearchParams({
        sport: pulseSportFilter,
        confidence: confidenceParam,
        limit: "250",
      });
      const [teamResponse, marketResponse, intelligenceResponse] = await Promise.all([
        fetch(`/api/impact/team-impact?${params.toString()}`, { signal: controller.signal }),
        fetch(`/api/impact/market-impact?${params.toString()}`, { signal: controller.signal }),
        fetch(`/api/impact/atlas-intelligence?${params.toString()}`, { signal: controller.signal }),
      ]);
      const teamData = (await teamResponse.json()) as { events?: TeamImpactEvent[] };
      const marketData = (await marketResponse.json()) as { events?: MarketImpactEvent[] };
      const intelligenceData = (await intelligenceResponse.json()) as { events?: AtlasIntelligenceEvent[] };

      setTeamImpactEvents(Array.isArray(teamData.events) ? teamData.events : []);
      setMarketImpactEvents(Array.isArray(marketData.events) ? marketData.events : []);
      setAtlasIntelligenceEvents(Array.isArray(intelligenceData.events) ? intelligenceData.events : []);
      setPulseLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (!controller.signal.aborted) {
        setTeamImpactEvents([]);
        setMarketImpactEvents([]);
        setAtlasIntelligenceEvents([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setPulseLoading(false);
      }
    }
  }

  loadTeamImpactEvents();
  const interval = window.setInterval(loadTeamImpactEvents, 5 * 60 * 1000);

  return () => {
    controller.abort();
    window.clearInterval(interval);
  };
}, [appSection, pulseSportFilter, pulseImpactFilter]);

  useEffect(() => {
  async function loadGames() {
    try {
      setLoading(true);

      if (selectedSport === "TOP") {
        setGames([]);
        return;
      }

      if (selectedSport === "SOCCER") {
        const soccerLeagues = [
          "soccer_epl",
          "soccer_spain_la_liga",
          "soccer_italy_serie_a",
          "soccer_germany_bundesliga",
          "soccer_france_ligue_one",
          "soccer_uefa_champs_league",
          "soccer_uefa_europa_league",
          "soccer_uefa_europa_conference_league",
          "soccer_fifa_world_cup",
          "soccer_usa_mls",
          "soccer_mexico_ligamx",
          "soccer_fa_cup",
          "soccer_spain_copa_del_rey",
        ];

        const responses = await Promise.all(
          soccerLeagues.map(async (league) => {
            const res = await fetch(`/api/odds?sport=${league}`, {
              cache: "no-store",
            });

            const data = await res.json();
            return Array.isArray(data) ? (data as OddsGame[]) : [];
          })
        );

        const allSoccerGames = responses.flat();
        const now = new Date();

        const filteredSoccerGames = allSoccerGames.filter((game) => {
          const gameDate = new Date(game.commence_time);
          const diffHours =
            (gameDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          return diffHours >= -6 && diffHours <= 18;
        });

        setGames(filteredSoccerGames);
        return;
      }

      const regularSportMap: Record<
        Exclude<SportTab, "TOP" | "SOCCER">,
        string
      > = {
        NHL: "icehockey_nhl",
        NBA: "basketball_nba",
        MLB: "baseball_mlb",
        NFL: "americanfootball_nfl",
      };

      const sport =
        regularSportMap[
          selectedSport as Exclude<SportTab, "TOP" | "SOCCER">
        ];

      const res = await fetch(`/api/odds?sport=${sport}`, {
        cache: "no-store",
      });

      const data = await res.json();
      setGames(Array.isArray(data) ? (data as OddsGame[]) : []);
    } catch (error) {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  if (viewMode === "odds") {
    loadGames();
  }
}, [selectedSport, viewMode]);

useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function hasLiveGames(games: LiveScore[]) {
    return games.some((game) => isGameLive(game));
  }

  function hasUpcomingGames(games: LiveScore[]) {
    const now = Date.now();

    return games.some((game) => {
      const start = new Date(game.commence_time).getTime();
      const diffMinutes = (start - now) / (1000 * 60);

      return diffMinutes >= 0 && diffMinutes <= 120;
    });
  }

  function getRefreshDelay(games: LiveScore[]) {
    if (document.visibilityState === "hidden") {
      return 120000; // background: 2 min
    }

    if (hasLiveGames(games)) {
      return 15000; // live games: 15 sec
    }

    if (hasUpcomingGames(games)) {
      return 30000; // games within 2h: 30 sec
    }

    return 180000; // quiet period: 3 min
  }

  async function fetchScoreSnapshotForSport(sport: SportTab) {
    const scoresRes = await fetch(`/api/scores?sport=${sport}&date=${activeDay}`, {
      cache: "no-store",
    });
    const scoresData = await scoresRes.json();
    let apiLiveGames = Array.isArray(scoresData)
      ? (scoresData as LiveScore[])
      : [];

    if (apiLiveGames.length === 0 && activeDay > getRelativeDayKey(0)) {
      const scheduledOddsGames = await fetchScoreOddsForSport(sport).catch(() => []);
      apiLiveGames = scheduledOddsGames
        .map((game) => oddsGameToScheduledScore(game, sport))
        .filter((game) => getGameDayKey(game.commence_time) === activeDay);
    }

    const storageKey = getLiveScoresStorageKey(sport, activeDay);
    let storedLiveGames: LiveScore[] = [];

    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      storedLiveGames = Array.isArray(parsed) ? parsed : [];
    } catch {
      storedLiveGames = [];
    }

    const nextLiveGames = mergeLiveScoreSnapshots(storedLiveGames, apiLiveGames).filter(
      (game) => getGameDayKey(game.commence_time) === activeDay
    );

    try {
      localStorage.setItem(storageKey, JSON.stringify(nextLiveGames));
    } catch {
      // Scores still render even if local storage is unavailable.
    }

    return nextLiveGames;
  }

  async function fetchScoreOddsForSport(sport: SportTab) {
    if (sport === "SOCCER") {
      const soccerLeagues = [
        "soccer_epl",
        "soccer_spain_la_liga",
        "soccer_italy_serie_a",
        "soccer_germany_bundesliga",
        "soccer_france_ligue_one",
        "soccer_uefa_champs_league",
        "soccer_uefa_europa_league",
        "soccer_uefa_europa_conference_league",
        "soccer_usa_mls",
        "soccer_mexico_ligamx",
        "soccer_fa_cup",
        "soccer_spain_copa_del_rey",
      ];

      const oddsResponses = await Promise.all(
        soccerLeagues.map(async (league) => {
          try {
            const res = await fetch(`/api/odds?sport=${league}`, {
              cache: "no-store",
            });

            const data = await res.json();
            return Array.isArray(data) ? (data as OddsGame[]) : [];
          } catch {
            return [];
          }
        })
      );

      return oddsResponses.flat();
    }

    const sportMap: Partial<Record<SportTab, string>> = {
      NHL: "icehockey_nhl",
      NBA: "basketball_nba",
      MLB: "baseball_mlb",
    };
    const apiSport = sportMap[sport];

    if (!apiSport) return [];

    const oddsRes = await fetch(`/api/odds?sport=${apiSport}`, {
      cache: "no-store",
    });
    const oddsData = await oddsRes.json();

    return Array.isArray(oddsData) ? (oddsData as OddsGame[]) : [];
  }

  async function loadLiveGames() {
    if (appSection !== "signals" && appSection !== "scores") return;
    if (appSection === "signals" && viewMode !== "live") return;

    try {
      setLiveLoading(true);

      if (selectedSport === "TOP") {
        const scoreResponses = await Promise.all(
          scoreBoardSports.map((sport) =>
            fetchScoreSnapshotForSport(sport).catch(() => [])
          )
        );
        const nextLiveGames = scoreResponses
          .flat()
          .sort(
            (a, b) =>
              new Date(a.commence_time).getTime() -
              new Date(b.commence_time).getTime()
          );

        if (cancelled) return;

        setLiveGames(nextLiveGames);

        const oddsResponses = await Promise.all(
          scoreBoardSports.map((sport) =>
            fetchScoreOddsForSport(sport).catch(() => [])
          )
        );

        if (!cancelled) {
          setLiveOddsGames(oddsResponses.flat());
        }

        const delay = getRefreshDelay(nextLiveGames);

        if (!cancelled) {
          timeoutId = setTimeout(loadLiveGames, delay);
        }

        return;
      }

      if (isUnavailableSport(selectedSport)) {
        setLiveGames([]);
        setLiveOddsGames([]);
        return;
      }

      const nextLiveGames = await fetchScoreSnapshotForSport(selectedSport);

      if (cancelled) return;

      setLiveGames(nextLiveGames);

      const oddsGames = await fetchScoreOddsForSport(selectedSport);

      if (!cancelled) {
        setLiveOddsGames(oddsGames);
      }

      const delay = getRefreshDelay(nextLiveGames);

      if (!cancelled) {
        timeoutId = setTimeout(loadLiveGames, delay);
      }
    } catch (error) {
      if (!cancelled) {
        try {
          const stored = localStorage.getItem(
            getLiveScoresStorageKey(selectedSport, activeDay)
          );
          const parsed = stored ? JSON.parse(stored) : [];
          setLiveGames(Array.isArray(parsed) ? parsed : []);
        } catch {
          setLiveGames([]);
        }
        setLiveOddsGames([]);
        timeoutId = setTimeout(loadLiveGames, 60000);
      }
    } finally {
      if (!cancelled) {
        setLiveLoading(false);
      }
    }
  }

  function handleVisibilityChange() {
    if (timeoutId) clearTimeout(timeoutId);

    if (document.visibilityState === "visible") {
      loadLiveGames();
    } else {
      timeoutId = setTimeout(loadLiveGames, 120000);
    }
  }

  loadLiveGames();

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    cancelled = true;

    if (timeoutId) clearTimeout(timeoutId);

    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [viewMode, appSection, selectedSport, activeDay]);

useEffect(() => {
  if (!mlbTop5Data.top5 || mlbTop5Data.top5.length === 0) return;

  const mlbTopSignal =
    mlbTop5Data.top5.find((pick) => pick.isTopSignal) ||
    mlbTop5Data.top5[0];

  if (!mlbTopSignal) return;

console.log("MLB TOP SIGNAL:", mlbTopSignal);

  fetch("/api/save-top-signal/mlb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
  mlbTop5Data.top5?.[0]?.startTime
    ? new Date(mlbTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      })
    : new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "MLB",
      awayTeam: mlbTopSignal.awayTeam ?? "",
      homeTeam: mlbTopSignal.homeTeam ?? "",
      pick: mlbTopSignal.pick ?? "",
      market:
        String(mlbTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(mlbTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(mlbTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: mlbTopSignal.startTime ?? null,
    }),
  })
    .then((res) => res.json())
    .then((data) => console.log("MLB saved:", data))
    .catch((err) => console.log("MLB error:", err));
}, []);

useEffect(() => {
  if (!mlbTop5Data.top5 || mlbTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/mlb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        mlbTop5Data.top5?.[0]?.startTime
          ? new Date(mlbTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: mlbTop5Data.top5,
    }),
  });
}, [mlbTop5Data]);

useEffect(() => {
  if (!nbaTop5Data.top5 || nbaTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/nba", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nbaTop5Data.top5?.[0]?.startTime
          ? new Date(nbaTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: nbaTop5Data.top5,
    }),
  });
}, [nbaTop5Data]);

useEffect(() => {
  if (!nhlTop5Data.top5 || nhlTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/nhl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nhlTop5Data.top5?.[0]?.startTime
          ? new Date(nhlTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: nhlTop5Data.top5,
    }),
  });
}, [nhlTop5Data]);

useEffect(() => {
  if (!soccerTop5Data.top5 || soccerTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/soccer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        soccerTop5Data.top5?.[0]?.startTime
          ? new Date(soccerTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: soccerTop5Data.top5,
    }),
  });
}, [soccerTop5Data]);

useEffect(() => {
  const nbaTopSignal =
    nbaTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    nbaTop5Data.top5?.[0];

  if (!nbaTopSignal) return;

  fetch("/api/save-top-signal/nba", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nbaTop5Data.top5?.[0]?.startTime
          ? new Date(nbaTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      sport: "NBA",
      awayTeam: nbaTopSignal.awayTeam ?? "",
      homeTeam: nbaTopSignal.homeTeam ?? "",
      pick: nbaTopSignal.pick ?? "",
      market:
        String(nbaTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(nbaTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(nbaTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: nbaTopSignal.startTime ?? null,
    }),
  });
}, [nbaTop5Data]);

useEffect(() => {
  const nhlTopSignal =
    nhlTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    nhlTop5Data.top5?.[0];

  if (!nhlTopSignal) return;

  fetch("/api/save-top-signal/nhl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "NHL",
      awayTeam: nhlTopSignal.awayTeam ?? "",
      homeTeam: nhlTopSignal.homeTeam ?? "",
      pick: nhlTopSignal.pick ?? "",
      market:
        String(nhlTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(nhlTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(nhlTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: nhlTopSignal.startTime ?? null,
    }),
  });
}, [nhlTop5Data]);

useEffect(() => {
  const soccerTopSignal =
    soccerTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    soccerTop5Data.top5?.[0];

  if (!soccerTopSignal) return;

  fetch("/api/save-top-signal/soccer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "SOCCER",
      awayTeam: soccerTopSignal.awayTeam ?? "",
      homeTeam: soccerTopSignal.homeTeam ?? "",
      pick: soccerTopSignal.pick ?? "",
      market:
        String(soccerTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(soccerTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(soccerTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: soccerTopSignal.startTime ?? null,
    }),
  });
}, [soccerTop5Data]);

const isTopTab = selectedSport === "TOP";

useEffect(() => {
  if (appSection !== "signals") return;

  async function loadRecord() {
    try {
      const endpoint = getRecordEndpoint(selectedSport, "top-signal");

      setMlbRecord(emptyRecordStats());
setNbaRecord(emptyRecordStats());
setNhlRecord(emptyRecordStats());
setSoccerRecord(emptyRecordStats());

      if (!endpoint) return;

      const res = await fetch(`${endpoint}?date=${encodeURIComponent(activeDay)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
  const recordData = toRecordStats(data);

  if (selectedSport === "MLB") {
    setMlbRecord(recordData);
  }

  if (selectedSport === "NBA") {
    setNbaRecord(recordData);
  }

  if (selectedSport === "NHL") {
    setNhlRecord(recordData);
  }

  if (selectedSport === "SOCCER") {
    setSoccerRecord(recordData);
  }
}
    } catch (err) {
      console.log("Error loading record");
    }
  }

  loadRecord();
}, [appSection, selectedSport, activeDay]);

useEffect(() => {
  if (appSection !== "signals") return;

  async function loadTop5Record() {
    try {
      const endpoint = getRecordEndpoint(selectedSport, "top5");

      setTop5RecordStats(emptyRecordStats());

      if (!endpoint) return;

      const res = await fetch(`${endpoint}?date=${encodeURIComponent(activeDay)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setTop5RecordStats(toRecordStats(data));
      }
    } catch (err) {
      console.log("Error loading top 5 record");
    }
  }

  loadTop5Record();
}, [appSection, selectedSport, activeDay]);

useEffect(() => {
  if (appSection !== "signals") return;

  async function loadHistory() {
    try {
      let endpoint = "";

      setTopSignalHistory([]);

      if (selectedSport === "MLB") {
        endpoint = "/api/top-signal-history/mlb";
      }

      if (selectedSport === "NHL") {
  endpoint = "/api/top-signal-history/nhl";
}

if (selectedSport === "NBA") {
  endpoint = "/api/top-signal-history/nba";
}

if (selectedSport === "SOCCER") {
  endpoint = "/api/top-signal-history/soccer";
}

      if (!endpoint) return;

      const res = await fetch(`${endpoint}?date=${encodeURIComponent(activeDay)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setTopSignalHistory(data.history);
      }
    } catch (err) {
      console.log("Error loading history");
    }
  }

  loadHistory();
}, [appSection, selectedSport, activeDay]);

useEffect(() => {
  if (appSection !== "signals") return;

  async function loadTop5History() {
    try {
      let endpoint = "";

      if (selectedSport === "NHL") {
  endpoint = "/api/top5-history-live/nhl";
}

if (selectedSport === "MLB") {
  endpoint = "/api/top5-history-live/mlb";
}

if (selectedSport === "NBA") {
  endpoint = "/api/top5-history-live/nba";
}

if (selectedSport === "SOCCER") {
  endpoint = "/api/top5-history-live/soccer";
}

      if (!endpoint) {
        setTop5History([]);
        return;
      }

      const res = await fetch(`${endpoint}?date=${encodeURIComponent(activeDay)}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setTop5History(data.history);
      } else {
        setTop5History([]);
      }
    } catch (err) {
      console.log("Error loading top 5 history");
      setTop5History([]);
    }
  }

  loadTop5History();
}, [appSection, selectedSport, viewMode, activeDay]);

const subsPicks = useMemo(() => {
  return getSubPicksForUser(
    userAccess,
    selectedSport,
    activeMlbTop5Data,
    activeNbaTop5Data,
    activeNhlTop5Data,
    activeSoccerTop5Data
  );
}, [
  userAccess,
  selectedSport,
  activeMlbTop5Data,
  activeNbaTop5Data,
  activeNhlTop5Data,
  activeSoccerTop5Data,
]);

const subscriptionSportGroups = useMemo(() => {
  const sportsToRender: CheckoutSport[] =
    hasAllSportsAccessPlan(userAccess.plan)
      ? activeSubscriptionSports
      : selectedSport !== "TOP" && checkoutSports.includes(selectedSport as CheckoutSport)
      ? [selectedSport as CheckoutSport]
      : userAccess.sports.filter((sport): sport is CheckoutSport =>
          checkoutSports.includes(sport as CheckoutSport)
        );

  return sportsToRender
    .map((sport) => ({
      sport,
      picks:
        userAccess.plan === "admin"
          ? sortPicksByAtlasValue(
              getTop5BySport(
                sport,
                activeMlbTop5Data,
                activeNbaTop5Data,
                activeNhlTop5Data,
                activeSoccerTop5Data
              )
            )
          : getSubPicksForUser(
              userAccess,
              sport,
              activeMlbTop5Data,
              activeNbaTop5Data,
              activeNhlTop5Data,
              activeSoccerTop5Data
            ),
    }))
    .filter((group) => group.picks.length > 0);
}, [
  activeSubscriptionSports,
  activeMlbTop5Data,
  activeNbaTop5Data,
  activeNhlTop5Data,
  activeSoccerTop5Data,
  selectedSport,
  userAccess,
]);

const visibleSubscriptionPickCount = subscriptionSportGroups.reduce(
  (total, group) => total + group.picks.length,
  0
);

const selectedTopSignalRecord =
  selectedSport === "MLB"
    ? mlbRecord
    : selectedSport === "NBA"
    ? nbaRecord
    : selectedSport === "NHL"
    ? nhlRecord
    : selectedSport === "SOCCER"
    ? soccerRecord
    : emptyRecordStats();

const eliteTopSignals = useMemo(() => {
  const sorted = sortPicksByStartTime(topSignals ?? []);

  if (userAccess.plan === "admin") return sorted;

  if (userAccess.unlocks.topPlay) {
    return sorted.slice(0, 1);
  }

  return sorted.filter((pick) =>
    userAccess.unlocks.topSignals.includes(pick.sport as SportTab)
  );
}, [topSignals, userAccess]);

const visibleTopSignalHistory = useMemo(() => {
  const today = getRelativeDayKey(0);
  return topSignalHistory.filter((item) => item.date !== today);
}, [topSignalHistory]);

const hasPaidSubscription =
  authSession.authenticated &&
  userAccess.plan !== "free" &&
  userAccess.plan !== "admin";

const shouldShowSubscriptionPlans =
  viewMode === "odds" &&
  !isTopTab &&
  !isUnavailableSport(selectedSport) &&
  !hasSportAccess(userAccess, selectedSport);

const topSignalProductBySport: Partial<Record<SportTab, CheckoutProduct>> = {
  MLB: "top_signal_mlb",
  NBA: "top_signal_nba",
  NHL: "top_signal_nhl",
  SOCCER: "top_signal_soccer",
  NFL: "top_signal_nfl",
};

const selectedTopSignalProduct = topSignalProductBySport[selectedSport];
const hasSelectedTopSignalUnlock =
  userAccess.plan === "admin" ||
  userAccess.unlocks.topSignals.includes(selectedSport);
const hasTopPlayUnlock = userAccess.plan === "admin" || userAccess.unlocks.topPlay;
const selectedPrecisionSignalSport: CheckoutSport = selectedPackSport;

const selectedTop5Count = getTop5BySport(
  selectedSport,
  activeMlbTop5Data,
  activeNbaTop5Data,
  activeNhlTop5Data,
  activeSoccerTop5Data
).length;

const availableTeamsForFollowing = useMemo(() => {
  const teams = new Map<string, string>();

  filteredLiveGames.forEach((game) => {
    teams.set(normalizeName(game.away_team), game.away_team);
    teams.set(normalizeName(game.home_team), game.home_team);
  });

  return Array.from(teams.entries()).map(([key, name]) => ({ key, name }));
}, [filteredLiveGames]);

const followedGames = useMemo(() => {
  const followedTeamSet = new Set(followedTeams);

  return filteredLiveGames.filter((game) => {
    return (
      followedSports.includes(getLiveSportFromKey(game.sport_key)) ||
      followedTeamSet.has(normalizeName(game.away_team)) ||
      followedTeamSet.has(normalizeName(game.home_team))
    );
  });
}, [filteredLiveGames, followedSports, followedTeams]);

const atlasAlerts = useMemo<AtlasAlert[]>(() => {
  const alerts: AtlasAlert[] = [];
  const now = Date.now();
  const upcomingWindowMs = 45 * 60 * 1000;

  if (selectedTop5Count > 0) {
    alerts.push({
      id: `${selectedSport}-top5-ready`,
      tone: "yellow",
      label: "Top 3",
      title: `${selectedSport} Top 3 Signals are available`,
      body:
        userAccess.plan === "free"
          ? "Premium subscription signals are detected. Subscribe to unlock the Top 3 board."
          : `${selectedTop5Count} premium picks are ready for the selected slate.`,
      action: () => {
        setAppSection("signals");
        setViewMode("odds");
      },
    });
  }

  const topSignal = topSignals?.find((pick) => pick.sport === selectedSport) ?? topSignals?.[0];

  if (topSignal && canViewTopTab(userAccess)) {
    alerts.push({
      id: `${selectedSport}-top-signal-ready`,
      tone: "cyan",
      label: "Top Signal",
      title: "Top Signal ready",
      body: `${topSignal.sport}: ${topSignal.awayTeam ?? ""} vs ${topSignal.homeTeam ?? ""}`,
      action: () => {
        setSelectedSport("TOP");
        setAppSection("signals");
        setViewMode("odds");
      },
    });
  }

  filteredLiveGames
    .filter((game) => {
      const start = new Date(game.commence_time).getTime();
      return start >= now && start - now <= upcomingWindowMs;
    })
    .slice(0, 3)
    .forEach((game) => {
      const sport = getLiveSportFromKey(game.sport_key);
      alerts.push({
        id: `${game.id}-starting-soon`,
        tone: "white",
        label: "Starting Soon",
        title: `${getLiveDisplayName(game.away_team)} vs ${getLiveDisplayName(game.home_team)}`,
        body: `Starts at ${formatTime(game.commence_time)} ET.`,
        action: () => handleLiveGameClick(game, sport),
      });
    });

  filteredLiveGames
    .filter((game) => isGameLive(game))
    .slice(0, 3)
    .forEach((game) => {
      const sport = getLiveSportFromKey(game.sport_key);
      alerts.push({
        id: `${game.id}-live-now`,
        tone: "green",
        label: "Live",
        title: `${getLiveDisplayName(game.away_team)} vs ${getLiveDisplayName(game.home_team)}`,
        body: getGameMinute(game),
        action: () => handleLiveGameClick(game, sport),
      });
    });

  subsPicks
    .filter((pick) => {
      const status = String(pick.status ?? "").toUpperCase();
      return status === "CONFIRMED" || status === "REMOVED" || status === "DOWNGRADED";
    })
    .slice(0, 4)
    .forEach((pick, index) => {
      const status = String(pick.status ?? "").toUpperCase();
      alerts.push({
        id: `${selectedSport}-validation-${index}`,
        tone: status === "CONFIRMED" ? "green" : status === "REMOVED" ? "red" : "yellow",
        label: status,
        title: `${pick.awayTeam ?? ""} vs ${pick.homeTeam ?? ""}`,
        body:
          status === "CONFIRMED"
            ? "This signal has been confirmed by the pregame validation flow."
            : status === "REMOVED"
            ? "This signal was removed before game time."
            : "This signal was downgraded before game time.",
        action: () => {
          setAppSection("signals");
          setViewMode("odds");
        },
      });
    });

  if (canViewStatsAndHistory(userAccess) && top5RecordStats.decided > 0) {
    alerts.push({
      id: `${selectedSport}-record-update`,
      tone: "cyan",
      label: "Record",
      title: "Stats updated",
      body: `Top 5 record is ${top5RecordStats.wins}-${top5RecordStats.losses} with ${top5RecordStats.winRate}% win rate.`,
      action: () => setAppSection("more"),
    });
  }

  return alerts.slice(0, 12);
}, [
  selectedSport,
  selectedTop5Count,
  userAccess,
  topSignals,
  filteredLiveGames,
  subsPicks,
  top5RecordStats,
  followedGames,
]);

function toggleFollowedSport(sport: SportTab) {
  const isFollowing = followedSports.includes(sport);

  setFollowedSports((current) =>
    isFollowing
      ? current.filter((item) => item !== sport)
      : [...current, sport]
  );

  if (authSession.authenticated) {
    fetch("/api/user-follows", {
      method: isFollowing ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followType: "sport", sport }),
    }).catch(() => undefined);
  }
}

function toggleFollowedTeam(teamName: string) {
  const key = normalizeName(teamName);
  const isFollowing = followedTeams.includes(key);

  setFollowedTeams((current) =>
    isFollowing
      ? current.filter((item) => item !== key)
      : [...current, key]
  );

  if (authSession.authenticated) {
    fetch("/api/user-follows", {
      method: isFollowing ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followType: "team",
        sport: selectedSport,
        teamKey: key,
        teamName,
      }),
    }).catch(() => undefined);
  }
}

const sectionTitle =
  appSection === "signals"
    ? "Signals"
    : appSection === "scores"
    ? "Scores"
    : appSection === "bankroll"
    ? "Atlas Bankroll"
    : appSection === "news"
    ? "Market Impact"
    : appSection === "alerts"
    ? "My Atlas"
    : "More";

const sectionEyebrow =
  appSection === "signals"
    ? "Atlas Signals"
    : appSection === "scores"
    ? "Live Center"
    : appSection === "bankroll"
    ? "Bankroll"
    : appSection === "news"
    ? ""
    : appSection === "alerts"
    ? "My Atlas"
    : "Account";

const pulseImpactFilters: Array<{ label: string; value: ImpactFeedFilter }> = [
  { label: "ALL", value: "ALL" },
  { label: "TEAM", value: "TEAM" },
  { label: "MARKET", value: "MARKET" },
  { label: "INTELLIGENCE", value: "INTELLIGENCE" },
];
const pulseImpactTabItems = pulseImpactFilters.map((filter) => ({ id: filter.value, label: filter.label }));

function pulseSportToOfficialSport(sport: "ALL" | PulseSport): OfficialSelectedSport {
  if (sport === "ALL") return "all";
  return officialSportCodeToSelectedSport[sport as keyof typeof officialSportCodeToSelectedSport] ?? "all";
}

function officialSportToPulseSport(sport: OfficialSelectedSport): "ALL" | PulseSport {
  if (sport === "all") return "ALL";
  return officialSelectedSportToSportCode[sport] as PulseSport;
}

const pulseBaseItems =
  pulseSportFilter === "MLB"
    ? pulseMlbItems
    : pulseSportFilter === "ALL"
    ? [
        ...pulseMlbItems,
        ...createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport !== "MLB")),
      ]
    : createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport === pulseSportFilter));

const filteredPulseItems = pulseBaseItems.filter((item) => {
  if (!isCurrentMarketImpactItem(item)) return false;
  const sportMatches = pulseSportFilter === "ALL" || item.sport === pulseSportFilter;
  const impactMatches = pulseImpactFilter === "ALL" || (pulseImpactFilter !== "INTELLIGENCE" && item.impact === pulseImpactFilter);

  return sportMatches && impactMatches;
});

const currentFilteredPulseItems = dedupeMarketImpactItems(filteredPulseItems);

const currentFilteredTeamImpactEvents = teamImpactEvents
  .filter((item) => pulseSportFilter === "ALL" || item.sport === pulseSportFilter)
  .filter(() => pulseImpactFilter !== "MARKET" && pulseImpactFilter !== "INTELLIGENCE")
  .filter((item) => pulseImpactFilter === "ALL" || pulseImpactFilter === "TEAM" || item.confidence === pulseImpactFilter)
  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

type ConsolidatedMarketImpactEvent = MarketImpactEvent & {
  movementsToday: MarketImpactEvent[];
};

function getMarketImpactGroupKey(item: MarketImpactEvent) {
  const selectionKey = item.market === "Totals" ? "market-total" : item.selection.trim().toLowerCase();

  return [
    item.sport,
    item.awayTeam.trim().toLowerCase(),
    item.homeTeam.trim().toLowerCase(),
    item.market,
    selectionKey,
  ].join("|");
}

function getMarketImpactLatestTime(item: MarketImpactEvent) {
  const parsed = Date.parse(item.latestMoveAt ?? item.publishedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function consolidateMarketImpactEvents(items: MarketImpactEvent[]): ConsolidatedMarketImpactEvent[] {
  const groups = new Map<string, MarketImpactEvent[]>();

  items.forEach((item) => {
    const key = getMarketImpactGroupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return [...groups.values()]
    .map((group) => {
      const movementsToday = [...group].sort((a, b) => getMarketImpactLatestTime(a) - getMarketImpactLatestTime(b));
      const latest = movementsToday[movementsToday.length - 1];

      return {
        ...latest,
        eventId: getMarketImpactGroupKey(latest),
        movementsToday,
      };
    })
    .sort((a, b) => getMarketImpactLatestTime(b) - getMarketImpactLatestTime(a));
}

const consolidatedMarketImpactEvents = consolidateMarketImpactEvents(
  marketImpactEvents
    .filter((item) => pulseSportFilter === "ALL" || item.sport === pulseSportFilter)
    .filter(() => pulseImpactFilter !== "TEAM" && pulseImpactFilter !== "INTELLIGENCE")
    .filter((item) => pulseImpactFilter === "ALL" || pulseImpactFilter === "MARKET" || item.confidence === pulseImpactFilter)
);

type UnifiedImpactFeedItem =
  | { kind: "team"; item: TeamImpactEvent; publishedAt: string; confidence: PulseImpact; sport: PulseSport; id: string }
  | { kind: "market"; item: ConsolidatedMarketImpactEvent; publishedAt: string; confidence: PulseImpact; sport: PulseSport; id: string }
  | { kind: "intelligence"; item: AtlasIntelligenceEvent; publishedAt: string; confidence: PulseImpact; sport: PulseSport; id: string };

const currentUnifiedImpactItems: UnifiedImpactFeedItem[] = [
  ...currentFilteredTeamImpactEvents.map((item) => ({
    kind: "team" as const,
    item,
    publishedAt: item.publishedAt,
    confidence: item.confidence,
    sport: item.sport,
    id: `team-${item.eventId}`,
  })),
  ...consolidatedMarketImpactEvents
    .map((item) => ({
      kind: "market" as const,
      item,
      publishedAt: item.latestMoveAt ?? item.publishedAt,
      confidence: item.confidence,
      sport: item.sport,
      id: `market-${item.eventId}`,
    })),
  ...atlasIntelligenceEvents
    .filter((item) => pulseSportFilter === "ALL" || item.sport === pulseSportFilter)
    .filter(() => pulseImpactFilter !== "TEAM" && pulseImpactFilter !== "MARKET")
    .filter((item) => pulseImpactFilter === "ALL" || pulseImpactFilter === "INTELLIGENCE" || item.confidence === pulseImpactFilter)
    .map((item) => ({
      kind: "intelligence" as const,
      item,
      publishedAt: item.publishedAt,
      confidence: item.confidence,
      sport: item.sport,
      id: `intelligence-${item.eventId}`,
    })),
].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

const impactTeamCount = teamImpactEvents.filter((item) => pulseSportFilter === "ALL" || item.sport === pulseSportFilter).length;
const impactMarketCount = consolidatedMarketImpactEvents.length;
const impactIntelligenceCount = atlasIntelligenceEvents.filter((item) => pulseSportFilter === "ALL" || item.sport === pulseSportFilter).length;
const impactLastUpdateLabel = pulseLastUpdatedAt ? formatTeamImpactTimestamp(pulseLastUpdatedAt) : "Live";
const impactLastUpdateShortLabel = pulseLastUpdatedAt
  ? formatTeamImpactTimestamp(pulseLastUpdatedAt)
  : "Live";

function getPulseImpactClasses(impact: PulseImpact) {
  return {
    card: "border-cyan-300/18 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.075),transparent_38%),linear-gradient(180deg,rgba(6,18,31,0.86),rgba(3,8,20,0.94))] shadow-[0_0_18px_rgba(34,211,238,0.08)]",
    badge: "border-white/10 bg-white/[0.045] text-white/58",
    dot: impact === "HIGH" ? "bg-red-400" : impact === "MEDIUM" ? "bg-amber-300" : "bg-cyan-300",
  };
}

function getImpactConfidenceBadgeClass(confidence: PulseImpact) {
  if (confidence === "HIGH") return "border-red-400/40 bg-red-400/10 text-red-200";
  if (confidence === "MEDIUM") return "border-amber-300/40 bg-amber-300/10 text-amber-200";
  return "border-sky-300/40 bg-sky-300/10 text-sky-200";
}

function getImpactConfidenceLabel(kind: UnifiedImpactFeedItem["kind"], confidence: PulseImpact) {
  if (kind === "market" && confidence === "HIGH") return "HIGH ACTIVITY";
  return confidence;
}

function getImpactAccent(kind: UnifiedImpactFeedItem["kind"]) {
  if (kind === "market") {
    return {
      label: "MARKET IMPACT",
      icon: "▥",
      text: "text-orange-300",
      border: "border-orange-400/36",
      glow: "shadow-[0_0_30px_rgba(249,115,22,0.16)]",
      banner: "border-orange-300/16 bg-orange-400/[0.07]",
      panel: "border-orange-400/12 bg-orange-400/[0.03]",
    };
  }

  if (kind === "intelligence") {
    return {
      label: "ATLAS INTELLIGENCE",
      icon: "◬",
      text: "text-violet-300",
      border: "border-violet-400/36",
      glow: "shadow-[0_0_30px_rgba(168,85,247,0.16)]",
      banner: "border-violet-300/16 bg-violet-400/[0.07]",
      panel: "border-violet-400/12 bg-violet-400/[0.03]",
    };
  }

  return {
    label: "TEAM IMPACT",
    icon: "●●●",
    text: "text-sky-300",
    border: "border-sky-400/34",
    glow: "shadow-[0_0_30px_rgba(56,189,248,0.16)]",
    banner: "border-sky-300/16 bg-sky-400/[0.07]",
    panel: "border-sky-400/12 bg-sky-400/[0.03]",
  };
}

function getTeamImpactCompactSummary(item: TeamImpactEvent) {
  const eventType = item.eventType.toLowerCase();

  if (eventType.includes("bullpen")) return "Bullpen • Late Game Risk";
  if (eventType.includes("pitcher") || eventType.includes("starter")) return "Pitcher • Rotation Impact";
  if (eventType.includes("lineup") || eventType.includes("scratch")) return "Lineup • Availability";
  if (eventType.includes("weather")) return "Weather • Game Context";
  if (eventType.includes("injury") || eventType.includes("suspension")) return "Roster • Team Strength";

  return `${item.eventType.replace(/\s+change$/i, "")} • Market Context`;
}

type ImpactSummaryIconName = "team" | "market" | "intelligence" | "clock";

function ImpactSummaryIcon({ name, className = "h-5 w-5" }: { name: ImpactSummaryIconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
  };

  if (name === "team") {
    return (
      <svg {...common}>
        <path d="M8.2 10.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M15.8 10.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M3.8 19.7c.7-3.3 2.4-5 4.4-5s3.7 1.7 4.4 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M11.4 19.7c.7-3.3 2.4-5 4.4-5s3.7 1.7 4.4 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "market") {
    return (
      <svg {...common}>
        <path d="M4 18.5h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="m5.2 14.7 4-4 3.1 2.7 5.9-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.8 6.4h-4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M17.8 6.4v4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "intelligence") {
    return (
      <svg {...common}>
        <path d="M9 7.2a3 3 0 0 1 6 0v.4a3.8 3.8 0 0 1 2.2 6.6 3.4 3.4 0 0 1-3.3 4.1H10a3.4 3.4 0 0 1-3.3-4.1 3.8 3.8 0 0 1 2.2-6.6v-.4Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9.2 12h5.6M12 9.2v5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M5.2 10.4H3.5M20.5 10.4h-1.7M6 17.5l-1.2 1.2M18 17.5l1.2 1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 7.7v4.8l3.2 1.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ImpactAccent = ReturnType<typeof getImpactAccent>;
type ImpactDetailKind = "WHY" | "IMPACT";
type ImpactDetailSheetState = {
  title: string;
  subtitle: string;
  label: ImpactDetailKind;
  text: string;
  accent: ImpactAccent;
} | null;

function joinImpactDetailLines(lines: Array<string | null | undefined>) {
  return lines
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function ImpactDetailButton({
  label,
  summary,
  accent,
  onOpen,
}: {
  label: string;
  summary: string;
  accent: ImpactAccent;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group rounded-[10px] border px-2 py-0.5 text-left transition active:scale-[0.99] ${accent.panel} hover:border-white/18 hover:bg-white/[0.035]`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${accent.text}`}>
          {label}
        </span>
        <span className={`text-[9px] font-black leading-none ${accent.text}`}>
          ⌄
        </span>
      </span>
      <span className="mt-px line-clamp-2 block text-[9px] font-semibold leading-[12px] text-white/72">
        {summary}
      </span>
    </button>
  );
}

function ImpactDetailButtons({
  whyLabel,
  whyText,
  whyFullText,
  impactLabel,
  impactText,
  impactFullText,
  accent,
  title,
  subtitle,
  onOpen,
}: {
  whyLabel: string;
  whyText: string;
  whyFullText: string;
  impactLabel: string;
  impactText: string;
  impactFullText: string;
  accent: ImpactAccent;
  title: string;
  subtitle: string;
  onOpen: (detail: NonNullable<ImpactDetailSheetState>) => void;
}) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-1.5">
      <ImpactDetailButton
        label={whyLabel}
        summary={whyText}
        accent={accent}
        onOpen={() =>
          onOpen({
            title,
            subtitle,
            label: "WHY",
            text: whyFullText,
            accent,
          })
        }
      />
      <ImpactDetailButton
        label={impactLabel}
        summary={impactText}
        accent={accent}
        onOpen={() =>
          onOpen({
            title,
            subtitle,
            label: "IMPACT",
            text: impactFullText,
            accent,
          })
        }
      />
    </div>
  );
}

function getAtlasImpactScoreClasses(impact: PulseImpact) {
  if (impact === "HIGH") {
    return "border-red-300/50 bg-red-400/10 text-red-200";
  }

  if (impact === "MEDIUM") {
    return "border-amber-300/50 bg-amber-300/10 text-amber-200";
  }

  return "border-cyan-300/45 bg-cyan-300/10 text-cyan-200";
}

function getMarketImpactTime(item: AtlasEvent) {
  const value =
    item.marketMovement?.detectedAt ??
    item.lastUpdated ??
    item.publishedAt ??
    item.firstDetected;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isCurrentMarketImpactItem(item: AtlasEvent) {
  if (!item.isLiveData && !item.marketMovement) return false;

  const timestamp = getMarketImpactTime(item);
  if (timestamp === null) return false;

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return timestamp >= startOfToday.getTime() && timestamp <= now + 10 * 60 * 1000;
}

function dedupeMarketImpactItems(items: AtlasEvent[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = [
      item.groupedEventKey,
      item.marketMovement
        ? `${item.marketMovement.marketKey}-${item.marketMovement.awayTeam}-${item.marketMovement.homeTeam}`
        : null,
      item.title,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatMarketMovementValue(point?: number, price?: number) {
  if (point !== undefined && Number.isFinite(point)) {
    return Number.isInteger(point) ? point.toFixed(0) : `${point}`;
  }

  return formatAmericanOdds(price ?? null);
}

function getTeamBadgeSport(sport: PulseSport): SportTab {
  return sport === "MLB" || sport === "NFL" || sport === "NBA" || sport === "NHL" || sport === "SOCCER"
    ? sport
    : "TOP";
}

function isGenericEventSubject(value?: string) {
  if (!value) return true;

  const normalized = value.toLowerCase().trim();

  return [
    "rotation player",
    "starting qb",
    "key batter",
    "five-year player",
    "player",
    "starter",
    "mlb slate",
  ].some((pattern) => normalized === pattern || normalized.includes(pattern));
}

function titleCaseTeamName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`))
    .join(" ");
}

function extractKnownTeamFromText(item: AtlasEvent) {
  const text = `${item.title} ${item.summary} ${item.team ?? ""}`;
  const knownTeams = [
    "New York Mets",
    "Kansas City Royals",
    "Buffalo Bills",
    "Miami Dolphins",
    "Golden State Warriors",
    "Los Angeles Lakers",
    "Chicago Cubs",
    "San Diego Padres",
    "New York Yankees",
    "Boston Red Sox",
    "Los Angeles Dodgers",
    "San Francisco Giants",
  ];
  const directMatch = knownTeams.find((team) => text.toLowerCase().includes(team.toLowerCase()));

  if (directMatch) return directMatch;

  const titleMatch = item.title.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\s(?:Announce|Place|Scratch|Activate|Recall|Trade|Rule)\b/);

  return titleMatch?.[1] ? titleCaseTeamName(titleMatch[1]) : item.team;
}

function extractKnownMatchupFromText(item: AtlasEvent) {
  const text = `${item.title} ${item.summary} ${item.team ?? ""}`;
  const knownTeams = [
    "New York Mets",
    "Kansas City Royals",
    "Buffalo Bills",
    "Miami Dolphins",
    "Golden State Warriors",
    "Los Angeles Lakers",
    "Chicago Cubs",
    "San Diego Padres",
    "New York Yankees",
    "Boston Red Sox",
    "Los Angeles Dodgers",
    "San Francisco Giants",
  ];
  const lowerText = text.toLowerCase();
  const teams = knownTeams.filter((team) => lowerText.includes(team.toLowerCase()));

  if (teams.length >= 2) {
    return {
      awayTeam: teams[0],
      homeTeam: teams[1],
      timeLabel: "",
    };
  }

  return null;
}

function getTerminalEventSubject(item: AtlasEvent) {
  if (item.marketMovement) return `${item.marketMovement.awayTeam} vs ${item.marketMovement.homeTeam}`;
  const matchup = extractKnownMatchupFromText(item);

  if (item.category === "WEATHER" && matchup) return `${matchup.awayTeam} vs ${matchup.homeTeam}`;
  if (item.player && !isGenericEventSubject(item.player)) return item.player;

  const team = extractKnownTeamFromText(item);

  if (item.category === "INJURY" || item.category === "LINEUP") {
    if (team && !isGenericEventSubject(team)) return `Key ${getDisplayAbbr(team)} Player`;

    return item.title || item.category.replaceAll("_", " ");
  }

  if (item.team && !isGenericEventSubject(item.team)) return item.team;
  if (item.player && !isGenericEventSubject(item.player)) return item.player;

  return item.title || item.sport;
}

function getTerminalEventDetail(item: AtlasEvent) {
  const text = `${item.title} ${item.summary} ${item.whyItMatters}`.toLowerCase();

  if (item.marketMovement) {
    return `${item.marketMovement.marketLabel} ${formatMarketMovementValue(
      item.marketMovement.previousPoint,
      item.marketMovement.previousPrice,
    )} → ${formatMarketMovementValue(item.marketMovement.currentPoint, item.marketMovement.currentPrice)}`;
  }
  if (text.includes("fractured hand")) return "Fractured Hand";
  if (text.includes("hamstring")) return "Hamstring Injury";
  if (text.includes("limited in practice")) return "Limited In Practice";
  if (text.includes("probable")) return "Upgraded To Probable";
  if (text.includes("questionable")) return "Questionable";
  if (text.includes("day-to-day") || text.includes("dtd")) return "Day-To-Day";
  if (text.includes("ruled out")) return "Ruled Out";
  if (text.includes("scratched")) return item.category === "LINEUP" ? "Late Scratch" : "Scratched";
  if (item.category === "WEATHER" && text.includes("blowing out")) return "Wind Blowing Out";
  if (item.category === "STARTING_PITCHER") return "Starting Pitcher Changed";
  if (item.category === "WEATHER") return "Weather Watch";
  if (item.category === "LINEUP") return text.includes("removed") ? "Removed From Starting Lineup" : "Lineup Change";
  if (item.category === "ROSTER" || item.category === "TRANSACTION") {
    if (text.includes("called up")) return "Called Up";
    if (text.includes("activated")) return "Activated";
    if (text.includes("sent down")) return "Sent Down";
    if (text.includes("trade")) return "Trade";
    return "Roster Move";
  }
  if (item.category === "SUSPENSION" || text.includes("suspended")) return "Suspended";
  if (text.includes("out") || text.includes("scratched") || text.includes("fractured") || text.includes("injured")) return "OUT";
  if (item.category === "INJURY") return "DTD";

  return item.category.replaceAll("_", " ");
}

function getTerminalStatusBadge(item: AtlasEvent) {
  const text = `${item.title} ${item.summary} ${item.whyItMatters}`.toLowerCase();

  if (item.marketMovement) return item.marketMovement.status;
  if (item.category === "WEATHER" || item.category === "STARTING_PITCHER") return null;
  if (item.category === "LINEUP") return text.includes("scratched") ? "SCRATCH" : null;
  if (text.includes("probable")) return "PROBABLE";
  if (text.includes("questionable")) return "QUESTIONABLE";
  if (text.includes("day-to-day") || text.includes("dtd")) return "DTD";
  if (text.includes("fractured") || text.includes("out") || text.includes("scratched")) return "OUT";

  return null;
}

function formatPossessiveTeam(team: string) {
  return team.endsWith("s") ? `${team}'` : `${team}'s`;
}

function getTerminalGameContext(item: AtlasEvent) {
  if (item.marketMovement) {
    return {
      kind: "matchup" as const,
      awayTeam: item.marketMovement.awayTeam,
      homeTeam: item.marketMovement.homeTeam,
      timeLabel: formatTime(item.marketMovement.commenceTime),
    };
  }

  const matchup = extractKnownMatchupFromText(item);

  if (matchup) {
    return {
      kind: "matchup" as const,
      ...matchup,
    };
  }

  const team = extractKnownTeamFromText(item);

  if (team && !isGenericEventSubject(team)) {
    return {
      kind: "team" as const,
      team,
      timeLabel: "",
    };
  }

  return {
    kind: "none" as const,
    label: "Matchup not yet resolved",
  };
}

function getTerminalAtlasSummary(item: AtlasEvent) {
  if (item.marketMovement) {
    return `${item.marketMovement.marketLabel} moved from ${formatMarketMovementValue(
      item.marketMovement.previousPoint,
      item.marketMovement.previousPrice,
    )} to ${formatMarketMovementValue(item.marketMovement.currentPoint, item.marketMovement.currentPrice)} across ${
      item.marketMovement.sportsbookCount
    } books, which may signal a pricing shift.`;
  }

  const subject = getTerminalEventSubject(item);
  const team = extractKnownTeamFromText(item);
  const teamLabel = team ?? "the affected team";
  const detail = getTerminalEventDetail(item).toLowerCase();

  if (item.category === "STARTING_PITCHER") {
    return `${subject} is confirmed as the starting pitcher, which may affect Moneyline, First Five and Total markets.`;
  }

  if (item.category === "WEATHER") {
    return `${getTerminalEventDetail(item)} may affect expected scoring and total-market volatility.`;
  }

  if (item.category === "LINEUP") {
    return `${subject} is tied to a ${detail}; ${teamLabel} totals and player props may move.`;
  }

  if (item.category === "ROSTER" || item.category === "TRANSACTION") {
    return `${subject} may affect team depth, lineup construction and relevant player props.`;
  }

  if (item.category === "SUSPENSION" || item.category === "INJURY") {
    if (detail === "upgraded to probable") {
      return `${subject} has been upgraded to probable, which may improve ${formatPossessiveTeam(teamLabel)} offensive projection.`;
    }

    if (detail === "day-to-day") {
      return `${subject} is listed as day-to-day, which may affect ${formatPossessiveTeam(teamLabel)} offensive outlook and market volatility.`;
    }

    return `${subject} is dealing with ${detail}, which may affect ${teamLabel} production and market volatility.`;
  }

  return item.whyItMatters || item.summary || "Atlas detected an event that may affect betting markets.";
}

function TerminalTeamMark({ teamName, sport, size = "sm" }: { teamName: string; sport: SportTab; size?: "sm" | "lg" }) {
  const displayTeamName = getSportDisplayTeamName(teamName, sport);
  const logo = getLogo(displayTeamName, sport);
  const [logoFailed, setLogoFailed] = useState(false);
  const normalizedTeamName = displayTeamName.toLowerCase();
  const isPlaceholder =
    normalizedTeamName.includes("tbd") ||
    normalizedTeamName.includes("player") ||
    normalizedTeamName.includes("starter") ||
    normalizedTeamName.includes("batter") ||
    normalizedTeamName.includes("slate") ||
    normalizedTeamName.includes("market") ||
    normalizedTeamName.includes("qb");
  const shouldUseLogo = Boolean(logo) && !isPlaceholder && !logoFailed;

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  const sizeClass =
    size === "lg"
      ? "h-[47px] w-[47px] p-1 text-[11px] border-white/15 bg-white/[0.055] shadow-[inset_0_1px_10px_rgba(255,255,255,0.05)]"
      : "h-6 w-6 p-0.5 text-[8px] border-white/10 bg-white/8";

  return (
    <span className={`grid shrink-0 place-items-center rounded-full border font-black text-white/70 ${sizeClass}`}>
      {shouldUseLogo && logo ? (
        <img
          src={logo}
          alt={displayTeamName}
          className="h-full w-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        getDisplayAbbr(displayTeamName)
      )}
    </span>
  );
}

function MarketTeamMark({ teamName, sport }: { teamName: string; sport: SportTab }) {
  const displayTeamName = getMarketDisplayTeamName(teamName, sport);
  const logo = getLogo(displayTeamName, sport);
  const [logoFailed, setLogoFailed] = useState(false);
  const shouldUseLogo = Boolean(logo) && !logoFailed;

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  if (shouldUseLogo && logo) {
    return (
      <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.055] p-1 shadow-[inset_0_1px_10px_rgba(255,255,255,0.05)]">
        <img
          src={logo}
          alt={displayTeamName}
          className="h-full w-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-[32px] max-w-[96px] items-center rounded-[10px] border border-white/12 bg-white/[0.055] px-2 text-center text-[9px] font-black uppercase leading-[10px] text-white/74">
      {displayTeamName}
    </span>
  );
}

function getTeamImpactSportBadge(sport: TeamImpactEvent["sport"]): SportTab {
  return sport;
}

function getTeamImpactTitle(event: TeamImpactEvent) {
  const team = event.homeTeam || event.awayTeam;
  if (event.playerName && team) return `${team}: ${event.playerName}`;
  if (team) return team;
  return event.sport;
}

function getTeamImpactMatchupLabel(event: TeamImpactEvent) {
  if (event.awayTeam && event.homeTeam && event.awayTeam !== event.homeTeam) {
    return `${getDisplayAbbr(event.awayTeam)} vs ${getDisplayAbbr(event.homeTeam)}`;
  }

  return event.homeTeam || event.awayTeam || "Team Impact";
}

function formatTeamImpactTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}

function getMarketImpactTitle(event: MarketImpactEvent) {
  return `${event.market} Movement`;
}

function getMarketImpactSelectionLabel(event: MarketImpactEvent) {
  if (event.market === "Totals") {
    return `Over ${formatMarketLineOnly(event.newLine, event.market)}`.trim();
  }

  if (event.market === "Spread" && event.newLine !== null) {
    return `${event.selection} ${formatTeamImpactMarketLine(event.newLine)}`;
  }

  return event.selection;
}

function getMarketImpactPrimaryTitle(event: MarketImpactEvent, sport: SportTab) {
  if (event.market === "Totals") {
    return `Over ${formatMarketLineOnly(event.newLine, event.market)}`.trim();
  }

  const selection = getDisplayName(getSportDisplayTeamName(event.selection, sport));
  if (event.market === "Spread" && event.newLine !== null) {
    return `${selection} ${formatTeamImpactMarketLine(event.newLine)}`;
  }

  if (event.market === "Moneyline") {
    return `Moneyline ${selection}`;
  }

  return selection;
}

function getMarketMonitorTitle(event: MarketImpactEvent) {
  if (event.market === "Moneyline") return "MONEYLINE";
  if (event.market === "Spread") return "SPREAD";
  return event.market.toUpperCase();
}

function formatTeamImpactMarketLine(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value > 0) return `+${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getMarketConsensusLine(event: MarketImpactEvent) {
  return `${event.booksMoved} of ${event.booksObserved} sportsbooks`;
}

function getMarketConsensusPercent(event: MarketImpactEvent) {
  return `Consensus ${event.consensusPercent.toFixed(1)}%`;
}

function formatMarketDetailValue(line: number | null, odds: number | null) {
  const lineText = line === null ? "" : formatTeamImpactMarketLine(line);
  const oddsText = odds === null ? "" : odds > 0 ? `+${odds}` : `${odds}`;
  return [lineText, oddsText].filter(Boolean).join(" ");
}

function formatMarketLineOnly(line: number | null, market?: MarketImpactEvent["market"]) {
  if (line === null) return "N/A";
  if (market === "Totals") return Number.isInteger(line) ? line.toFixed(0) : line.toFixed(1);
  return formatTeamImpactMarketLine(line);
}

function getMarketVisualSelection(event: MarketImpactEvent) {
  return event.market === "Totals" ? "Over" : event.selection.trim();
}

function getMarketVisualMovement(event: ConsolidatedMarketImpactEvent, position: "first" | "latest") {
  if (event.market !== "Totals") {
    return position === "first" ? event.movementsToday[0] ?? event : event;
  }

  const movements = position === "first" ? event.movementsToday : [...event.movementsToday].reverse();
  return movements.find((movement) => movement.selection.trim().toLowerCase() === "over") ?? (position === "first" ? event.movementsToday[0] ?? event : event);
}

function sameMarketLine(a: number | null, b: number | null) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.001;
}

type MarketAnchorState = {
  openingMovement: MarketImpactEvent;
  currentMovement: MarketImpactEvent;
  openingLine: number | null;
  openingOdds: number | null;
  currentLine: number | null;
  currentOdds: number | null;
  currentBook: string | null;
  booksOnAnchor: number;
  anchorLine: number | null;
  anchorOpeningOdds: number | null;
  transition: {
    oldLine: number | null;
    newLine: number | null;
    time: string;
    reason: string;
  } | null;
};

function getAggressiveAnchorPrice(input: {
  movement: MarketImpactEvent;
  anchorLine: number | null;
  anchorOdds: number | null;
}) {
  const candidates: Array<{ odds: number | null; book: string | null; movedAt: string }> = input.movement.sportsbookDetails
    .filter((detail) => sameMarketLine(detail.newLine, input.anchorLine))
    .map((detail) => ({
      odds: detail.newOdds,
      book: detail.name,
      movedAt: detail.movedAt,
    }))
    .filter((detail) => detail.odds !== null);

  if (sameMarketLine(input.movement.newLine, input.anchorLine) && input.movement.newOdds !== null) {
    candidates.push({
      odds: input.movement.newOdds,
      book: input.movement.latestBookToMove,
      movedAt: input.movement.latestMoveAt ?? input.movement.publishedAt,
    });
  }

  if (candidates.length === 0) return null;
  const anchorOdds = input.anchorOdds ?? candidates[0].odds ?? 0;

  return candidates.sort((a, b) => Math.abs((b.odds ?? 0) - anchorOdds) - Math.abs((a.odds ?? 0) - anchorOdds))[0];
}

function getMarketAnchorState(event: ConsolidatedMarketImpactEvent): MarketAnchorState {
  const opening = getMarketVisualMovement(event, "first");
  const chronological = event.movementsToday.length > 0 ? event.movementsToday : [event];
  let anchorLine = opening.oldLine ?? opening.newLine;
  let anchorOpeningOdds = opening.oldOdds ?? opening.newOdds;
  let currentMovement = opening;
  let currentLine = anchorLine;
  let currentOdds = anchorOpeningOdds;
  let currentBook = opening.firstBookToMove ?? opening.latestBookToMove;
  let booksOnAnchor = 0;
  let transition: MarketAnchorState["transition"] = null;

  chronological.forEach((movement) => {
    if (event.market === "Totals" && movement.selection.trim().toLowerCase() !== "over") return;

    const detailsOnAnchor = movement.sportsbookDetails.filter((detail) => sameMarketLine(detail.newLine, anchorLine));
    const movementStillOnAnchor = sameMarketLine(movement.newLine, anchorLine);
    const aggressive = getAggressiveAnchorPrice({
      movement,
      anchorLine,
      anchorOdds: anchorOpeningOdds,
    });

    if (movementStillOnAnchor || detailsOnAnchor.length > 0 || aggressive) {
      currentMovement = movement;
      currentLine = anchorLine;
      currentOdds = aggressive?.odds ?? movement.newOdds ?? currentOdds;
      currentBook = aggressive?.book ?? movement.latestBookToMove ?? currentBook;
      booksOnAnchor = Math.max(booksOnAnchor, detailsOnAnchor.length || movement.booksMoved);
      return;
    }

    if (anchorLine !== null && movement.newLine !== null && !sameMarketLine(movement.newLine, anchorLine)) {
      transition = {
        oldLine: anchorLine,
        newLine: movement.newLine,
        time: movement.latestMoveAt ?? movement.publishedAt,
        reason: "Anchor line no longer appeared in the observed sportsbook movement.",
      };
      anchorLine = movement.newLine;
      anchorOpeningOdds = movement.newOdds ?? anchorOpeningOdds;
      currentMovement = movement;
      currentLine = movement.newLine;
      currentOdds = movement.newOdds;
      currentBook = movement.latestBookToMove ?? currentBook;
      booksOnAnchor = movement.booksMoved;
    }
  });

  return {
    openingMovement: opening,
    currentMovement,
    openingLine: opening.oldLine ?? opening.newLine,
    openingOdds: opening.oldOdds ?? opening.newOdds,
    currentLine,
    currentOdds,
    currentBook,
    booksOnAnchor,
    anchorLine,
    anchorOpeningOdds,
    transition,
  };
}

function formatMarketStateLine(selection: string, line: number | null, odds: number | null, market?: MarketImpactEvent["market"]) {
  const selectionText = market === "Totals" ? "Over" : selection.trim();
  const lineText = formatMarketLineOnly(line, market);
  const oddsText = formatAmericanOdds(odds);
  return {
    market: [selectionText, lineText === "N/A" ? null : lineText].filter(Boolean).join(" "),
    odds: oddsText === "N/A" ? "Odds N/A" : `(${oddsText})`,
  };
}

function getMarketOpeningMovement(event: ConsolidatedMarketImpactEvent) {
  return getMarketAnchorState(event).openingMovement;
}

function getMarketCurrentMovement(event: ConsolidatedMarketImpactEvent) {
  return getMarketAnchorState(event).currentMovement;
}

function getMarketOpeningLine(event: ConsolidatedMarketImpactEvent) {
  return getMarketAnchorState(event).openingLine;
}

function getMarketOpeningOdds(event: ConsolidatedMarketImpactEvent) {
  return getMarketAnchorState(event).openingOdds;
}

function getMarketLineMoveStatus(event: ConsolidatedMarketImpactEvent) {
  const anchor = getMarketAnchorState(event);
  const openLine = anchor.openingLine;
  const currentLine = anchor.currentLine;
  const openOdds = anchor.openingOdds;
  const currentOdds = anchor.currentOdds;

  if (openLine === null || currentLine === null) {
    return {
      label: "LINE STATUS",
      direction: "stable" as const,
      tone: "text-white/62",
      badge: "border-white/12 bg-white/[0.04]",
    };
  }

  const oddsChanged = openOdds !== null && currentOdds !== null && currentOdds !== openOdds;

  if (currentLine > openLine) {
    return {
      label: "LINE MOVED UP",
      direction: "up" as const,
      tone: "text-emerald-300",
      badge: "border-emerald-300/24 bg-emerald-300/[0.08]",
    };
  }

  if (currentLine < openLine) {
    return {
      label: "LINE MOVED DOWN",
      direction: "down" as const,
      tone: "text-red-300",
      badge: "border-red-300/24 bg-red-300/[0.08]",
    };
  }

  if (oddsChanged) {
    return {
      label: "ODDS MOVED",
      direction: "odds" as const,
      tone: "text-amber-300",
      badge: "border-amber-300/24 bg-amber-300/[0.08]",
    };
  }

  return {
    label: "STABLE",
    direction: "stable" as const,
    tone: "text-white/58",
    badge: "border-white/12 bg-white/[0.04]",
  };
}

function getMarketTrend(event: ConsolidatedMarketImpactEvent) {
  const anchor = getMarketAnchorState(event);
  const openLine = anchor.openingLine;
  const currentLine = anchor.currentLine;
  const openOdds = anchor.openingOdds;
  const currentOdds = anchor.currentOdds;

  if (openLine !== null && currentLine !== null && currentLine !== openLine) {
    const delta = currentLine - openLine;
    return {
      label: delta > 0 ? "Upward Trend" : "Downward Trend",
      detail: `${delta > 0 ? "+" : ""}${Number.isInteger(delta) ? delta.toFixed(0) : delta.toFixed(1)} pts`,
      tone: delta > 0 ? "text-emerald-300" : "text-red-300",
    };
  }

  if (openOdds !== null && currentOdds !== null && currentOdds !== openOdds) {
    const delta = currentOdds - openOdds;
    return {
      label: "Odds Movement",
      detail: `${formatAmericanOdds(openOdds)} to ${formatAmericanOdds(currentOdds)}`,
      tone: "text-amber-300",
    };
  }

  return {
    label: "Stable",
    detail: "No significant movement",
    tone: "text-white/58",
  };
}

type MarketMovementDirection = ReturnType<typeof getMarketLineMoveStatus>["direction"];

function MarketMovementIcon({ direction }: { direction: MarketMovementDirection }) {
  const classes =
    direction === "up"
      ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.38)]"
      : direction === "down"
      ? "text-red-300 drop-shadow-[0_0_8px_rgba(248,113,113,0.34)]"
      : direction === "odds"
      ? "text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.32)]"
      : "text-white/46 drop-shadow-[0_0_7px_rgba(255,255,255,0.12)]";

  if (direction === "up") {
    return (
      <svg viewBox="0 0 32 32" className={`h-7 w-7 ${classes}`} fill="none" aria-hidden="true">
        <path d="M5 22 12 15 17 19 26 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 10h6v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (direction === "down") {
    return (
      <svg viewBox="0 0 32 32" className={`h-7 w-7 ${classes}`} fill="none" aria-hidden="true">
        <path d="M5 10 12 17 17 13 26 22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 22h6v-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (direction === "odds") {
    return (
      <svg viewBox="0 0 32 32" className={`h-7 w-7 ${classes}`} fill="none" aria-hidden="true">
        <path d="M7 12h17" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        <path d="m20 8 4 4-4 4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M25 20H8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        <path d="m12 16-4 4 4 4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className={`h-7 w-7 ${classes}`} fill="none" aria-hidden="true">
      <path d="M7 16h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m21 12 4 4-4 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getMarketImpactHistoryText(event: ConsolidatedMarketImpactEvent) {
  const opening = getMarketOpeningMovement(event);
  let anchorLine = getMarketOpeningLine(event);
  const openingState = formatMarketStateLine(
    getMarketVisualSelection(opening),
    anchorLine,
    getMarketOpeningOdds(event),
    event.market,
  );
  const entries: Array<{ time: string; lines: string[] }> = [
    {
      time: opening.firstMoveAt ?? opening.latestMoveAt ?? opening.publishedAt,
      lines: ["OPEN", openingState.market, openingState.odds],
    },
  ];

  event.movementsToday.forEach((movement) => {
    if (event.market === "Totals" && movement.selection.trim().toLowerCase() !== "over") return;

    if (anchorLine !== null && movement.newLine !== null && !sameMarketLine(movement.newLine, anchorLine)) {
      const oldState = formatMarketStateLine(getMarketVisualSelection(movement), anchorLine, null, event.market);
      const newState = formatMarketStateLine(getMarketVisualSelection(movement), movement.newLine, null, event.market);
      const movedUp = movement.newLine > anchorLine;

      entries.push({
        time: movement.latestMoveAt ?? movement.publishedAt,
        lines: [movedUp ? "LINE MOVED UP" : "LINE MOVED DOWN", oldState.market, "to", newState.market],
      });
      anchorLine = movement.newLine;
    }

    const state = formatMarketStateLine(getMarketVisualSelection(movement), anchorLine, movement.newOdds, event.market);
      const bookLines = movement.latestBookToMove ? ["Book", movement.latestBookToMove] : [];

      entries.push({
        time: movement.latestMoveAt ?? movement.publishedAt,
        lines: [
          "Odds",
          state.market,
          state.odds,
          ...bookLines,
        ],
      });
  });

  return entries
    .map((entry) => {
      return [
        formatTeamImpactTimestamp(entry.time),
        ...entry.lines,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n----------------\n\n");
}

function getMarketDirectionWhy(event: ConsolidatedMarketImpactEvent) {
  const anchor = getMarketAnchorState(event);
  const openLine = anchor.openingLine;
  const currentLine = anchor.currentLine;
  const openOdds = anchor.openingOdds;
  const currentOdds = anchor.currentOdds;
  const marketLabel = event.market === "Totals" ? "Opening Total" : `Opening ${event.market}`;

  if (openLine !== null && currentLine !== null && currentLine > openLine) {
    return `${marketLabel} increased from ${formatMarketLineOnly(openLine, event.market)} to ${formatMarketLineOnly(currentLine, event.market)}.`;
  }

  if (openLine !== null && currentLine !== null && currentLine < openLine) {
    return `${marketLabel} decreased from ${formatMarketLineOnly(openLine, event.market)} to ${formatMarketLineOnly(currentLine, event.market)}.`;
  }

  if (openOdds !== null && currentOdds !== null && currentOdds !== openOdds) {
    return `The line remained unchanged while sportsbook pricing adjusted from ${formatAmericanOdds(openOdds)} to ${formatAmericanOdds(currentOdds)}.`;
  }

  return "The market remains stable against the opening reference.";
}

function getAtlasIntelligenceMatchupLabel(event: AtlasIntelligenceEvent) {
  const away = event.details.awayTeam;
  const home = event.details.homeTeam;
  if (away && home && away !== home) return `${getDisplayAbbr(away)} vs ${getDisplayAbbr(home)}`;
  return home || away || "Atlas Intelligence";
}

function getAtlasIntelligenceTimeline(event: AtlasIntelligenceEvent) {
  return `${formatTeamImpactTimestamp(event.details.teamEventTime)} ${event.details.teamEventType} -> ${formatTeamImpactTimestamp(event.details.marketTime)} ${event.details.market} moved`;
}

function getAtlasIntelligenceConfidenceClass(confidence: PulseImpact) {
  if (confidence === "HIGH") return "border-red-300/40 bg-red-400/12 text-red-200";
  if (confidence === "MEDIUM") return "border-amber-300/40 bg-amber-300/12 text-amber-200";
  return "border-sky-300/40 bg-sky-300/12 text-sky-200";
}

function getAtlasIntelligenceWhy(event: AtlasIntelligenceEvent) {
  return `A ${event.details.teamEventType} was followed by measurable ${event.details.market} movement within ${event.details.minutesBetween} minutes.`;
}

function getAtlasIntelligenceImpact(event: AtlasIntelligenceEvent) {
  return `The market reacted after the team update with a ${event.details.marketMovementType.replaceAll("_", " ").toLowerCase()}.`;
}

const atlasBankrollMock = {
  cycle: {
    week: "Week 2",
    day: "Day 4 / 7",
  },
  summary: [
    {
      label: "Current Bankroll",
      value: "$214",
      detail: "+$14",
      icon: "wallet" as const,
      tone: "green" as const,
    },
    {
      label: "Initial Bankroll",
      value: "$200",
      detail: "Starting point",
      icon: "trend" as const,
      tone: "cyan" as const,
    },
    {
      label: "Recommended Unit",
      value: "$10",
      detail: "Plan unit",
      icon: "coins" as const,
      tone: "violet" as const,
    },
    {
      label: "Current Profile",
      value: "Atlas Recommended",
      detail: "Recommended",
      icon: "shield" as const,
      tone: "green" as const,
    },
  ],
  plan: {
    package: "Premium",
    pick: "Dodgers ML",
    status: "Pending",
    unit: "$10",
    sport: "MLB",
  },
  weekly: {
    wins: "4",
    losses: "2",
    roi: "+7%",
    planScore: "95",
    progress: 68,
    cycle: "Day 4 / 7",
  },
  performance: [
    { label: "Current ROI", value: "+7.00%", detail: "Good" },
    { label: "Current Streak", value: "2W", detail: "Building" },
    { label: "Profit / Loss", value: "+$14", detail: "Net" },
    { label: "Today's Exposure", value: "3%", detail: "Within plan" },
  ],
  insight: {
    title: "Discipline beats emotion.",
    body: "Consistency is built by respecting your unit size.",
  },
};

const bankrollProfileLabels: Record<BankrollProfile, string> = {
  atlas_recommended: "Atlas Recommended",
  higher_exposure: "Higher Exposure",
};

const bankrollProfileDetails: Record<BankrollProfile, string> = {
  atlas_recommended: "Recommended",
  higher_exposure: "Higher Exposure",
};

const bankrollProfileOptions: Array<{
  profile: BankrollProfile;
  title: string;
  badge: string;
  percentage: string;
  exposure: string;
  description: string;
}> = [
  {
    profile: "atlas_recommended",
    title: "Atlas Recommended",
    badge: "Recommended",
    percentage: `${Math.round(ATLAS_RECOMMENDED_PERCENTAGE * 100)}%`,
    exposure: "Lower Exposure",
    description: "Stay consistent with your plan.",
  },
  {
    profile: "higher_exposure",
    title: "Higher Exposure",
    badge: "Higher Exposure",
    percentage: `${Math.round(HIGHER_EXPOSURE_PERCENTAGE * 100)}%`,
    exposure: "Higher Exposure",
    description: "This profile increases plan exposure.",
  },
];

type BankrollSummaryItem = {
  label: string;
  value: string;
  detail: string;
  icon: BankrollUiIconName;
  tone: keyof typeof bankrollToneClasses;
};

function getBankrollSummary(config: BankrollConfig | null, metrics: FinancialMetrics | null): BankrollSummaryItem[] {
  if (!config || !metrics) return atlasBankrollMock.summary;

  return [
    {
      label: "Current Bankroll",
      value: formatCurrency(metrics.currentBankroll),
      detail: formatCurrency(metrics.profit),
      icon: "wallet",
      tone: metrics.profit < 0 ? "red" : "green",
    },
    {
      label: "Initial Bankroll",
      value: formatCurrency(config.initialBankroll),
      detail: "Starting point",
      icon: "trend",
      tone: "cyan",
    },
    {
      label: "Recommended Unit",
      value: formatCurrency(metrics.recommendedUnit),
      detail: "Plan unit",
      icon: "coins",
      tone: "violet",
    },
    {
      label: "Current Profile",
      value: bankrollProfileLabels[config.profile],
      detail: bankrollProfileDetails[config.profile],
      icon: "shield",
      tone: "green",
    },
  ];
}

function getBankrollPerformance(metrics: FinancialMetrics | null) {
  if (!metrics) return atlasBankrollMock.performance.map((metric) => ({ ...metric, tone: "green" as const }));

  return atlasBankrollMock.performance.map((metric) => {
    if (metric.label === "Current ROI") {
      return {
        ...metric,
        value: formatPercentage(metrics.roi.value),
        detail: metrics.roi.status === "zero" ? "Starting" : "Current",
        tone: metrics.roi.status === "positive" ? "green" as const : metrics.roi.status === "negative" ? "red" as const : "neutral" as const,
      };
    }

    if (metric.label === "Profit / Loss") {
      return {
        ...metric,
        value: formatCurrency(metrics.profit),
        detail: "Net",
        tone: metrics.profit > 0 ? "green" as const : metrics.profit < 0 ? "red" as const : "neutral" as const,
      };
    }

    if (metric.label === "Today's Exposure") {
      return {
        ...metric,
        value: formatPercentage(metrics.exposure.value).replace("+", ""),
        detail: metrics.exposure.status === "aligned" ? "Within plan" : "Review plan",
        tone: metrics.exposure.status === "aligned" ? "green" as const : "neutral" as const,
      };
    }

    return { ...metric, tone: "green" as const };
  });
}

type BankrollUiIconName = "wallet" | "coins" | "shield" | "trend" | "target" | "bars" | "bulb" | "education" | "arrow";

function BankrollUiIcon({
  name,
  className = "h-5 w-5",
}: {
  name: BankrollUiIconName;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    "aria-hidden": true,
  };

  if (name === "wallet") {
    return (
      <svg {...common}>
        <path d="M4.3 8.4h15.4a1.8 1.8 0 0 1 1.8 1.8v6.7a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V7.6c0-1 .7-1.8 1.7-2l10.3-1.7c1-.2 1.9.6 1.9 1.6v2.9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M15.8 13.6h5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 11.7h4.9M7 15h3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18.2 13.6h.1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "coins") {
    return (
      <svg {...common}>
        <path d="M12 6.6c3.4 0 6.2-1 6.2-2.3S15.4 2 12 2 5.8 3 5.8 4.3 8.6 6.6 12 6.6Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M5.8 4.3v4.1c0 1.3 2.8 2.3 6.2 2.3s6.2-1 6.2-2.3V4.3M5.8 8.4v4.1c0 1.3 2.8 2.3 6.2 2.3s6.2-1 6.2-2.3V8.4M5.8 12.5v4.1c0 1.3 2.8 2.3 6.2 2.3s6.2-1 6.2-2.3v-4.1" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 3.2 19 6v5.5c0 4.4-3.1 7.2-7 9.1-3.9-1.9-7-4.7-7-9.1V6l7-2.8Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="m8.8 12 2.2 2.2 4.4-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "target") {
    return (
      <svg {...common}>
        <path d="M11.6 20.2a8.2 8.2 0 1 0-7.8-7.8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
        <path d="M11.8 16a4.2 4.2 0 1 0-3.9-3.9" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
        <path d="M11.9 12.1 20.5 3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M17.4 3.5h3.1v3.1M20.5 3.5l-4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.4 13.6 12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "bars") {
    return (
      <svg {...common}>
        <path d="M5 19V13M10 19V8M15 19v-5M20 19V5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M4 20h17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "bulb") {
    return (
      <svg {...common}>
        <path d="M8.2 14.4a6 6 0 1 1 7.6 0c-.8.6-1.2 1.4-1.2 2.4H9.4c0-1-.4-1.8-1.2-2.4Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9.6 20h4.8M10 17h4M12 2v1.4M4.8 5.1l1 1M19.2 5.1l-1 1M2.8 12h1.4M19.8 12h1.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "education") {
    return (
      <svg {...common}>
        <path d="M3.5 9.5 12 5l8.5 4.5L12 14 3.5 9.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M7 11.4v4.2c1.7 1.7 8.3 1.7 10 0v-4.2M20.5 9.5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "arrow") {
    return (
      <svg {...common}>
        <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 18.8h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m5.2 14.4 4.1-4.2 3.2 2.8 6.3-7.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.8 5.7v4.8h-4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 18.8v-2.2M9.3 18.8v-4.9M13.4 18.8v-3.3M17.5 18.8v-7.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

const bankrollToneClasses = {
  green: "text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]",
  cyan: "text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.32)]",
  violet: "text-violet-300 drop-shadow-[0_0_12px_rgba(196,181,253,0.30)]",
  red: "text-red-300 drop-shadow-[0_0_12px_rgba(252,165,165,0.30)]",
};

function BankrollShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`relative rounded-[22px] border border-white/10 bg-[#06101d]/78 shadow-[0_0_24px_rgba(16,185,129,0.06)] ${className}`}>
      {children}
    </section>
  );
}

function BankrollHeader({
  onEdit,
  onReset,
  canReset,
}: {
  onEdit: () => void;
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <BankrollShell className="overflow-hidden px-4 py-3.5">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.08),transparent_40%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[23px] font-black uppercase tracking-[0.08em] text-white">
            ATLAS <span className="text-emerald-300">BANKROLL</span>
          </h2>
          <p className="mt-0.5 text-[12px] font-bold text-white/56">Financial Discipline Center</p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/32">
            Cycle Progress <span className="ml-1 text-emerald-300/70">{atlasBankrollMock.cycle.day}</span>
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
            Active
          </span>
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" onClick={onEdit} className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-200">
              Edit
            </button>
            {canReset ? (
              <button type="button" onClick={onReset} className="rounded-full border border-red-300/20 bg-red-400/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-red-200">
                Reset Plan
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-white/48">{atlasBankrollMock.cycle.week}</p>
          <p className="text-[10px] font-bold text-white/62">{atlasBankrollMock.cycle.day}</p>
        </div>
      </div>
    </BankrollShell>
  );
}

function AtlasTrackingHeader({
  demoModeEnabled,
  snapshot,
  onEdit,
  onReset,
  canReset,
}: {
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  onEdit: () => void;
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <BankrollShell className="overflow-hidden px-3.5 py-3">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.09),transparent_40%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-black uppercase leading-6 tracking-[0.08em] text-white">
            ATLAS <span className="text-cyan-300">TRACKING</span>
          </h2>
          <p className="mt-0.5 text-[12px] font-bold text-cyan-100/58">Track Your Atlas Signals</p>
          {demoModeEnabled && snapshot ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300/18 bg-amber-300/[0.06] px-2 py-1">
              <span className="text-[7px] font-black uppercase tracking-[0.12em] text-amber-200">Last Available</span>
              <span className="text-[9px] font-black text-white/70">{formatSnapshotDate(snapshot.snapshotDate)}</span>
              <span className="text-[8px] font-bold text-white/32">Snapshot</span>
            </div>
          ) : (
            <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200/45">Live Signal Board</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="inline-flex rounded-full border border-cyan-300/28 bg-cyan-300/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">
            Active
          </span>
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={onEdit} className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.055] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-100/80">
              Edit
            </button>
            {canReset ? (
              <button type="button" onClick={onReset} className="rounded-full border border-red-300/20 bg-red-400/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-red-200">
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </BankrollShell>
  );
}

function BankrollSummaryCard({ config, metrics }: { config: BankrollConfig | null; metrics: FinancialMetrics | null }) {
  const summary = getBankrollSummary(config, metrics);
  const activePackage = config?.membership ? formatPlanPackage(config.membership.package) : atlasBankrollMock.plan.package;
  const formatSummaryLabel = (label: string) => {
    if (label === "Current Bankroll") return <>Current<br />Bankroll</>;
    if (label === "Initial Bankroll") return <>Initial<br />Bankroll</>;
    if (label === "Recommended Unit") return <>Recommended<br />Unit</>;
    if (label === "Current Profile") return <>Current<br />Profile</>;
    return label;
  };

  return (
    <BankrollShell className="overflow-hidden px-2.5 py-2">
      <div className="grid grid-cols-4 divide-x divide-white/10">
      {summary.map((item) => (
        <div
          key={item.label}
          className="min-w-0 px-2 first:pl-0 last:pr-0"
        >
          <div className="flex items-start gap-1">
            <BankrollUiIcon name={item.icon} className={`h-4 w-4 shrink-0 ${bankrollToneClasses[item.tone]}`} />
            <p
              className="min-h-7 max-w-[54px] text-[7.2px] font-black uppercase leading-[11px] tracking-[0.045em] text-white/50"
            >
              {formatSummaryLabel(item.label)}
            </p>
          </div>
          <p className={`mt-1.5 font-black leading-tight tracking-tight ${item.tone === "cyan" ? "text-sky-300" : item.tone === "violet" ? "text-violet-300" : "text-emerald-300"} ${item.label === "Current Profile" ? "text-[9px]" : "text-[19px]"}`}>
            {item.value}
          </p>
          <p className={`mt-0.5 text-[8px] font-bold ${item.detail === "Recommended" ? "text-emerald-300" : "text-white/46"}`}>
            {item.detail}
          </p>
        </div>
      ))}
      </div>
      <div className="mt-1.5 flex items-center gap-2 border-t border-white/10 pt-1.5">
        <p className="shrink-0 text-[8px] font-black uppercase tracking-[0.11em] text-white/34">Package Active</p>
        <span className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.10)]">
          {activePackage}
        </span>
      </div>
    </BankrollShell>
  );
}

function AtlasPlanUpgradePlaceholder() {
  return (
    <BankrollShell className="overflow-hidden px-3 py-3">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_38%)]" />
      <div className="relative grid gap-3">
        <div className="grid grid-cols-[34px_1fr] items-start gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
            <BankrollUiIcon name="shield" className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-black text-white/82">Atlas Plan is a premium education module.</p>
            <p className="mt-0.5 text-[10px] font-semibold leading-4 text-white/45">Atlas Bankroll teaches responsible planning through a guided weekly framework.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {["Bankroll Management", "Discipline", "Consistency", "Planning", "Responsible Administration"].map((item) => (
            <div key={item} className="rounded-[11px] border border-cyan-300/12 bg-cyan-300/[0.035] px-2 py-1.5">
              <p className="text-[9px] font-black text-cyan-100/76">{item}</p>
            </div>
          ))}
        </div>
        <button type="button" className="h-10 rounded-[13px] border border-cyan-300/30 bg-cyan-300 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[0_0_18px_rgba(34,211,238,0.18)]">
          Upgrade Membership
        </button>
      </div>
    </BankrollShell>
  );
}

function BankrollPlanCard({
  metrics,
  atlasPlan,
  planCollection,
  onViewPlans,
}: {
  metrics: FinancialMetrics | null;
  atlasPlan: AtlasPlan | null;
  planCollection: AtlasPlanCollection | null;
  onViewPlans: () => void;
}) {
  const statusTone = atlasPlan ? getPlanStatusTone(atlasPlan.status) : "pending";
  const manualSelectionRequired = Boolean(planCollection?.manualSelectionRequired);
  const activePackage = atlasPlan ? formatPlanPackage(atlasPlan.package) : planCollection?.manualSelectionRequired ? "Free" : atlasBankrollMock.plan.package;
  const rows = [
    ["Package", activePackage],
    ["Status", atlasPlan ? formatPlanStatus(atlasPlan.status) : manualSelectionRequired ? "Manual Required" : atlasBankrollMock.plan.status],
    ["Sport", atlasPlan?.sport ?? atlasBankrollMock.plan.sport],
    ["Plan Unit", atlasPlan ? formatCurrency(atlasPlan.riskAmount) : manualSelectionRequired ? "$0" : metrics ? formatCurrency(metrics.recommendedUnit) : atlasBankrollMock.plan.unit],
  ];

  return (
    <BankrollShell className="overflow-hidden border-emerald-300/24 bg-[radial-gradient(circle_at_18%_15%,rgba(16,185,129,0.16),transparent_38%),linear-gradient(180deg,rgba(6,16,31,0.92),rgba(3,8,20,0.98))] px-3 py-2.5 shadow-[0_0_28px_rgba(16,185,129,0.10)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BankrollUiIcon name="target" className="h-6 w-6 text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.36)]" />
          <p className="text-[13px] font-black uppercase tracking-[0.12em] text-emerald-300">Today&apos;s Atlas Plan</p>
        </div>
        <button type="button" onClick={onViewPlans} className="inline-flex items-center gap-1 rounded-[11px] border border-cyan-300/30 bg-cyan-300/[0.07] px-2.5 py-1 text-[8.5px] font-black uppercase tracking-[0.09em] text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.07)]">
          View Today&apos;s Plan
          <BankrollUiIcon name="arrow" className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-[1.2fr_1fr] items-end gap-2.5">
        <div className="min-w-0">
          <p className="text-[8.5px] font-black uppercase tracking-[0.11em] text-white/42">Today&apos;s Signal</p>
          <p className="mt-0.5 text-[30px] font-black leading-none tracking-tight text-white">{atlasPlan?.selection ?? (manualSelectionRequired ? "Manual Selection Required" : atlasBankrollMock.plan.pick)}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="truncate text-[8px] font-black uppercase tracking-[0.1em] text-white/38">{label}</p>
              <p
                className={`truncate text-[14px] font-black ${
                  label === "Status"
                    ? statusTone === "pending"
                      ? "text-amber-200"
                      : statusTone === "positive"
                        ? "text-emerald-300"
                        : statusTone === "active"
                          ? "text-sky-300"
                          : statusTone === "negative"
                            ? "text-red-300"
                            : "text-white/60"
                    : "text-white"
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </BankrollShell>
  );
}

function BankrollPlanCollectionSheet({
  open,
  collection,
  onClose,
}: {
  open: boolean;
  collection: AtlasPlanCollection | null;
  onClose: () => void;
}) {
  if (!open) return null;

  const plans = collection?.plans ?? [];

  return (
    <div className="fixed inset-0 z-[72] flex items-end justify-center bg-black/72 px-3 pb-[92px] backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[#06101d] p-4 shadow-[0_-18px_70px_rgba(34,211,238,0.14)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200/80">Atlas Plan</p>
            <h3 className="mt-1 text-[22px] font-black text-white">Today&apos;s Plan</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/55">
            Close
          </button>
        </div>

        {collection?.manualSelectionRequired ? (
          <div className="mt-4 rounded-[18px] border border-amber-300/20 bg-amber-300/[0.06] p-3">
            <p className="text-[13px] font-black text-amber-100">Manual Selection Required</p>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-white/50">Free access uses Signals Detected. Manual selection will be added in a future phase.</p>
          </div>
        ) : (
          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300">{plan.sport}</p>
                    <p className="mt-1 truncate text-[15px] font-black text-white">{plan.selection}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/24 px-2 py-1 text-[9px] font-black uppercase tracking-[0.09em] text-white/60">
                    Rank {plan.rank}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Status</p>
                    <p className="mt-0.5 text-[12px] font-black text-amber-200">{formatPlanStatus(plan.status)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Current Rank</p>
                    <p className="mt-0.5 text-[12px] font-black text-white">#{plan.rank}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Original Rank</p>
                    <p className="mt-0.5 text-[12px] font-black text-white/70">#{plan.originalRank}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Replacements</p>
                    <p className="mt-0.5 text-[12px] font-black text-violet-200">{plan.replacementHistory.length}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-[12px] border border-white/10 bg-black/18 px-2 py-1.5">
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Unit</p>
                    <p className="mt-0.5 text-[12px] font-black text-violet-200">{formatCurrency(plan.recommendedUnit)}</p>
                  </div>
                  <div className="rounded-[12px] border border-white/10 bg-black/18 px-2 py-1.5">
                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/34">Plan Unit</p>
                    <p className="mt-0.5 text-[12px] font-black text-white">{formatCurrency(plan.riskAmount)}</p>
                  </div>
                </div>
                {getReplacementSummary(plan) ? (
                  <p className="mt-2 rounded-[12px] border border-amber-300/15 bg-amber-300/[0.055] px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-amber-100/80">
                    {getReplacementSummary(plan)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BankrollWeeklyCard() {
  const metrics = [
    ["Wins", atlasBankrollMock.weekly.wins, "text-emerald-300"],
    ["Losses", atlasBankrollMock.weekly.losses, "text-red-300"],
    ["ROI", atlasBankrollMock.weekly.roi, "text-white"],
    ["Plan Score", atlasBankrollMock.weekly.planScore, "text-cyan-300"],
  ];

  return (
    <BankrollShell className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BankrollUiIcon name="bars" className="h-6 w-6 text-emerald-300" />
          <p className="text-[13px] font-black uppercase tracking-[0.12em] text-emerald-300">Weekly Progress</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-white/50">
          Cycle Progress · {atlasBankrollMock.weekly.cycle}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {metrics.map(([label, value, tone]) => (
          <div key={label} className="min-w-0 border-r border-white/10 last:border-r-0">
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/45">{label}</p>
            <p className={`mt-0.5 text-[19px] font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 h-px overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-300 shadow-[0_0_14px_rgba(52,211,153,0.35)]" style={{ width: `${atlasBankrollMock.weekly.progress}%` }} />
      </div>
    </BankrollShell>
  );
}

function BankrollPerformanceCard({ metrics }: { metrics: FinancialMetrics | null }) {
  const performance = getBankrollPerformance(metrics);

  return (
    <BankrollShell className="px-2.5 py-2">
      <div className="flex items-center gap-2">
        <BankrollUiIcon name="trend" className="h-6 w-6 text-emerald-300" />
        <p className="text-[13px] font-black uppercase tracking-[0.12em] text-emerald-300">Performance</p>
      </div>
      <div className="mt-2 grid grid-cols-4 divide-x divide-white/10 text-center">
        {performance.map((metric) => (
          <div key={metric.label} className="min-w-0 px-1.5 first:pl-0 last:pr-0">
            <p className="truncate text-[8px] font-black uppercase tracking-[0.1em] text-white/45">{metric.label.replace("Current ", "").replace("Today's ", "")}</p>
            <p
              className={`mt-1 text-[20px] font-black leading-tight ${
                metric.tone === "red"
                  ? "text-red-300"
                  : metric.tone === "neutral"
                    ? "text-white/70"
                    : "text-emerald-300"
              }`}
            >
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </BankrollShell>
  );
}

function BankrollInsightCard() {
  return (
    <BankrollShell className="overflow-hidden px-2.5 py-2">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_70%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_90%_80%,rgba(14,165,233,0.12),transparent_32%)]" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BankrollUiIcon name="bulb" className="h-6 w-6 text-sky-300" />
          <p className="text-[13px] font-black uppercase tracking-[0.12em] text-sky-300">Educational Insight</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded-[12px] border border-cyan-300/25 bg-cyan-300/[0.06] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-300">
          Learn More
          <BankrollUiIcon name="arrow" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative mt-1 grid grid-cols-[34px_1fr] items-center gap-2">
        <div className="grid h-[34px] w-[34px] place-items-center rounded-full border border-sky-300/25 bg-sky-300/10 text-sky-300 shadow-[0_0_18px_rgba(14,165,233,0.10)]">
          <BankrollUiIcon name="education" className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-[15px] font-black text-white">{atlasBankrollMock.insight.title}</h3>
          <p className="text-[11px] leading-4 text-white/58">{atlasBankrollMock.insight.body}</p>
        </div>
      </div>
    </BankrollShell>
  );
}

function BankrollPlanTrackingTabs({
  config,
  manualTracking,
  availableAtlasPicks,
  demoModeEnabled,
  snapshot,
  activeTab,
  trackingOnly,
  uiState,
  onTabChange,
  onUIStateChange,
  onCreateManualPick,
  onTrackPick,
}: {
  config: BankrollConfig | null;
  manualTracking: ManualTrackingCollection | null;
  availableAtlasPicks: AtlasTrackingPickOption[];
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  activeTab: "atlas" | "manual";
  trackingOnly: boolean;
  onTabChange: (tab: "atlas" | "manual") => void;
  uiState: BankrollUIState;
  onUIStateChange: (updates: Partial<BankrollUIState>) => void;
  onCreateManualPick: () => void;
  onTrackPick: (atlasPick: AtlasTrackingPickOption, input: AtlasTrackedPickInput) => void;
}) {
  const [trackingRange, setTrackingRange] = useState<TrackingRange>(uiState.trackingRange);
  const [calendarDate, setCalendarDate] = useState(uiState.calendarDate);
  const [selectedTrackingPickId, setSelectedTrackingPickId] = useState<string | null>(uiState.timelineOpen ? uiState.selectedTrackingPickId : null);
  const displayManualTracking = useMemo(() => manualTracking ?? createManualTracking(new Date().toISOString(), config?.currentBankroll ?? 0), [config?.currentBankroll, manualTracking]);
  const trackingHistory = useMemo(() => loadTrackingHistory(displayManualTracking, trackingRange, calendarDate), [calendarDate, displayManualTracking, trackingRange]);
  const trackingAnalytics = useMemo(() => buildManualAnalytics(displayManualTracking, trackingRange, calendarDate), [calendarDate, displayManualTracking, trackingRange]);
  const overallTrackingAnalytics = useMemo(() => buildManualAnalytics(displayManualTracking, "all_time", calendarDate), [calendarDate, displayManualTracking]);
  const trackingComparison = useMemo(() => (config ? buildComparison(config, trackingAnalytics, trackingRange, calendarDate) : null), [calendarDate, config, trackingAnalytics, trackingRange]);
  const overallTrackingComparison = useMemo(() => (config ? buildComparison(config, overallTrackingAnalytics, "all_time", calendarDate) : null), [calendarDate, config, overallTrackingAnalytics]);
  const selectedTrackingPick = trackingHistory.picks.find((item) => item.pick.id === selectedTrackingPickId) ?? null;
  const atlasPlanLockedForFree = Boolean(config?.atlasPlanCollection?.manualSelectionRequired);

  function handleTabChange(tab: "atlas" | "manual") {
    onTabChange(tab);
    if (tab === "atlas") {
      setSelectedTrackingPickId(null);
      onUIStateChange({ activeBankrollTab: tab, selectedTrackingPickId: null, timelineOpen: false });
      return;
    }

    onUIStateChange({ activeBankrollTab: tab });
  }

  function handleRangeChange(range: TrackingRange) {
    setTrackingRange(range);
    setSelectedTrackingPickId(null);
    onUIStateChange({
      trackingRange: range,
      selectedHistoryPeriod: range,
      selectedTrackingPickId: null,
      timelineOpen: false,
    });
  }

  function handleCalendarDateChange(date: string) {
    setCalendarDate(date);
    setSelectedTrackingPickId(null);
    onUIStateChange({
      calendarDate: date,
      selectedHistoryDate: date,
      selectedTrackingPickId: null,
      timelineOpen: false,
    });
  }

  function handleOpenPick(pickId: string) {
    setSelectedTrackingPickId(pickId);
    onUIStateChange({ selectedTrackingPickId: pickId, timelineOpen: true });
  }

  function handleCloseTimeline() {
    setSelectedTrackingPickId(null);
    onUIStateChange({ selectedTrackingPickId: null, timelineOpen: false });
  }

  return (
    <BankrollShell className="px-2.5 py-2">
      {trackingOnly ? null : (
        <div className="grid grid-cols-2 rounded-[14px] border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => handleTabChange("atlas")}
            className={`rounded-[10px] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition duration-200 ${activeTab === "atlas" ? "bg-cyan-300 text-black shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "text-white/45"}`}
          >
            Atlas Plan
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("manual")}
            className={`rounded-[10px] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition duration-200 ${activeTab === "manual" ? "bg-cyan-300 text-black shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "text-white/45"}`}
          >
            Atlas Tracking
          </button>
        </div>
      )}
      {!trackingOnly && activeTab === "atlas" ? (
        <div className="mt-1.5 grid grid-cols-[28px_1fr] items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.035] px-2.5 py-1.5">
          <div className="grid h-7 w-7 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
            <BankrollUiIcon name="wallet" className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            {atlasPlanLockedForFree ? (
              <>
                <p className="text-[12px] font-black text-white/72">Atlas Plan requires membership.</p>
                <p className="mt-0.5 text-[10px] leading-4 text-white/45">Atlas Tracking remains available with Signals Detected.</p>
              </>
            ) : (
              <>
                <p className="text-[12px] font-black text-white/72">Atlas Plan tracking.</p>
                <p className="mt-0.5 text-[10px] leading-4 text-white/45">Automatic Atlas signals remain separate from personal tracking.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={trackingOnly ? "" : "mt-1.5"}>
          <MyTrackingDashboard
            manualTracking={displayManualTracking}
            availableAtlasPicks={availableAtlasPicks}
            demoModeEnabled={demoModeEnabled}
            snapshot={snapshot}
            analytics={overallTrackingAnalytics}
            periodAnalytics={trackingAnalytics}
            comparison={overallTrackingComparison ?? trackingComparison}
            history={trackingHistory}
            selectedTrackingPick={selectedTrackingPick}
            trackingRange={trackingRange}
            calendarDate={calendarDate}
            onRangeChange={handleRangeChange}
            onCalendarDateChange={handleCalendarDateChange}
            onCreateManualPick={onCreateManualPick}
            onTrackPick={onTrackPick}
            onOpenPick={handleOpenPick}
            onBackFromTimeline={handleCloseTimeline}
          />
        </div>
      )}
    </BankrollShell>
  );
}

function MyTrackingDashboard({
  manualTracking,
  availableAtlasPicks,
  demoModeEnabled,
  snapshot,
  analytics,
  periodAnalytics,
  comparison,
  history,
  selectedTrackingPick,
  trackingRange,
  calendarDate,
  onRangeChange,
  onCalendarDateChange,
  onTrackPick,
  onOpenPick,
  onBackFromTimeline,
}: {
  manualTracking: ManualTrackingCollection;
  availableAtlasPicks: AtlasTrackingPickOption[];
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  analytics: ManualTrackingAnalytics;
  periodAnalytics: ManualTrackingAnalytics;
  comparison: TrackingComparison | null;
  history: ReturnType<typeof loadTrackingHistory>;
  selectedTrackingPick: TrackingHistoryPick | null;
  trackingRange: TrackingRange;
  calendarDate: string;
  onRangeChange: (range: TrackingRange) => void;
  onCalendarDateChange: (date: string) => void;
  onCreateManualPick: () => void;
  onTrackPick: (atlasPick: AtlasTrackingPickOption, input: AtlasTrackedPickInput) => void;
  onOpenPick: (pickId: string) => void;
  onBackFromTimeline: () => void;
}) {
  const activePicks = manualTracking.activePicks.length > 0 ? manualTracking.activePicks : manualTracking.picks.filter((pick) => !isFinalTrackingStatus(pick.status));
  const [secondaryView, setSecondaryView] = useState<"main" | "performance" | "history" | "analytics">("main");
  const [cardPicks, setCardPicks] = useState<SportsbookCardPick[]>([]);
  const [betSlipPick, setBetSlipPick] = useState<AtlasTrackingPickOption | null>(null);
  const defaultCardRisk = manualTracking.manualFinancialState.recommendedUnit || manualTracking.manualFinancialState.currentBankroll * ATLAS_RECOMMENDED_PERCENTAGE;
  const activeLinkedIds = useMemo(() => new Set(activePicks.map((pick) => pick.linkedAtlasPickId).filter(Boolean)), [activePicks]);
  const cardPickIds = useMemo(() => new Set(cardPicks.map((item) => item.pick.id)), [cardPicks]);
  const sportsbookPicks = useMemo(
    () => availableAtlasPicks.filter((pick) => !activeLinkedIds.has(pick.id)),
    [activeLinkedIds, availableAtlasPicks],
  );

  function handleAddToCard(pick: AtlasTrackingPickOption) {
    setBetSlipPick(pick);
  }

  function handleConfirmBetSlip(input: { riskAmount: number; notes: string }) {
    if (!betSlipPick) return;

    onTrackPick(betSlipPick, {
      atlasPickId: betSlipPick.id,
      riskAmount: formatSlipInputAmount(input.riskAmount),
      notes: input.notes,
    });
    setBetSlipPick(null);
  }

  function handleRemoveFromCard(pickId: string) {
    setCardPicks((currentPicks) => currentPicks.filter((item) => item.pick.id !== pickId));
  }

  if (secondaryView === "performance") {
    return (
      <MyTrackingSecondaryPanel title="Performance" onBack={() => setSecondaryView("main")}>
        <MyTrackingMetricCard
          title="Manual Performance"
          tone="cyan"
          metrics={[
            { label: "Manual Bankroll", value: formatCurrency(analytics.currentBankroll), valueClass: "text-cyan-200" },
            { label: "Profit / Loss", value: formatTrackingProfit(analytics.profit), valueClass: analytics.profit >= 0 ? "text-emerald-300" : "text-red-300" },
            { label: "ROI", value: formatSignedPercent(analytics.roi), valueClass: analytics.roi >= 0 ? "text-emerald-300" : "text-red-300" },
            { label: "Win Rate", value: `${formatCompactNumber(analytics.winRate)}%`, valueClass: "text-white" },
          ]}
        />
        <MyTrackingMetricCard
          title="Discipline"
          tone="cyan"
          metrics={[
            { label: "Current Streak", value: formatManualStreak(analytics.currentStreak, analytics.currentStreakType) },
            { label: "Completed", value: String(analytics.completedPicks) },
            { label: "Avg Exposure", value: `${formatCompactNumber(analytics.averageRiskPercentage)}%` },
            { label: "Score", value: String(analytics.disciplineScore), valueClass: getDisciplineTextClass(analytics.disciplineScore) },
          ]}
        />
        <ManualSummarySnapshot manualTracking={manualTracking} />
      </MyTrackingSecondaryPanel>
    );
  }

  if (secondaryView === "history") {
    return (
      <MyTrackingSecondaryPanel title="Signal History" onBack={() => setSecondaryView("main")}>
        <TrackingHistoryCard
          history={history}
          totalPicks={periodAnalytics.totalPicks}
          trackingRange={trackingRange}
          calendarDate={calendarDate}
          onRangeChange={onRangeChange}
          onCalendarDateChange={onCalendarDateChange}
          onOpenPick={onOpenPick}
        />
        {selectedTrackingPick ? <PickTimelineSheet item={selectedTrackingPick} onClose={onBackFromTimeline} /> : null}
      </MyTrackingSecondaryPanel>
    );
  }

  if (secondaryView === "analytics") {
    return (
      <MyTrackingSecondaryPanel title="Analytics" onBack={() => setSecondaryView("main")}>
        {comparison ? <TrackingComparisonCompact comparison={comparison} /> : null}
        <ManualBreakdownCard title="Performance By Sport" groups={analytics.performanceBySport} />
        <ManualBreakdownCard title="Performance By Market" groups={analytics.performanceByMarket} />
        <MyTrackingInsightCard analytics={analytics} comparison={comparison} />
      </MyTrackingSecondaryPanel>
    );
  }

  return (
    <div className="grid gap-1.5 pb-3">
      <AvailableSportsbookPicks
        picks={sportsbookPicks}
        cardPickIds={cardPickIds}
        demoModeEnabled={demoModeEnabled}
        snapshot={snapshot}
        onAddPick={handleAddToCard}
      />

      <SportsbookMyCard
        cardPicks={cardPicks}
        activePicks={activePicks}
        demoModeEnabled={demoModeEnabled}
        snapshot={snapshot}
        onRemoveDraftPick={handleRemoveFromCard}
        onOpenTrackedPick={onOpenPick}
      />
      <SportsbookQuickAccess onOpen={setSecondaryView} />
      <SportsbookBetSlipSheet
        pick={betSlipPick}
        recommendedUnit={defaultCardRisk}
        manualBankroll={manualTracking.manualFinancialState.currentBankroll}
        demoModeEnabled={demoModeEnabled}
        snapshot={snapshot}
        onCancel={() => setBetSlipPick(null)}
        onConfirm={handleConfirmBetSlip}
      />
    </div>
  );
}

type SportsbookCardPick = {
  pick: AtlasTrackingPickOption;
  riskAmount: number;
  notes: string;
};

function AvailableSportsbookPicks({
  picks,
  cardPickIds,
  demoModeEnabled,
  snapshot,
  onAddPick,
}: {
  picks: AtlasTrackingPickOption[];
  cardPickIds: Set<string>;
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  onAddPick: (pick: AtlasTrackingPickOption) => void;
}) {
  const visiblePicks = picks.slice(0, 8);
  const availabilityLabel = picks.length > 0 ? `${picks.length} Signals Available Today` : "No Signals Available Today";

  return (
    <div className="rounded-[13px] border border-cyan-300/12 bg-black/18 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Available Signals</p>
          <p className="mt-0.5 text-[10px] font-black text-white/58">{availabilityLabel}</p>
        </div>
        {!demoModeEnabled ? (
          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-200">
            Live Board
          </div>
        ) : null}
      </div>

      {visiblePicks.length > 0 ? (
        <div className="grid gap-1">
          {visiblePicks.map((pick) => (
            <AvailableSportsbookPickRow
              key={pick.id}
              pick={pick}
              added={cardPickIds.has(pick.id)}
              onAdd={() => onAddPick(pick)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[11px] border border-white/10 bg-white/[0.025] px-3 py-3">
          <p className="text-[11px] font-black text-white/68">No Signals Available Today</p>
          <p className="mt-0.5 text-[10px] font-semibold text-white/40">Atlas signals will appear here when sources are active.</p>
        </div>
      )}
    </div>
  );
}

function AvailableSportsbookPickRow({
  pick,
  added,
  onAdd,
}: {
  pick: AtlasTrackingPickOption;
  added: boolean;
  onAdd: () => void;
}) {
  const matchup = formatSportsbookMatchup(pick);
  const confidence = formatPickConfidence(pick);
  const selectionLabel = formatSportsbookSelection(pick);
  const startLabel = formatTime(pick.startTime);

  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.026] px-2 py-1.5 transition duration-200">
      <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[7px] font-black uppercase tracking-[0.08em] text-white/34">
        <span className="text-cyan-200/68">{formatTrackingSportLabel(pick.sport)}</span>
        <span className="h-1 w-1 rounded-full bg-white/18" />
        <span className="truncate">{pick.league}</span>
        <span className="h-1 w-1 rounded-full bg-white/18" />
        <span className="shrink-0">{startLabel}</span>
      </div>
      <div className="grid grid-cols-[1fr_58px] items-center gap-2">
        <div className="min-w-0">
          {matchup.away ? (
            <div className="grid grid-cols-[28px_minmax(0,1fr)_18px_minmax(0,1fr)_28px] items-center gap-1.5">
              <TeamLogoLabel team={matchup.home} sport={pick.sport} />
              <p className="truncate text-[11px] font-black text-white/82">{matchup.home}</p>
              <p className="text-center text-[8px] font-black uppercase text-cyan-200/45">vs</p>
              <p className="truncate text-right text-[11px] font-black text-white/82">{matchup.away}</p>
              <TeamLogoLabel team={matchup.away} sport={pick.sport} muted />
            </div>
          ) : (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-1.5">
              <TeamLogoLabel team={matchup.home} sport={pick.sport} />
              <p className="truncate text-[11px] font-black text-white/82">{matchup.home}</p>
            </div>
          )}
          <p className="mt-1 truncate text-[11px] font-black text-cyan-100">{selectionLabel}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={added}
          className={`h-10 rounded-[10px] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] transition duration-200 active:scale-[0.97] ${
            added
              ? "border-emerald-300/20 bg-emerald-300/[0.12] text-emerald-200"
              : "border-cyan-300/35 bg-cyan-300 text-black shadow-[0_0_16px_rgba(34,211,238,0.2)]"
          }`}
        >
          {added ? "Added ✓" : "Add"}
        </button>
      </div>
      <div className="mt-1 grid grid-cols-[0.72fr_1fr] gap-1.5 border-t border-white/10 pt-1">
        <p className="text-[8px] font-black uppercase tracking-[0.08em] text-white/36">Odds <span className="text-white/70">{formatSportsbookOdds(pick.odds)}</span></p>
        <p className="text-right text-[8px] font-black uppercase tracking-[0.08em] text-white/36">Atlas Confidence <span className="text-cyan-200/80">{confidence}</span></p>
      </div>
    </div>
  );
}

function SportsbookMyCard({
  cardPicks,
  activePicks,
  demoModeEnabled,
  snapshot,
  onRemoveDraftPick,
  onOpenTrackedPick,
}: {
  cardPicks: SportsbookCardPick[];
  activePicks: ManualTrackingCollection["picks"];
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  onRemoveDraftPick: (pickId: string) => void;
  onOpenTrackedPick: (pickId: string) => void;
}) {
  const hasPicks = cardPicks.length > 0 || activePicks.length > 0;
  const totals = calculateSportsbookCardTotals(cardPicks, activePicks);

  return (
    <div className="rounded-[13px] border border-cyan-300/15 bg-cyan-300/[0.035] p-2">
      <div className="mb-1.5 grid gap-1.5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">My Card</p>
          <p className="mt-0.5 text-[9px] font-semibold text-white/38">{totals.count} {totals.count === 1 ? "Signal" : "Signals"} Selected</p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-white/10 rounded-[10px] border border-white/10 bg-black/18 px-2 py-1 text-center">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/32">Signals</p>
            <p className="text-[11px] font-black text-white">{totals.count}</p>
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/32">Risk</p>
            <p className="text-[11px] font-black text-violet-200">{formatCurrency(totals.risk)}</p>
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/32">Potential Return</p>
            <p className="text-[11px] font-black text-cyan-200">{formatCurrency(totals.returnAmount)}</p>
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/32">Profit</p>
            <p className="text-[11px] font-black text-cyan-200">{formatCurrency(totals.profit)}</p>
          </div>
        </div>
      </div>

      {hasPicks ? (
        <div className="grid gap-1">
          {cardPicks.map((item) => (
            <SportsbookDraftCardPick key={item.pick.id} item={item} demoModeEnabled={demoModeEnabled} snapshot={snapshot} onRemove={() => onRemoveDraftPick(item.pick.id)} />
          ))}
          {activePicks.map((pick) => (
            <SportsbookTrackedCardPick key={pick.id} pick={pick} onOpen={() => onOpenTrackedPick(pick.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-dashed border-cyan-300/20 bg-black/16 px-3 py-3 text-center">
          <div className="mx-auto grid h-8 w-8 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
            <BankrollUiIcon name="wallet" className="h-5 w-5" />
          </div>
          <p className="mt-1.5 text-[13px] font-black text-white/78">No Active Signals</p>
          <p className="mt-1 text-[10px] font-semibold leading-4 text-white/42">Completed signals are available in History.</p>
        </div>
      )}
    </div>
  );
}

function SportsbookDraftCardPick({ item, demoModeEnabled, snapshot, onRemove }: { item: SportsbookCardPick; demoModeEnabled: boolean; snapshot: AtlasDailySnapshot | null; onRemove: () => void }) {
  const { pick, riskAmount } = item;
  const matchup = formatSportsbookMatchup(pick);
  const potentialReturn = calculatePotentialReturn(riskAmount, pick.odds);

  return (
    <div className="rounded-[11px] border border-white/10 bg-white/[0.028] px-2 py-1 transition duration-300 ease-out">
      <div className="grid grid-cols-[30px_minmax(0,1fr)_48px_54px] items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] text-[14px] font-black text-cyan-200">
          {getSportGlyph(pick.sport)}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[11px] font-black text-white/82">{pick.selection}</p>
            {demoModeEnabled && snapshot ? <span className="shrink-0 rounded-full bg-amber-300/[0.12] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-amber-200">Last Available</span> : null}
          </div>
          <p className="mt-0.5 truncate text-[9px] font-semibold text-white/38">{pick.market} · {matchup.home}{matchup.away ? ` vs ${matchup.away}` : ""}</p>
          {demoModeEnabled && snapshot ? <p className="mt-0.5 truncate text-[8px] font-semibold text-amber-200/55">Snapshot {formatSnapshotDate(snapshot.snapshotDate)}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[12px] font-black text-white">{formatSportsbookOdds(pick.odds)}</p>
          <p className="mt-0.5 text-[8px] font-bold text-amber-200">Pending</p>
        </div>
        <button type="button" onClick={onRemove} className="h-8 rounded-[9px] border border-red-300/22 bg-red-300/[0.08] px-2 text-[8px] font-black uppercase tracking-[0.08em] text-red-200">
          Remove
        </button>
      </div>
      <div className="mt-1 grid grid-cols-3 divide-x divide-white/10 rounded-[9px] bg-black/16 px-2 py-1 text-center">
        <div>
          <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Risk</p>
          <p className="text-[10px] font-black text-violet-200">{formatCurrency(riskAmount)}</p>
        </div>
        <div>
          <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Potential Return</p>
          <p className="text-[10px] font-black text-cyan-200">{formatCurrency(potentialReturn)}</p>
        </div>
        <div>
          <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Profit</p>
          <p className="text-[10px] font-black text-cyan-200">{formatCurrency(calculatePotentialProfit(riskAmount, pick.odds))}</p>
        </div>
      </div>
    </div>
  );
}

function SportsbookTrackedCardPick({ pick, onOpen }: { pick: ManualTrackingCollection["picks"][number]; onOpen: () => void }) {
  const tone = getTrackingStatusTone(pick.status);
  const potentialReturn = calculatePotentialReturn(pick.riskAmount ?? 0, pick.odds ?? 0);

  return (
    <button type="button" onClick={onOpen} className="grid min-h-[54px] grid-cols-[30px_1fr_58px_58px_12px] items-center gap-2 rounded-[11px] border border-white/10 bg-white/[0.028] px-2 py-1 text-left transition duration-200">
      <div className="grid h-7 w-7 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] text-[14px] font-black text-cyan-200">
        {getSportGlyph(pick.sport ?? "AT")}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-black text-white/82">{pick.selection}</p>
        <p className="mt-0.5 truncate text-[9px] font-semibold text-white/38">{pick.market} · {formatSportsbookOdds(pick.odds)}</p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-black text-violet-200">{formatCurrency(pick.riskAmount)}</p>
        <p className="mt-0.5 text-[8px] font-bold text-white/32">Risk</p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-black text-cyan-200">{formatCurrency(potentialReturn)}</p>
        <p className={`mt-0.5 text-[8px] font-black uppercase tracking-[0.05em] ${tone.textClass}`}>{getTrackingStatusLabel(pick.status)}</p>
      </div>
      <BankrollUiIcon name="arrow" className="h-3 w-3 text-white/32" />
    </button>
  );
}

function SportsbookBetSlipSheet({
  pick,
  recommendedUnit,
  manualBankroll,
  demoModeEnabled,
  snapshot,
  onCancel,
  onConfirm,
}: {
  pick: AtlasTrackingPickOption | null;
  recommendedUnit: number;
  manualBankroll: number;
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  onCancel: () => void;
  onConfirm: (input: { riskAmount: number; notes: string }) => void;
}) {
  const [riskInput, setRiskInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matchup = pick ? formatSportsbookMatchup(pick) : null;
  const riskAmount = parseSportsbookCurrencyInput(riskInput);
  const riskPercentage = riskAmount > 0 ? calculateRiskPercentage(riskAmount, manualBankroll) : 0;
  const potentialReturn = pick ? calculatePotentialReturn(riskAmount, pick.odds) : 0;
  const potentialProfit = pick ? calculatePotentialProfit(riskAmount, pick.odds) : 0;

  useEffect(() => {
    if (!pick) return;
    setRiskInput(recommendedUnit > 0 ? formatSlipInputAmount(recommendedUnit) : "");
    setNotes("");
    setError(null);
  }, [pick, recommendedUnit]);

  if (!pick || !matchup) return null;

  function handleQuickAmount(multiplier: number) {
    const amount = recommendedUnit * multiplier;
    setRiskInput(formatSlipInputAmount(amount));
    setError(null);
  }

  function handleConfirm() {
    if (riskAmount <= 0) {
      setError("Enter a valid risk amount.");
      return;
    }

    if (riskAmount > manualBankroll) {
      setError("Risk amount cannot exceed manual bankroll.");
      return;
    }

    try {
      onConfirm({ riskAmount, notes: notes.trim() });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to add this signal.");
    }
  }

  return (
    <div className="fixed inset-0 z-[76] flex items-end justify-center bg-black/72 px-3 pb-[calc(76px+env(safe-area-inset-bottom))] backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-cyan-300/22 bg-[#06101d] shadow-[0_-18px_70px_rgba(34,211,238,0.18)]">
        <div className="relative px-3 pb-3 pt-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_40%)]" />
          <div className="relative grid gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Bet Slip</p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/42">{pick.sport} · {pick.league}</p>
              </div>
              <button type="button" onClick={onCancel} className="rounded-[10px] border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white/55">
                Cancel
              </button>
            </div>
            {demoModeEnabled && snapshot ? (
              <div className="rounded-[12px] border border-amber-300/18 bg-amber-300/[0.06] px-2.5 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-200">Last Available · {formatSnapshotDate(snapshot.snapshotDate)}</p>
              </div>
            ) : null}

            <div className="rounded-[15px] border border-white/10 bg-black/20 p-2">
              <div className="grid grid-cols-[42px_1fr_52px] items-center gap-2">
                <div className="flex -space-x-2">
                  <TeamLogoLabel team={matchup.home} sport={pick.sport} />
                  <TeamLogoLabel team={matchup.away} sport={pick.sport} muted />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-white/82">{matchup.home}{matchup.away ? <><span className="text-white/28"> vs </span>{matchup.away}</> : null}</p>
                  <p className="mt-0.5 truncate text-[13px] font-black text-cyan-200">{pick.selection}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-white">{formatSportsbookOdds(pick.odds)}</p>
                  <p className="mt-0.5 text-[8px] font-bold text-amber-200">{formatPlanStatus(pick.status)}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 divide-x divide-white/10 rounded-[11px] bg-white/[0.025] px-2 py-1 text-center">
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Market</p>
                  <p className="truncate text-[10px] font-black text-white/70">{pick.market}</p>
                </div>
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Status</p>
                  <p className="truncate text-[10px] font-black text-amber-200">{formatPlanStatus(pick.status)}</p>
                </div>
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Unit</p>
                  <p className="truncate text-[10px] font-black text-violet-200">{formatCurrency(recommendedUnit)}</p>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/42">Risk Amount</span>
              <input
                value={riskInput}
                onChange={(event) => {
                  setRiskInput(event.target.value);
                  setError(null);
                }}
                placeholder="$25"
                inputMode="decimal"
                className="mt-1 h-11 w-full rounded-[14px] border border-white/10 bg-black/28 px-3 text-[20px] font-black text-white outline-none focus:border-cyan-300/45"
              />
            </label>

            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "25%", value: 0.25 },
                { label: "50%", value: 0.5 },
                { label: "75%", value: 0.75 },
                { label: "100%", value: 1 },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleQuickAmount(option.value)}
                  className="h-8 rounded-[10px] border border-cyan-300/20 bg-cyan-300/[0.08] text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200 transition duration-200 active:scale-[0.98]"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 divide-x divide-white/10 rounded-[13px] border border-white/10 bg-black/20 px-2 py-1.5 text-center">
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Risk %</p>
                <p className="text-[11px] font-black text-violet-200">{formatPercentage(riskPercentage).replace("+", "")}</p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Potential Return</p>
                <p className="text-[11px] font-black text-cyan-200">{formatCurrency(potentialReturn)}</p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.08em] text-white/30">Potential Profit</p>
                <p className="text-[11px] font-black text-cyan-200">{formatCurrency(potentialProfit)}</p>
              </div>
            </div>

            <label className="block">
              <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/42">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                placeholder="Why are you tracking this signal?"
                className="mt-1 h-[74px] w-full resize-none rounded-[14px] border border-white/10 bg-black/28 p-2 text-[12px] font-semibold leading-4 text-white outline-none focus:border-cyan-300/45"
              />
            </label>

            {error ? <p className="text-[10px] font-black text-red-300">{error}</p> : null}
            <div className="grid grid-cols-[0.42fr_1fr] gap-2">
              <button type="button" onClick={onCancel} className="h-10 rounded-[13px] border border-white/10 bg-white/[0.04] text-[9px] font-black uppercase tracking-[0.12em] text-white/58">
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} className="h-10 rounded-[13px] bg-cyan-300 text-[9px] font-black uppercase tracking-[0.12em] text-black shadow-[0_0_22px_rgba(34,211,238,0.18)] transition duration-200 active:scale-[0.99]">
                Add To My Card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotDemoBanner({ snapshot }: { snapshot: AtlasDailySnapshot }) {
  return (
    <BankrollShell className="px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-amber-200">
          Last Available
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black text-white/72">No live events are available today.</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-4 text-white/42">Showing the most recent Atlas snapshot from {formatSnapshotDate(snapshot.snapshotDate)} for demonstration purposes.</p>
        </div>
      </div>
    </BankrollShell>
  );
}

function SnapshotDemoInlineBanner({ snapshot }: { snapshot: AtlasDailySnapshot }) {
  return (
    <div className="mb-1.5 rounded-[11px] border border-amber-300/16 bg-amber-300/[0.055] px-2.5 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-200">Last Available · {formatSnapshotDate(snapshot.snapshotDate)}</p>
      <p className="mt-0.5 text-[9px] font-semibold leading-3 text-white/38">Showing the latest available Atlas Snapshot.</p>
    </div>
  );
}

function SportsbookQuickAccess({ onOpen }: { onOpen: (view: "performance" | "history" | "analytics") => void }) {
  return (
    <div className="grid gap-1">
      {[
        { label: "View Performance", subtitle: "Financial Summary", view: "performance" as const },
        { label: "Signal History", subtitle: "Timeline & Results", view: "history" as const },
        { label: "View Analytics", subtitle: "Sports & Markets", view: "analytics" as const },
      ].map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={() => onOpen(item.view)}
          className="flex min-h-10 items-center justify-between rounded-[11px] border border-cyan-300/12 bg-black/18 px-3 py-1.5 text-left transition duration-200 active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-white/66">{item.label}</span>
            <span className="mt-0.5 block text-[9px] font-semibold text-cyan-200/52">{item.subtitle} →</span>
          </span>
          <span className="text-cyan-300">→</span>
        </button>
      ))}
    </div>
  );
}

function MyTrackingSecondaryPanel({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 pb-3">
      <div className="flex h-10 items-center justify-between rounded-[13px] border border-white/10 bg-black/18 px-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{title}</p>
        <button type="button" onClick={onBack} className="rounded-[9px] border border-white/10 bg-white/[0.035] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white/55">
          Back
        </button>
      </div>
      {children}
    </div>
  );
}

function ManualSummarySnapshot({ manualTracking }: { manualTracking: ManualTrackingCollection }) {
  const latestWeekly = manualTracking.manualWeeklySummaries.at(-1);
  const latestMonthly = manualTracking.manualMonthlySummaries.at(-1);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <ManualSummaryMiniCard
        title="Weekly"
        value={latestWeekly ? formatSignedPercent(latestWeekly.roi) : "No Data"}
        detail={latestWeekly ? `${latestWeekly.completedPicks} completed` : "Summary pending"}
      />
      <ManualSummaryMiniCard
        title="Monthly"
        value={latestMonthly ? formatSignedPercent(latestMonthly.roi) : "No Data"}
        detail={latestMonthly ? `${latestMonthly.completedPicks} completed` : "Summary pending"}
      />
    </div>
  );
}

function ManualSummaryMiniCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[13px] border border-white/10 bg-black/18 p-2">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/36">{title}</p>
      <p className="mt-1 text-[13px] font-black text-white">{value}</p>
      <p className="mt-0.5 text-[9px] font-semibold text-white/40">{detail}</p>
    </div>
  );
}

function ManualBreakdownCard({ title, groups }: { title: string; groups: ManualTrackingAnalytics["performanceBySport"] }) {
  const visibleGroups = groups.slice(0, 4);

  return (
    <div className="rounded-[13px] border border-white/10 bg-black/18 p-2">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{title}</p>
      {visibleGroups.length > 0 ? (
        <div className="grid gap-1">
          {visibleGroups.map((group) => (
            <div key={group.key} className="grid grid-cols-[1fr_44px_52px_52px] items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.025] px-2 py-1.5">
              <p className="truncate text-[10px] font-black text-white/72">{group.label}</p>
              <p className="text-right text-[9px] font-bold text-white/38">{group.picks} picks</p>
              <p className="text-right text-[10px] font-black text-white">{formatCompactNumber(group.winRate)}%</p>
              <p className={`text-right text-[10px] font-black ${group.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatTrackingProfit(group.profit)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.025] px-2.5 py-2">
          <p className="text-[10px] font-semibold text-white/42">Analytics will appear after tracked picks are completed.</p>
        </div>
      )}
    </div>
  );
}

function getSportGlyph(sport: AtlasPlanSport | string) {
  if (sport === "MLB") return "MLB";
  if (sport === "NBA") return "NBA";
  if (sport === "NFL") return "NFL";
  if (sport === "NHL") return "NHL";
  if (sport === "SOCCER") return "SOC";
  return "AT";
}

function formatTrackingSportLabel(sport: AtlasPlanSport | string) {
  if (sport === "SOCCER") return "Soccer";
  return String(sport || "Sport");
}

function formatSportsbookSelection(pick: { selection: string; market: string; sport?: AtlasPlanSport | string | null }) {
  const selection = pick.selection.trim();
  const totalMatch = selection.match(/^(Over|Under)\s*\(?(-?\d+(?:\.\d+)?)\)?/i);
  if (totalMatch) {
    const suffix = pick.sport === "SOCCER" ? "Goals" : pick.market.toLowerCase().includes("total") ? "Total" : "";
    return `${capitalizeWord(totalMatch[1])} ${totalMatch[2]}${suffix ? ` ${suffix}` : ""}`;
  }

  return selection
    .replace(/\bML\b/g, "Moneyline")
    .replace(/\bRL\b/g, "Run Line");
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getTeamInitials(team: string, sport: AtlasPlanSport | string) {
  const cleanTeam = team.trim();
  if (!cleanTeam) return getSportGlyph(sport).slice(0, 2);
  const words = cleanTeam.split(/\s+/).filter(Boolean);
  const initials = words.length === 1
    ? words[0].slice(0, 2)
    : `${words[0][0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`;
  return initials.toUpperCase();
}

function TeamLogoLabel({ team, sport, muted = false }: { team: string; sport: AtlasPlanSport | string; muted?: boolean }) {
  return (
    <div
      className={`grid h-7 w-7 place-items-center rounded-full border text-[8px] font-black uppercase tracking-[-0.01em] ${
        muted
          ? "border-sky-300/18 bg-sky-300/[0.055] text-sky-100/70"
          : "border-cyan-300/28 bg-cyan-300/[0.11] text-cyan-100"
      }`}
      title={team || getSportGlyph(sport)}
    >
      {getTeamInitials(team, sport)}
    </div>
  );
}

function formatSportsbookMatchup(pick: Pick<AtlasTrackingPickOption, "homeTeam" | "awayTeam" | "selection">) {
  if (pick.homeTeam && pick.awayTeam) return { home: pick.homeTeam, away: pick.awayTeam };
  const cleanSelection = pick.selection.replace(/\s+(ML|RL|Spread|Moneyline|Over|Under|O\/U).*$/i, "").trim();
  return { home: pick.homeTeam || cleanSelection || "Atlas Signal", away: pick.awayTeam || "" };
}

function formatSportsbookOdds(odds: number | null) {
  if (odds === null || !Number.isFinite(odds)) return "-";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatPickConfidence(pick: AtlasTrackingPickOption) {
  const confidence = Math.max(74, Math.min(94, 95 - pick.rank * 3));
  return `${confidence}%`;
}

function formatSnapshotDate(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function snapshotPicksToSignalRows(picks: AtlasTrackingPickOption[], snapshot: AtlasDailySnapshot | null): SignalDetectedRow[] {
  return picks.map((pick) => ({
    id: `demo-signal-${pick.id}`,
    sport: pick.sport as SignalDetectedRow["sport"],
    matchup: `${pick.awayTeam || "Away"} vs ${pick.homeTeam || "Home"}`,
    pick: pick.selection,
    odds: pick.odds,
    status: "Demo Snapshot",
    time: formatTime(pick.startTime).toUpperCase(),
    startTime: pick.startTime,
    detectedAt: snapshot?.createdAt ?? null,
    liveStatus: "PENDING",
    liveScore: null,
    liveDetail: snapshot ? `Snapshot ${formatSnapshotDate(snapshot.snapshotDate)}` : "Snapshot",
    displayTime: snapshot ? `Snapshot ${formatSnapshotDate(snapshot.snapshotDate)}` : formatTime(pick.startTime).toUpperCase(),
  }));
}

function snapshotPicksToLiveRows(picks: AtlasTrackingPickOption[], snapshot: AtlasDailySnapshot | null): SignalsLiveRow[] {
  return picks.map((pick) => ({
    id: `demo-live-${pick.id}`,
    gameId: pick.eventId ?? pick.id,
    sport: pick.sport as SignalsLiveRow["sport"],
    leagueTitle: pick.league,
    awayTeam: pick.awayTeam || "Away",
    homeTeam: pick.homeTeam || "Home",
    awayScore: "-",
    homeScore: "-",
    centerValue: snapshot ? "DEMO" : formatScoreboardTime(pick.startTime),
    statusLabel: snapshot ? `Snapshot ${formatSnapshotDate(snapshot.snapshotDate)}` : "Snapshot",
    awayOdds: "N/A",
    totalLabel: pick.market,
    homeOdds: formatSportsbookOdds(pick.odds),
  }));
}

function calculatePotentialReturn(riskAmount: number, odds: number) {
  if (!Number.isFinite(riskAmount) || riskAmount <= 0 || !Number.isFinite(odds) || odds === 0) return 0;
  return riskAmount + calculatePotentialProfit(riskAmount, odds);
}

function calculatePotentialProfit(riskAmount: number, odds: number) {
  if (!Number.isFinite(riskAmount) || riskAmount <= 0 || !Number.isFinite(odds) || odds === 0) return 0;
  return odds > 0 ? riskAmount * (odds / 100) : riskAmount * (100 / Math.abs(odds));
}

function parseSportsbookCurrencyInput(value: string) {
  const parsed = Number(value.trim().replace(/^\$/, "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatSlipInputAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function calculateSportsbookCardTotals(cardPicks: SportsbookCardPick[], activePicks: ManualTrackingCollection["picks"]) {
  const draftRisk = cardPicks.reduce((sum, item) => sum + item.riskAmount, 0);
  const trackedRisk = activePicks.reduce((sum, pick) => sum + (pick.riskAmount ?? 0), 0);
  const draftReturn = cardPicks.reduce((sum, item) => sum + calculatePotentialReturn(item.riskAmount, item.pick.odds), 0);
  const trackedReturn = activePicks.reduce((sum, pick) => sum + calculatePotentialReturn(pick.riskAmount ?? 0, pick.odds ?? 0), 0);
  const draftProfit = cardPicks.reduce((sum, item) => sum + calculatePotentialProfit(item.riskAmount, item.pick.odds), 0);
  const trackedProfit = activePicks.reduce((sum, pick) => sum + calculatePotentialProfit(pick.riskAmount ?? 0, pick.odds ?? 0), 0);

  return {
    count: cardPicks.length + activePicks.length,
    risk: draftRisk + trackedRisk,
    returnAmount: draftReturn + trackedReturn,
    profit: draftProfit + trackedProfit,
  };
}

function MyTrackingMetricCard({
  title,
  metrics,
  tone,
}: {
  title: string;
  metrics: Array<{ label: string; value: string; valueClass?: string }>;
  tone: "emerald" | "cyan";
}) {
  const titleClass = tone === "emerald" ? "text-emerald-300" : "text-cyan-300";

  return (
    <div className="rounded-[13px] border border-white/10 bg-black/18 p-2">
      <p className={`mb-1 text-[8px] font-black uppercase tracking-[0.15em] ${titleClass}`}>{title}</p>
      <div className="grid grid-cols-4 divide-x divide-white/10 text-center">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 px-1 first:pl-0 last:pr-0">
            <p className="min-h-[18px] text-[7px] font-black uppercase leading-[9px] tracking-[0.07em] text-white/35">{metric.label}</p>
            <p className={`truncate text-[13px] font-black leading-tight ${metric.valueClass ?? "text-white"}`}>{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivePicksList({
  activePicks,
  onCreateManualPick,
  onOpenPick,
}: {
  activePicks: ManualTrackingCollection["picks"];
  onCreateManualPick: () => void;
  onOpenPick: (pickId: string) => void;
}) {
  return (
    <div className="rounded-[13px] border border-white/10 bg-black/18 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BankrollUiIcon name="target" className="h-4 w-4 text-cyan-300" />
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Active Signals</p>
        </div>
        <button type="button" onClick={onCreateManualPick} className="rounded-[9px] border border-cyan-300/30 bg-cyan-300/[0.10] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-200">
          + Add Signal
        </button>
      </div>
      {activePicks.length > 0 ? (
        <div className="mt-1.5 grid gap-1">
          {activePicks.slice(0, 6).map((pick) => (
            <ActiveTrackingPickRow key={pick.id} pick={pick} onOpen={() => onOpenPick(pick.id)} />
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-[11px] border border-white/10 bg-white/[0.025] px-3 py-2">
          <p className="text-[11px] font-black text-white/68">No active signals.</p>
          <p className="mt-0.5 text-[10px] font-semibold text-white/40">Track an Atlas signal when you are ready to follow it.</p>
        </div>
      )}
    </div>
  );
}

function ActiveTrackingPickRow({ pick, onOpen }: { pick: ManualTrackingCollection["picks"][number]; onOpen: () => void }) {
  const tone = getTrackingStatusTone(pick.status);
  const amount = pick.result ? formatTrackingProfit(pick.profit) : formatCurrency(pick.riskAmount);
  const amountClass = pick.result ? (pick.profit >= 0 ? "text-emerald-300" : "text-red-300") : "text-violet-200";

  return (
    <button type="button" onClick={onOpen} className="grid min-h-[48px] grid-cols-[0.46fr_1fr_0.62fr_0.54fr_14px] items-center gap-1.5 rounded-[10px] border border-white/10 bg-white/[0.025] px-2 py-1 text-left">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-cyan-300">{pick.sport ?? "Sport"}</p>
      <p className="truncate text-[11px] font-black text-white/78">{pick.selection}</p>
      <p className={`truncate text-right text-[8px] font-black uppercase tracking-[0.06em] ${tone.textClass}`}>{getTrackingStatusLabel(pick.status)}</p>
      <p className={`text-right text-[10px] font-black ${amountClass}`}>{amount}</p>
      <BankrollUiIcon name="arrow" className="h-3.5 w-3.5 text-white/35" />
    </button>
  );
}

function TrackingComparisonCompact({ comparison }: { comparison: TrackingComparison }) {
  return (
    <div className="rounded-[13px] border border-cyan-300/15 bg-cyan-300/[0.035] p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Atlas vs Tracking</p>
        <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/35">Cycle Comparison</p>
      </div>
      {comparison.hasComparisonData ? (
        <div className="grid gap-1">
          <div className="grid grid-cols-[0.82fr_0.58fr_0.58fr_0.66fr] border-b border-white/10 px-2 pb-1 text-[7px] font-black uppercase tracking-[0.08em] text-white/30">
            <span>Metric</span>
            <span className="text-center">Atlas</span>
            <span className="text-center">You</span>
            <span className="text-right">Comparison</span>
          </div>
        <ComparisonMetricRow label="ROI" atlasValue={formatSignedPercent(comparison.atlasROI)} manualValue={formatSignedPercent(comparison.manualROI)} leader={comparison.betterROI} />
        <ComparisonMetricRow label="Win Rate" atlasValue={`${formatCompactNumber(comparison.atlasWinRate)}%`} manualValue={`${formatCompactNumber(comparison.manualWinRate)}%`} leader={comparison.betterWinRate} />
        <ComparisonMetricRow label="Discipline" atlasValue={String(comparison.atlasDiscipline)} manualValue={String(comparison.manualDiscipline)} leader={comparison.betterDiscipline} />
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.025] px-2.5 py-1.5">
          <p className="text-[10px] font-semibold leading-4 text-white/48">Comparison will become available after both Atlas Plan and Atlas Tracking complete tracked signals.</p>
        </div>
      )}
    </div>
  );
}

function MyTrackingInsightCard({ analytics, comparison }: { analytics: ManualTrackingAnalytics; comparison: TrackingComparison | null }) {
  const insight = comparison?.insights[0] ?? (analytics.disciplineScore >= 85 ? "Your discipline has remained consistent this week." : "Keep each tracked decision aligned with your plan.");

  return (
    <div className="rounded-[13px] border border-sky-300/15 bg-sky-300/[0.035] px-2.5 py-2">
      <div className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-full border border-sky-300/25 bg-sky-300/10 text-sky-300">
          <BankrollUiIcon name="bulb" className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">Insight</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-4 text-white/64">{insight}</p>
        </div>
        <button type="button" className="rounded-[9px] border border-sky-300/20 bg-sky-300/[0.06] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-sky-200">
          View More
        </button>
      </div>
    </div>
  );
}

function isFinalTrackingStatus(status: ManualTrackingCollection["picks"][number]["status"]) {
  return status === "won" || status === "lost" || status === "push" || status === "cancelled";
}

const trackingRangeOptions: Array<{ label: string; value: TrackingRange }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Calendar", value: "calendar" },
];

function TrackingRangeSelector({
  range,
  calendarDate,
  onRangeChange,
  onCalendarDateChange,
}: {
  range: TrackingRange;
  calendarDate: string;
  onRangeChange: (range: TrackingRange) => void;
  onCalendarDateChange: (date: string) => void;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {trackingRangeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onRangeChange(option.value)}
            className={`shrink-0 rounded-[9px] border px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${
              range === option.value ? "border-cyan-300/45 bg-cyan-300/[0.12] text-cyan-200" : "border-white/10 bg-black/18 text-white/42"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {range === "calendar" ? (
        <input
          type="date"
          value={calendarDate}
          onChange={(event) => onCalendarDateChange(event.target.value)}
          className="mt-1 h-8 w-full rounded-[11px] border border-white/10 bg-black/24 px-2 text-[11px] font-bold text-white/72 outline-none focus:border-cyan-300/45"
        />
      ) : null}
    </div>
  );
}

function TrackingHistoryCard({
  history,
  totalPicks,
  trackingRange,
  calendarDate,
  onRangeChange,
  onCalendarDateChange,
  onOpenPick,
}: {
  history: ReturnType<typeof loadTrackingHistory>;
  totalPicks: number;
  trackingRange: TrackingRange;
  calendarDate: string;
  onRangeChange: (range: TrackingRange) => void;
  onCalendarDateChange: (date: string) => void;
  onOpenPick: (pickId: string) => void;
}) {
  return (
    <div className="rounded-[13px] border border-white/10 bg-black/18 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BankrollUiIcon name="wallet" className="h-4 w-4 text-cyan-300" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Signal History</p>
            <p className="mt-0.5 text-[9px] font-semibold text-white/38">{totalPicks} signals tracked this period</p>
          </div>
        </div>
      </div>
      <TrackingRangeSelector range={trackingRange} calendarDate={calendarDate} onRangeChange={onRangeChange} onCalendarDateChange={onCalendarDateChange} />
      <TrackingHistoryList history={history} onOpenPick={onOpenPick} />
    </div>
  );
}

function TrackingHistoryList({
  history,
  onOpenPick,
}: {
  history: ReturnType<typeof loadTrackingHistory>;
  onOpenPick: (pickId: string) => void;
}) {
  if (history.picks.length === 0) {
    return (
      <div className="mt-2 rounded-[12px] border border-white/10 bg-black/18 px-3 py-3">
        <p className="text-[11px] font-black text-white/65">No signals for this period.</p>
        <p className="mt-0.5 text-[10px] font-semibold leading-4 text-white/40">Tracked Atlas signals will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="mt-1 grid max-h-[230px] gap-1.5 overflow-y-auto pr-1">
      {history.groups.map((group) => (
        <div key={group.key}>
          <p className="mb-1 border-b border-white/10 pb-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/38">{group.label}</p>
          <div className="grid gap-1">
            {group.picks.map((item) => (
              <TrackingPickCard key={item.pick.id} item={item} onOpen={() => onOpenPick(item.pick.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ComparisonMetricRow({
  label,
  atlasValue,
  manualValue,
  leader,
}: {
  label: string;
  atlasValue: string;
  manualValue: string;
  leader: ComparisonLeader;
}) {
  return (
    <div className="grid grid-cols-[0.82fr_0.58fr_0.58fr_0.66fr] items-center gap-2 border-b border-white/10 px-2 py-1.5 last:border-b-0">
      <p className="text-[9px] font-black uppercase tracking-[0.08em] text-white/40">{label}</p>
      <p className="text-center text-[10px] font-black text-white/72">{atlasValue}</p>
      <p className="text-center text-[10px] font-black text-emerald-200">{manualValue}</p>
      <p className="text-right text-[8px] font-black uppercase tracking-[0.08em] text-cyan-300">{formatComparisonLeader(leader)}</p>
    </div>
  );
}

function TrackingPickCard({ item, onOpen }: { item: TrackingHistoryPick; onOpen: () => void }) {
  const pick = item.pick;
  const matchup = formatSportsbookMatchup(pick);
  const selectionLabel = formatSportsbookSelection(pick);
  const resultLabel = getTrackingResultLabel(pick.status);
  const startLabel = formatTime(pick.startTime || pick.createdAt);

  return (
    <button type="button" onClick={onOpen} className="rounded-[12px] border border-white/10 bg-white/[0.026] px-2 py-1.5 text-left transition duration-200">
      <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[7px] font-black uppercase tracking-[0.08em] text-white/34">
        <span className="text-cyan-200/68">{formatTrackingSportLabel(pick.sport ?? "Sport")}</span>
        <span className="h-1 w-1 rounded-full bg-white/18" />
        <span className="truncate">{pick.league}</span>
        <span className="h-1 w-1 rounded-full bg-white/18" />
        <span className="shrink-0">{startLabel}</span>
      </div>
      <div className="grid grid-cols-[1fr_64px] items-center gap-2">
        <div className="min-w-0">
          {matchup.away ? (
            <div className="grid grid-cols-[28px_minmax(0,1fr)_18px_minmax(0,1fr)_28px] items-center gap-1.5">
              <TeamLogoLabel team={matchup.home} sport={pick.sport ?? "AT"} />
              <p className="truncate text-[11px] font-black text-white/82">{matchup.home}</p>
              <p className="text-center text-[8px] font-black uppercase text-cyan-200/45">vs</p>
              <p className="truncate text-right text-[11px] font-black text-white/82">{matchup.away}</p>
              <TeamLogoLabel team={matchup.away} sport={pick.sport ?? "AT"} muted />
            </div>
          ) : (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-1.5">
              <TeamLogoLabel team={matchup.home} sport={pick.sport ?? "AT"} />
              <p className="truncate text-[11px] font-black text-white/82">{matchup.home}</p>
            </div>
          )}
          <p className="mt-1 truncate text-[11px] font-black text-cyan-100">{selectionLabel}</p>
        </div>
        <div className={`grid h-10 place-items-center rounded-[10px] border px-1.5 text-[8px] font-black uppercase tracking-[0.08em] ${getTrackingResultPillClass(pick.status)}`}>
          {resultLabel}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 border-t border-white/10 pt-1 text-[8px] font-black uppercase tracking-[0.08em] text-white/36">
        <p>Odds <span className="text-white/70">{pick.trackedOdds ?? pick.odds ?? "-"}</span></p>
        <p>Risk <span className="text-violet-200">{formatCurrency(pick.riskAmount)}</span></p>
        <p className={pick.result ? (pick.profit >= 0 ? "text-emerald-300" : "text-red-300") : "text-white/34"}>{pick.result ? formatTrackingProfit(pick.profit) : "—"}</p>
        <p className="text-right text-white/34">{formatTrackingDate(pick.createdAt)}</p>
      </div>
    </button>
  );
}

function PickTimelineSheet({ item, onClose }: { item: TrackingHistoryPick; onClose: () => void }) {
  const pick = item.pick;
  const tone = getTrackingStatusTone(pick.status);
  const matchup = formatSportsbookMatchup(pick);
  const orderedTimeline = orderTrackingTimeline(item.timeline);

  return (
    <div className="fixed inset-0 z-[76] flex items-end justify-center bg-black/70 px-3 pb-[88px] backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close signal timeline" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-white/12 bg-[#07111f] shadow-[0_-18px_70px_rgba(34,211,238,0.14)]">
        <div className="mx-auto mt-2 h-1 w-16 rounded-full bg-white/28" />
        <div className="relative p-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_42%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200/60">Signal Timeline</p>
                <p className="mt-1 truncate text-[14px] font-black text-white">{matchup.home}{matchup.away ? ` vs ${matchup.away}` : ""}</p>
              </div>
              <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[18px] leading-none text-white/55">
                ×
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[42px_1fr_44px_58px] items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.035] px-2 py-2">
              <div className="flex -space-x-2">
                <TeamLogoLabel team={matchup.home} sport={pick.sport ?? "AT"} />
                <TeamLogoLabel team={matchup.away} sport={pick.sport ?? "AT"} muted />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black text-cyan-100">{pick.selection}</p>
                <p className="truncate text-[8px] font-bold text-white/38">{pick.market}</p>
              </div>
              <p className="text-right text-[10px] font-black text-white/60">{pick.trackedOdds ?? pick.odds ?? "-"}</p>
              <p className={`truncate text-right text-[8px] font-black uppercase tracking-[0.06em] ${tone.textClass}`}>{getTrackingStatusLabel(pick.status)}</p>
            </div>

            <div className="mt-3 max-h-[410px] overflow-y-auto pr-1">
              <div className="relative grid gap-2">
                <div className="absolute bottom-3 left-[9px] top-3 w-px bg-cyan-300/22" />
                {orderedTimeline.map((event) => (
                  <div key={event.id} className="relative grid grid-cols-[20px_48px_1fr] gap-2">
                    <div className={`relative z-10 mt-0.5 grid h-5 w-5 place-items-center rounded-full border bg-[#07111f] text-[9px] font-black ${getTimelineEventClass(event.status)}`}>
                      {getTimelineEventSymbol(event.status)}
                    </div>
                    <p className="pt-0.5 text-[8px] font-black uppercase tracking-[0.06em] text-white/35">{formatTrackingTime(event.time)}</p>
                    <div className="min-w-0 pb-1.5">
                      <p className="truncate text-[11px] font-black text-white/78">{formatTimelineDescription(event.description)}</p>
                      <p className="mt-0.5 text-[9px] font-semibold leading-4 text-white/40">{formatTimelineHelper(event.description, event.status)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function orderTrackingTimeline(events: TrackingHistoryPick["timeline"]) {
  const order = [
    "Manual Pick Created",
    "Tracking Started",
    "Game Started",
    "Result Synced",
    "Manual Bankroll Updated",
    "Weekly Summary Generated",
    "Monthly Summary Generated",
  ];

  return [...events].sort((a, b) => {
    const aIndex = order.indexOf(a.description);
    const bIndex = order.indexOf(b.description);
    const normalizedA = aIndex === -1 ? order.length : aIndex;
    const normalizedB = bIndex === -1 ? order.length : bIndex;
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return new Date(a.time).getTime() - new Date(b.time).getTime();
  });
}

function getTrackingStatusTone(status: TrackingHistoryPick["pick"]["status"]) {
  if (status === "won") {
    return {
      iconClass: "border-emerald-300/30 bg-emerald-300/[0.12] text-emerald-300",
      textClass: "text-emerald-300",
    };
  }

  if (status === "lost") {
    return {
      iconClass: "border-red-300/30 bg-red-300/[0.12] text-red-300",
      textClass: "text-red-300",
    };
  }

  if (status === "confirmed") {
    return {
      iconClass: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200",
      textClass: "text-emerald-200",
    };
  }

  if (status === "started") {
    return {
      iconClass: "border-cyan-300/30 bg-cyan-300/[0.10] text-cyan-300",
      textClass: "text-cyan-300",
    };
  }

  if (status === "pending") {
    return {
      iconClass: "border-amber-300/30 bg-amber-300/[0.12] text-amber-300",
      textClass: "text-amber-200",
    };
  }

  return {
    iconClass: "border-white/15 bg-white/[0.05] text-white/45",
    textClass: "text-white/45",
  };
}

function getTrackingStatusSymbol(status: TrackingHistoryPick["pick"]["status"]) {
  if (status === "won") return "✓";
  if (status === "lost") return "✕";
  if (status === "confirmed") return "✓";
  if (status === "pending" || status === "started") return "•";
  return "–";
}

function getTrackingStatusLabel(status: TrackingHistoryPick["pick"]["status"]) {
  if (status === "downgraded" || status === "removed" || status === "no_eligible_replacement") return "Archived";
  return formatPlanStatus(status);
}

function getTrackingResultLabel(status: TrackingHistoryPick["pick"]["status"]) {
  if (status === "won") return "Won ✓";
  if (status === "lost") return "Lost ✕";
  if (status === "push") return "Push";
  if (status === "cancelled") return "Cancelled";
  return getTrackingStatusLabel(status);
}

function getTrackingResultPillClass(status: TrackingHistoryPick["pick"]["status"]) {
  if (status === "won") return "border-emerald-300/24 bg-emerald-300/[0.10] text-emerald-200";
  if (status === "lost") return "border-red-300/24 bg-red-300/[0.09] text-red-200";
  if (status === "push" || status === "cancelled") return "border-white/15 bg-white/[0.055] text-white/55";
  if (status === "started") return "border-cyan-300/24 bg-cyan-300/[0.08] text-cyan-200";
  return "border-amber-300/24 bg-amber-300/[0.08] text-amber-200";
}

function getTimelineEventClass(status: TrackingHistoryPick["timeline"][number]["status"]) {
  if (status === "won") return "border-emerald-300/30 bg-emerald-300/[0.12] text-emerald-300";
  if (status === "lost") return "border-red-300/30 bg-red-300/[0.12] text-red-300";
  if (status === "confirmed") return "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200";
  if (status === "started") return "border-cyan-300/30 bg-cyan-300/[0.10] text-cyan-300";
  if (status === "pending") return "border-amber-300/30 bg-amber-300/[0.12] text-amber-300";
  return "border-white/15 bg-white/[0.05] text-white/45";
}

function getTimelineEventSymbol(status: TrackingHistoryPick["timeline"][number]["status"]) {
  if (status === "won") return "✓";
  if (status === "lost") return "✕";
  if (status === "pending" || status === "confirmed" || status === "started") return "•";
  return "–";
}

function formatTimelineHelper(description: string, status: TrackingHistoryPick["timeline"][number]["status"]) {
  if (description.toLowerCase().includes("created")) return "Signal added to your tracking.";
  if (description.toLowerCase().includes("tracking")) return "You started following this signal.";
  if (description.toLowerCase().includes("bankroll")) return "Your manual bankroll was updated.";
  if (description.toLowerCase().includes("weekly")) return "Included in weekly summary.";
  if (description.toLowerCase().includes("monthly")) return "Included in monthly summary.";
  if (status === "won" || status === "lost" || status === "push" || status === "cancelled") return "Result recorded from Atlas.";
  if (status === "started") return "The event has started.";
  return "Waiting for the next update.";
}

function formatTimelineDescription(description: string) {
  return description.replace(/\bPick\b/g, "Signal").replace(/\bpick\b/g, "signal");
}

function formatTrackingDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTrackingTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTrackingProfit(value: number) {
  if (value === 0) return "$0";
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatSignedPercent(value: number) {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${formatCompactNumber(value)}%`;
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatManualStreak(value: number, type: "won" | "lost" | null) {
  if (!type || value <= 0) return "0";
  return `${value}${type === "won" ? "W" : "L"}`;
}

function getDisciplineTextClass(score: number) {
  if (score >= 90) return "text-emerald-300";
  if (score >= 75) return "text-cyan-300";
  if (score >= 60) return "text-amber-200";
  return "text-red-300";
}

function formatComparisonLeader(leader: ComparisonLeader) {
  if (leader === "atlas") return "Atlas +";
  if (leader === "manual") return "You +";
  if (leader === "even") return "Even";
  return "";
}

function ManualPickCreatorSheet({
  open,
  currentBankroll,
  availablePicks,
  onClose,
  onSave,
}: {
  open: boolean;
  currentBankroll: number;
  availablePicks: AtlasTrackingPickOption[];
  onClose: () => void;
  onSave: (atlasPick: AtlasTrackingPickOption, input: AtlasTrackedPickInput) => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedSport, setSelectedSport] = useState<AtlasTrackingPickOption["sport"] | null>(null);
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null);
  const [riskAmount, setRiskAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sports = Array.from(new Set(availablePicks.map((pick) => pick.sport)));
  const sportPicks = selectedSport ? availablePicks.filter((pick) => pick.sport === selectedSport) : [];
  const selectedPick = availablePicks.find((pick) => pick.id === selectedPickId) ?? null;
  const riskAmountValue = Number(riskAmount.trim().replace(/^\$/, "").replaceAll(",", ""));
  const riskPercentage = Number.isFinite(riskAmountValue) ? calculateRiskPercentage(riskAmountValue, currentBankroll) : 0;

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedSport(null);
    setSelectedPickId(null);
    setRiskAmount("");
    setNotes("");
    setError(null);
  }, [open]);

  function handleNext() {
    if (step === 1 && !selectedSport) {
      setError("Select a sport.");
      return;
    }
    if (step === 2 && !selectedPickId) {
      setError("Select an Atlas signal.");
      return;
    }
    if (step === 3) {
      if (!riskAmountValue || riskAmountValue <= 0) {
        setError("Enter a valid plan unit.");
        return;
      }
      if (riskAmountValue > currentBankroll) {
        setError("Plan unit cannot exceed manual bankroll.");
        return;
      }
    }

    setError(null);
    setStep((current) => Math.min(5, current + 1));
  }

  function handleSave() {
    if (!selectedPick) {
      setError("Select an Atlas signal.");
      return;
    }

    try {
      onSave(selectedPick, { atlasPickId: selectedPick.id, riskAmount, notes });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to track signal.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[74] flex items-end justify-center bg-black/72 px-3 pb-[92px] backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-300/22 bg-[#06101d] shadow-[0_-18px_70px_rgba(16,185,129,0.18)]">
        <div className="relative px-4 pb-4 pt-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.10),transparent_40%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/80">Atlas Tracking</p>
                <h3 className="mt-1 text-[22px] font-black tracking-tight text-white">Track Atlas Signal</h3>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-white/55">Choose an Atlas-generated signal to follow.</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/55">
                Cancel
              </button>
            </div>

            <div className="mt-3 min-h-[360px]">
              {step === 1 ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/48">Available Sports</p>
                  <div className="grid grid-cols-3 gap-2">
                    {sports.map((sport) => (
                      <button
                        key={sport}
                        type="button"
                        onClick={() => {
                          setSelectedSport(sport);
                          setSelectedPickId(null);
                          setError(null);
                        }}
                        className={`rounded-[14px] border px-3 py-3 text-[11px] font-black uppercase tracking-[0.1em] ${
                          selectedSport === sport ? "border-emerald-300/55 bg-emerald-300/[0.12] text-emerald-200" : "border-white/10 bg-white/[0.035] text-white/55"
                        }`}
                      >
                        {sport === "SOCCER" ? "Soccer" : sport}
                      </button>
                    ))}
                  </div>
                  {sports.length === 0 ? <p className="text-[11px] font-semibold text-white/45">No Atlas signals available for your package yet.</p> : null}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid max-h-[310px] gap-2 overflow-y-auto pr-1">
                  {sportPicks.map((pick) => (
                    <button
                      key={pick.id}
                      type="button"
                      onClick={() => {
                        setSelectedPickId(pick.id);
                        setError(null);
                      }}
                      className={`rounded-[15px] border p-3 text-left ${selectedPickId === pick.id ? "border-emerald-300/55 bg-emerald-300/[0.10]" : "border-white/10 bg-white/[0.035]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-black text-white">{pick.selection}</p>
                          <p className="mt-1 text-[10px] font-bold text-white/45">{pick.market} · {pick.odds}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-300">{pick.source}</p>
                          <p className="mt-1 text-[9px] font-bold text-white/42">{formatPlanStatus(pick.status)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/42">Plan Unit</span>
                    <input
                      value={riskAmount}
                      onChange={(event) => {
                        setRiskAmount(event.target.value);
                        setError(null);
                      }}
                      placeholder="$25"
                      inputMode="decimal"
                      className="mt-1 h-12 w-full rounded-[15px] border border-white/10 bg-black/26 px-3 text-[22px] font-black text-white outline-none focus:border-emerald-300/45"
                    />
                  </label>
                  <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Calculated Percentage</p>
                    <p className="mt-1 text-[22px] font-black text-emerald-300">{formatPercentage(riskPercentage).replace("+", "")}</p>
                    <p className="mt-1 text-[11px] font-semibold text-white/45">Based on manual bankroll: {formatCurrency(currentBankroll)}</p>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/42">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                    placeholder="Optional notes"
                    className="mt-1 h-[170px] w-full resize-none rounded-[15px] border border-white/10 bg-black/26 p-3 text-[13px] font-semibold leading-5 text-white outline-none focus:border-emerald-300/45"
                  />
                  <p className="mt-1 text-right text-[9px] font-bold text-white/35">{notes.length}/500</p>
                </label>
              ) : null}

              {step === 5 && selectedPick ? (
                <div className="space-y-2 rounded-[18px] border border-white/10 bg-black/22 p-3">
                  {[
                    ["Sport", selectedPick.sport],
                    ["Selection", selectedPick.selection],
                    ["Market", selectedPick.market],
                    ["Odds", String(selectedPick.odds)],
                    ["Plan Unit", riskAmount ? formatCurrency(Number(riskAmount.replace(/^\$/, ""))) : "$0"],
                    ["Plan Percentage", formatPercentage(riskPercentage).replace("+", "")],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5 last:border-b-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/38">{label}</p>
                      <p className="text-right text-[13px] font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? <p className="mb-2 text-[11px] font-black text-red-300">{error}</p> : null}
            <div className="grid grid-cols-[0.45fr_1fr] gap-2">
              <button type="button" onClick={step === 1 ? onClose : () => setStep((current) => Math.max(1, current - 1))} className="h-11 rounded-[14px] border border-white/10 bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
                {step === 1 ? "Cancel" : "Back"}
              </button>
              <button type="button" onClick={step === 5 ? handleSave : handleNext} className="h-11 rounded-[14px] bg-emerald-300 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[0_0_22px_rgba(52,211,153,0.18)]">
                {step === 5 ? "Track Signal" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankrollHydrationPlaceholder() {
  return (
    <div className="min-h-[862px] space-y-2.5" aria-hidden="true">
      <BankrollShell className="h-[102px] overflow-hidden px-4 py-3.5">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.06),transparent_40%)]" />
        <div className="relative h-full animate-pulse rounded-[18px] bg-white/[0.025]" />
      </BankrollShell>
      <BankrollShell className="h-[145px] overflow-hidden border-emerald-300/18 bg-[#06101d]/78 px-3 py-2.5">
        <div className="h-full animate-pulse rounded-[18px] bg-white/[0.025]" />
      </BankrollShell>
      <BankrollShell className="h-[120px] overflow-hidden px-2.5 py-2">
        <div className="h-full animate-pulse rounded-[18px] bg-white/[0.025]" />
      </BankrollShell>
      <BankrollShell className="h-[96px] overflow-hidden px-2.5 py-2">
        <div className="h-full animate-pulse rounded-[18px] bg-white/[0.025]" />
      </BankrollShell>
      <BankrollShell className="h-[90px] overflow-hidden px-2.5 py-2">
        <div className="h-full animate-pulse rounded-[18px] bg-white/[0.025]" />
      </BankrollShell>
    </div>
  );
}

function BankrollSetupSheet({
  open,
  config,
  trackingMode = false,
  onClose,
  onSave,
}: {
  open: boolean;
  config: BankrollConfig | null;
  trackingMode?: boolean;
  onClose: () => void;
  onSave: (config: BankrollConfig) => void;
}) {
  const [step, setStep] = useState<"bankroll" | "profile">("bankroll");
  const [bankrollInput, setBankrollInput] = useState("");
  const [profile, setProfile] = useState<BankrollProfile>("atlas_recommended");
  const [error, setError] = useState<string | null>(null);
  const validation = validateBankroll(bankrollInput);
  const bankrollValue = validation.valid ? validation.value : 0;
  const recommendedUnit = validation.valid ? calculateRecommendedUnit(bankrollValue, profile) : 0;
  const isEditing = Boolean(config);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;

    setStep("bankroll");
    setBankrollInput(config ? String(config.initialBankroll) : "");
    setProfile(config?.profile ?? "atlas_recommended");
    setError(null);
  }, [config, open]);

  function handleBankrollContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateBankroll(bankrollInput);
    if (!result.valid) {
      setError(result.error);
      return;
    }

    setError(null);
    setStep("profile");
  }

  function handleSave() {
    const result = validateBankroll(bankrollInput);
    if (!result.valid) {
      setError(result.error);
      setStep("bankroll");
      return;
    }

    onSave(config ? updateBankrollConfig(config, result.value, profile) : createBankrollConfig(result.value, profile));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/72 px-3 pb-[92px] backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-300/22 bg-[#06101d] shadow-[0_-18px_70px_rgba(16,185,129,0.18)]">
        <div className="relative px-4 pb-4 pt-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.10),transparent_40%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/80">{trackingMode ? "Atlas Tracking" : "Atlas Bankroll"}</p>
                <h3 className="mt-1 text-[22px] font-black tracking-tight text-white">
                  {trackingMode ? (isEditing ? "Update tracking balance" : "Set tracking balance") : (isEditing ? "Update your plan" : "Set your bankroll")}
                </h3>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-white/55">{trackingMode ? "Track your signals with a separate balance." : "Stay consistent with your plan."}</p>
              </div>
              {isEditing ? (
                <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/55">
                  Close
                </button>
              ) : null}
            </div>

            <div className="mt-4 min-h-[365px]">
              {step === "bankroll" ? (
                <form className="flex min-h-[365px] flex-col" onSubmit={handleBankrollContinue}>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/48">{trackingMode ? "Tracking Balance" : "Initial Bankroll"}</span>
                      <input
                        value={bankrollInput}
                        onChange={(event) => {
                          setBankrollInput(event.target.value);
                          setError(null);
                        }}
                        inputMode="decimal"
                        placeholder="$200"
                        className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/26 px-4 text-[24px] font-black text-white outline-none transition focus:border-emerald-300/50"
                      />
                    </label>
                    <p className="text-[12px] font-semibold leading-5 text-white/55">{trackingMode ? "Enter the balance you want to use for Atlas Tracking." : "Enter the bankroll you want Atlas to manage."}</p>
                    {error ? <p className="text-[11px] font-black text-red-300">{error}</p> : null}
                  </div>
                  <button type="submit" className="mt-auto h-11 w-full rounded-[14px] bg-emerald-300 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[0_0_22px_rgba(52,211,153,0.18)]">
                    Continue
                  </button>
                </form>
              ) : (
                <div className="min-h-[365px] space-y-3">
                  <div className="grid gap-2">
                    {bankrollProfileOptions.map((option) => {
                      const selected = option.profile === profile;

                      return (
                        <button
                          key={option.profile}
                          type="button"
                          onClick={() => setProfile(option.profile)}
                          className={`rounded-[18px] border px-3 py-3 text-left transition ${
                            selected
                              ? "border-emerald-300/55 bg-emerald-300/[0.10] shadow-[0_0_18px_rgba(52,211,153,0.12)]"
                              : "border-white/10 bg-white/[0.035]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-black text-white">{option.title}</p>
                              <p className="mt-1 text-[11px] font-bold text-white/50">{option.exposure}</p>
                            </div>
                            <div className="text-right">
                              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.09em] ${option.profile === "atlas_recommended" ? "bg-emerald-300/14 text-emerald-200" : "bg-amber-300/14 text-amber-200"}`}>
                                {option.badge}
                              </span>
                              <p className="mt-1 text-[18px] font-black text-white">{option.percentage}</p>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-white/46">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-black/22 p-3 text-center">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/36">Initial Bankroll</p>
                      <p className="mt-1 text-[15px] font-black text-white">{formatCurrency(bankrollValue)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/36">Profile</p>
                      <p className="mt-1 text-[12px] font-black text-emerald-300">{bankrollProfileLabels[profile]}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/36">Recommended Unit</p>
                      <p className="mt-1 text-[15px] font-black text-violet-300">{formatCurrency(recommendedUnit)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[0.45fr_1fr] gap-2">
                    <button type="button" onClick={() => setStep("bankroll")} className="h-11 rounded-[14px] border border-white/10 bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
                      Back
                    </button>
                    <button type="button" onClick={handleSave} className="h-11 rounded-[14px] bg-emerald-300 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[0_0_22px_rgba(52,211,153,0.18)]">
                      {isEditing ? "Update Atlas Plan" : "Start Atlas Plan"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankrollResetSheet({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/72 px-3 pb-[92px] backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[26px] border border-red-300/20 bg-[#07101f] p-4 shadow-[0_-18px_70px_rgba(248,113,113,0.14)]">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-200/80">Reset Plan</p>
        <h3 className="mt-1 text-[22px] font-black text-white">Clear bankroll setup?</h3>
        <p className="mt-2 text-[12px] font-semibold leading-5 text-white/55">
          This removes your local Bankroll configuration and returns Atlas Bankroll to onboarding.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="h-11 rounded-[14px] border border-white/10 bg-white/[0.04] text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-[14px] bg-red-300 text-[10px] font-black uppercase tracking-[0.12em] text-black">
            Reset Plan
          </button>
        </div>
      </div>
    </div>
  );
}

function AtlasBankrollScreen({
  atlasSources,
  membership,
  globalDemoModeEnabled = false,
}: {
  atlasSources: AtlasPackageSources;
  membership: {
    package: AtlasPlanPackage;
    selectedSport: AtlasPlanSport | null;
    availableSports: AtlasPlanSport[];
  };
  globalDemoModeEnabled?: boolean;
}) {
  const [config, setConfig] = useState<BankrollConfig | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [manualPickOpen, setManualPickOpen] = useState(false);
  const [uiState, setUIState] = useState<BankrollUIState | null>(null);
  const [activeBankrollTab, setActiveBankrollTab] = useState<"atlas" | "manual">("atlas");
  const bankrollRenderNowRef = useRef(new Date().toISOString());
  const financialPlan = useMemo(() => (config ? buildFinancialPlan(config) : null), [config]);
  const metrics = financialPlan?.metrics ?? null;
  const liveAvailableAtlasPicks = useMemo(() => (config ? loadAvailableAtlasPicks({ ...config, membership }, bankrollRenderNowRef.current, atlasSources) : []), [atlasSources, config, membership]);
  const latestSnapshot = useMemo(() => loadLatestSnapshot(config), [config]);
  const snapshotMode = useMemo(() => resolveSnapshotMode(liveAvailableAtlasPicks, latestSnapshot), [latestSnapshot, liveAvailableAtlasPicks]);
  const bankrollDemoModeEnabled = globalDemoModeEnabled || snapshotMode.demoModeEnabled;
  const bankrollDemoSnapshot = snapshotMode.snapshot ?? latestSnapshot;
  const effectiveAtlasSources = useMemo(
    () => (bankrollDemoModeEnabled ? snapshotToAtlasSources(bankrollDemoSnapshot) : atlasSources),
    [atlasSources, bankrollDemoModeEnabled, bankrollDemoSnapshot],
  );
  const planCollection = useMemo(
    () => (config && metrics ? syncPlans(config.atlasPlanCollection, membership, metrics, bankrollRenderNowRef.current, effectiveAtlasSources) : config?.atlasPlanCollection ?? null),
    [config, effectiveAtlasSources, membership, metrics],
  );
  const atlasPlan = planCollection?.primaryPlan ?? config?.atlasPlan ?? null;
  const atlasPlanLockedForFree = Boolean(planCollection?.manualSelectionRequired);
  const manualTracking = config?.manualTracking ?? null;
  const sourceAtlasPicks = useMemo(() => atlasSourcesToTrackingPicks(effectiveAtlasSources), [effectiveAtlasSources]);
  const availableAtlasPicks = useMemo(
    () => snapshotMode.picks.map((pick) => {
      const sourcePick = sourceAtlasPicks.find((candidate) => candidate.id === pick.id);
      if (!sourcePick) return pick;

      return {
        ...pick,
        league: pick.league || sourcePick.league,
        eventId: pick.eventId || sourcePick.eventId,
        homeTeam: pick.homeTeam || sourcePick.homeTeam,
        awayTeam: pick.awayTeam || sourcePick.awayTeam,
        eventDate: pick.eventDate || sourcePick.eventDate,
        eventTime: pick.eventTime || sourcePick.eventTime,
        startTime: pick.startTime || sourcePick.startTime,
      };
    }),
    [snapshotMode.picks, sourceAtlasPicks],
  );
  const manualCurrentBankroll = manualTracking?.manualFinancialState.currentBankroll ?? metrics?.currentBankroll ?? config?.currentBankroll ?? 0;

  useEffect(() => {
    const storedUIState = loadBankrollUIState();
    const storedConfig = loadBankrollConfig();
    setUIState(storedUIState);
    setActiveBankrollTab(storedUIState.activeBankrollTab);
    setConfig(storedConfig);
    setHydrated(true);
    setSetupOpen(!storedConfig);
  }, []);

  useEffect(() => {
    if (!config) return;
    if (
      config.membership?.package === membership.package &&
      config.membership?.selectedSport === membership.selectedSport &&
      JSON.stringify(config.membership?.availableSports ?? []) === JSON.stringify(membership.availableSports)
    ) {
      return;
    }

    const nextConfig = normalizeBankrollConfig({ ...config, membership });
    if (JSON.stringify(nextConfig) === JSON.stringify(config)) return;
    saveBankrollConfig(nextConfig);
    setConfig(nextConfig);
  }, [config, membership]);

  useEffect(() => {
    if (!config) return;
    if (globalDemoModeEnabled) return;

    const nextSnapshot = liveAvailableAtlasPicks.length > 0
      ? createSnapshot(liveAvailableAtlasPicks, {
          createdAt: bankrollRenderNowRef.current,
          package: membership.package,
        })
      : latestSnapshot;
    const nextConfig = liveAvailableAtlasPicks.length > 0 && nextSnapshot
      ? deactivateDemoMode(config, nextSnapshot, bankrollRenderNowRef.current)
      : nextSnapshot
        ? activateDemoMode(config, nextSnapshot, bankrollRenderNowRef.current)
        : deactivateDemoMode(config, null, bankrollRenderNowRef.current);
    const currentSnapshotState = JSON.stringify({
      lastAtlasSnapshot: config.lastAtlasSnapshot ?? null,
      lastSnapshotDate: config.lastSnapshotDate ?? null,
      demoModeEnabled: Boolean(config.demoModeEnabled),
    });
    const nextSnapshotState = JSON.stringify({
      lastAtlasSnapshot: nextConfig.lastAtlasSnapshot ?? null,
      lastSnapshotDate: nextConfig.lastSnapshotDate ?? null,
      demoModeEnabled: Boolean(nextConfig.demoModeEnabled),
    });

    if (currentSnapshotState === nextSnapshotState) return;

    const normalizedConfig = normalizeBankrollConfig(nextConfig);
    saveBankrollConfig(normalizedConfig);
    setConfig(normalizedConfig);
  }, [config, globalDemoModeEnabled, latestSnapshot, liveAvailableAtlasPicks, membership.package]);

  useEffect(() => {
    if (!config || availableAtlasPicks.length === 0 || !config.manualTracking?.picks.length) return;

    const nextConfig = syncManualTrackingWithAtlas(config, availableAtlasPicks, bankrollRenderNowRef.current);
    if (JSON.stringify(nextConfig.manualTracking) === JSON.stringify(config.manualTracking)) return;

    saveBankrollConfig(nextConfig);
    setConfig(nextConfig);
  }, [availableAtlasPicks, config]);

  function handleSaveConfig(nextConfig: BankrollConfig) {
    const normalizedConfig = normalizeBankrollConfig({ ...nextConfig, membership });
    saveBankrollConfig(normalizedConfig);
    setConfig(normalizedConfig);
    setSetupOpen(false);
  }

  function handleResetConfig() {
    clearBankrollConfig();
    setConfig(null);
    setResetOpen(false);
    setPlansOpen(false);
    setSetupOpen(true);
  }

  function handleUpdateUIState(updates: Partial<BankrollUIState>) {
    setUIState((currentState) => {
      const nextState = { ...(currentState ?? loadBankrollUIState()), ...updates };
      if (currentState && JSON.stringify(nextState) === JSON.stringify(currentState)) return currentState;
      saveBankrollUIState(nextState);
      return nextState;
    });
  }

  function handleSaveManualPick(atlasPick: AtlasTrackingPickOption, input: AtlasTrackedPickInput) {
    if (!config) return;

    const baseManualTracking = manualTracking ?? createManualTracking(new Date().toISOString(), manualCurrentBankroll);
    const nextManualTracking = createTrackedPick(baseManualTracking, atlasPick, input, manualCurrentBankroll);
    const nextConfig = normalizeBankrollConfig(saveManualTracking({ ...config, membership }, nextManualTracking));
    saveBankrollConfig(nextConfig);
    setConfig(nextConfig);
    setManualPickOpen(false);
  }

  if (!hydrated || !uiState) {
    return <BankrollHydrationPlaceholder />;
  }

  return (
    <div className="space-y-2.5">
      {activeBankrollTab === "manual" ? (
        <AtlasTrackingHeader
          demoModeEnabled={bankrollDemoModeEnabled}
          snapshot={bankrollDemoSnapshot}
          onEdit={() => setSetupOpen(true)}
          onReset={() => setResetOpen(true)}
          canReset={Boolean(config)}
        />
      ) : (
        <BankrollHeader onEdit={() => setSetupOpen(true)} onReset={() => setResetOpen(true)} canReset={Boolean(config)} />
      )}
      <BankrollPlanTrackingTabs
        config={config}
        manualTracking={manualTracking}
        availableAtlasPicks={availableAtlasPicks}
        demoModeEnabled={bankrollDemoModeEnabled}
        snapshot={bankrollDemoSnapshot}
        activeTab={activeBankrollTab}
        trackingOnly={false}
        onTabChange={setActiveBankrollTab}
        uiState={uiState}
        onUIStateChange={handleUpdateUIState}
        onCreateManualPick={() => setManualPickOpen(true)}
        onTrackPick={handleSaveManualPick}
      />
      {activeBankrollTab === "atlas" && bankrollDemoModeEnabled && bankrollDemoSnapshot ? <SnapshotDemoBanner snapshot={bankrollDemoSnapshot} /> : null}
      {activeBankrollTab === "atlas" ? (
        atlasPlanLockedForFree ? (
          <AtlasPlanUpgradePlaceholder />
        ) : (
          <>
            <BankrollPlanCard metrics={metrics} atlasPlan={atlasPlan} planCollection={planCollection} onViewPlans={() => setPlansOpen(true)} />
            <BankrollSummaryCard config={config} metrics={metrics} />
            <BankrollWeeklyCard />
            <BankrollPerformanceCard metrics={metrics} />
            <BankrollInsightCard />
          </>
        )
      ) : null}
      <BankrollSetupSheet open={setupOpen} config={config} trackingMode={membership.package === "free"} onClose={() => setSetupOpen(false)} onSave={handleSaveConfig} />
      <ManualPickCreatorSheet
        open={manualPickOpen}
        currentBankroll={manualCurrentBankroll}
        availablePicks={availableAtlasPicks}
        onClose={() => setManualPickOpen(false)}
        onSave={handleSaveManualPick}
      />
      <BankrollPlanCollectionSheet open={plansOpen} collection={planCollection} onClose={() => setPlansOpen(false)} />
      <BankrollResetSheet open={resetOpen} onCancel={() => setResetOpen(false)} onConfirm={handleResetConfig} />
    </div>
  );
}

const homeMembershipPlans = [
  {
    plan: "exclusive" as const,
    title: "Exclusive",
    price: "$34.99",
    subtitle: "All Available Sports",
    featureTitle: "Ranked Top 3",
    featureSubtitle: "Signals Detected",
    features: ["All Available Sports", "Top 3 Signals Detected", "Ranked Signals", "Live Status Updates", "Signal History"],
    cta: "Get Exclusive",
    accent: "cyan" as const,
  },
  {
    plan: "premium" as const,
    title: "Premium",
    price: "$59.99",
    subtitle: "Choose Your Sport",
    featureTitle: "Up to 5 Official",
    featureSubtitle: "Ranked Signals",
    features: ["Choose 1 Sport", "Up to 5 Official Signals", "Ranked Signals", "Live Status Updates", "Signal History"],
    cta: "Get Premium",
    accent: "gold" as const,
    badge: "Most Popular",
  },
  {
    plan: "unlimited" as const,
    title: "Atlas Unlimited",
    price: "$99.99",
    subtitle: "All Available Sports",
    featureTitle: "Up to 5 Official",
    featureSubtitle: "For Every Sport",
    features: ["All Available Sports", "Up to 5 Per Sport", "Ranked Signals", "Auto-Includes New Sports", "Signal History"],
    cta: "Get Unlimited",
    accent: "purple" as const,
  },
];

const homeMembershipStyles = {
  cyan: {
    shell: "border-cyan-300/40 bg-cyan-400/[0.045] shadow-[0_0_18px_rgba(34,211,238,0.12)]",
    text: "text-cyan-300",
    pill: "border-cyan-300/35 bg-cyan-300/10 text-cyan-200",
    button: "border-cyan-300/70 bg-cyan-300 text-black shadow-[0_0_14px_rgba(34,211,238,0.22)]",
    check: "text-cyan-300",
    icon: "border-cyan-300/45 bg-cyan-300/10 text-cyan-200",
  },
  gold: {
    shell: "border-amber-300/55 bg-amber-400/[0.055] shadow-[0_0_20px_rgba(251,191,36,0.16)]",
    text: "text-amber-300",
    pill: "border-amber-300/45 bg-amber-300/12 text-amber-200",
    button: "border-amber-300/80 bg-amber-300 text-black shadow-[0_0_14px_rgba(251,191,36,0.22)]",
    check: "text-amber-300",
    icon: "border-amber-300/45 bg-amber-300/10 text-amber-200",
  },
  purple: {
    shell: "border-purple-300/45 bg-purple-400/[0.045] shadow-[0_0_18px_rgba(192,132,252,0.14)]",
    text: "text-purple-300",
    pill: "border-purple-300/40 bg-purple-300/10 text-purple-200",
    button: "border-purple-300/75 bg-purple-500 text-white shadow-[0_0_14px_rgba(192,132,252,0.22)]",
    check: "text-purple-300",
    icon: "border-purple-300/45 bg-purple-300/10 text-purple-200",
  },
};

function HomeMembershipIcon({ type, className = "" }: { type: "star" | "crown" | "diamond"; className?: string }) {
  if (type === "crown") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <circle cx="14" cy="19" r="4" fill="currentColor" />
        <circle cx="32" cy="11" r="4" fill="currentColor" />
        <circle cx="50" cy="19" r="4" fill="currentColor" />
        <path d="M12 25 25 36 32 18l7 18 13-11-4 22H16l-4-22Z" fill="currentColor" />
        <path d="M16 50h32l-3 7H19l-3-7Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === "diamond") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <path d="M11 21 22 9h20l11 12-21 35L11 21Z" fill="currentColor" />
        <path d="M22 9 27 21H11L22 9Zm20 0-5 12h16L42 9ZM27 21h10l-5 35-5-35Z" fill="rgba(255,255,255,.32)" />
        <path d="m22 9 10 12L42 9H22Zm5 12 5 35 5-35H27Z" fill="rgba(5,8,22,.34)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
      <path d="m32 8.5 6.8 13.8 15.2 2.2-11 10.8 2.6 15.2L32 43.3l-13.6 7.2L21 35.3 10 24.5l15.2-2.2L32 8.5Z" />
    </svg>
  );
}

const subscriptionPlansBoard = (
  <section className="space-y-3">
    <div className="text-center">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="h-px bg-cyan-300/22" />
        <h2 className="text-[14px] font-black uppercase tracking-[0.22em] text-cyan-300">
          Choose Your Plan
        </h2>
        <span className="h-px bg-cyan-300/22" />
      </div>
      <p className="mt-1.5 text-[10.5px] font-semibold text-white/50">
        Pick the plan that matches your game.
      </p>
    </div>

    {hasPaidSubscription ? (
      <button
        type="button"
        onClick={handleManageBilling}
        disabled={billingBusy}
        className="w-full rounded-[16px] border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 text-[13px] font-black text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Manage Billing
      </button>
    ) : null}

    <PackSportSelector
      value={selectedPackSport}
      onChange={setSelectedPackSport}
      sports={activeSubscriptionSports}
    />

    <div className="grid grid-cols-3 gap-1.5">
      {homeMembershipPlans.map((plan) => {
        const styles = homeMembershipStyles[plan.accent];

        return (
          <article
            key={`home-membership-${plan.plan}`}
            className={`relative flex min-h-[270px] min-w-0 flex-col rounded-[15px] border px-1.5 pb-1.5 pt-3.5 text-left ${styles.shell}`}
          >
            {plan.badge ? (
              <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-300 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.06em] text-black">
                {plan.badge}
              </span>
            ) : null}

            <div className="flex justify-center">
              <span className={`grid h-9 w-9 place-items-center rounded-full border shadow-[0_0_12px_currentColor] ${styles.icon}`}>
                <HomeMembershipIcon
                  type={plan.plan === "premium" ? "crown" : plan.plan === "unlimited" ? "diamond" : "star"}
                  className="h-5 w-5"
                />
              </span>
            </div>

            <p className={`mt-1.5 text-center text-[11.5px] font-black uppercase tracking-[0.07em] ${styles.text}`}>
              {plan.title}
            </p>
            <p className="mt-0.5 text-center text-[7.5px] font-bold leading-tight text-white/78">
              {plan.subtitle}
            </p>

            <div className={`mt-1.5 rounded-[10px] border px-1 py-1.5 text-center ${styles.pill}`}>
              <p className="text-[9px] font-black leading-tight text-white">{plan.featureTitle}</p>
              <p className={`mt-0.5 text-[8px] font-black leading-tight ${styles.text}`}>{plan.featureSubtitle}</p>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-0.5">
              {plan.features.map((feature) => (
                <p key={feature} className="grid grid-cols-[9px_1fr] gap-1 text-[7.5px] font-semibold leading-tight text-white/76">
                  <span className={`${styles.check} leading-tight`}>✓</span>
                  <span>{feature}</span>
                </p>
              ))}
            </div>

            <div className="mt-auto pt-1.5">
              <div className="text-center">
                <span className="text-[14px] font-black leading-none text-white">{plan.price}</span>
                <span className="ml-0.5 text-[7px] font-bold text-white/52">/mo</span>
              </div>

              <button
                type="button"
                onClick={() => handleSubscribe(plan.plan, selectedPackSport)}
                disabled={checkoutPlan !== null}
                className={`mt-1.5 h-[29px] w-full rounded-[9px] border px-0.5 text-[8px] font-black uppercase tracking-[0.035em] disabled:opacity-60 ${styles.button}`}
              >
                {plan.cta}
              </button>
            </div>
          </article>
        );
      })}
    </div>

    <StripeTrustBar />
  </section>
);

  if (showSplash && !useBankrollSplashOverlay) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <AtlasSplashScreen entered={splashEntered} />
      </main>
    );
  }

  if (!authLoaded && !(showSplash && useBankrollSplashOverlay)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050816] px-6 text-center text-white">
        <div>
          <img
            src="/icon.png"
            alt="Atlas Signals"
            className="mx-auto h-14 w-14 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.40)]"
          />
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            Checking Access
          </p>
        </div>
      </main>
    );
  }

  if (!authSession.authenticated && !guestBoardMode && !(showSplash && useBankrollSplashOverlay)) {
    return (
      <AtlasAccessGate
        onFree={() => router.push("/login?intent=free#create-account")}
        onLogin={() => router.push("/login?mode=login")}
        onViewBoard={() =>
          router.push(
            `/?board=1&section=signals&sport=TOP&view=live&day=${activeDay}`
          )
        }
      />
    );
  }

  if (appSection === "alerts" || (appSection === "signals" && viewMode === "live" && !shouldShowSubscriptionPlans)) {
    const signalHomeRows = groupedSignalLiveGames
      .flatMap((group) =>
        group.games.flatMap((game) => {
          const livePickData = getLivePickForSport(game, group.sport, {
            mlb: mlbSignalsData,
            nba: nbaSignalsData,
            nhl: nhlSignalsData,
            soccer: soccerSignalsLiveData,
          });

          const top5 = getTop5BySport(
            group.sport,
            activeMlbTop5Data,
            activeNbaTop5Data,
            activeNhlTop5Data,
            activeSoccerTop5Data
          );

          if (!livePickData || isTop5LiveGame(game, top5)) {
            return [];
          }

          const live = isGameLive(game);
          const pickResult = getLivePickResult(game, livePickData) ?? "PENDING";
          const awayScore = getLiveScoreValue(game, game.away_team);
          const homeScore = getLiveScoreValue(game, game.home_team);
          const hasScore = awayScore !== "-" || homeScore !== "-";
          const liveStatus: "PENDING" | "LIVE" | "FINAL" | "WON" | "LOST" | "PUSH" =
            pickResult !== "PENDING"
              ? pickResult
              : game.completed
              ? "FINAL"
              : live
              ? "LIVE"
              : "PENDING";
          const liveScore = hasScore
            ? `${getLiveDisplayName(game.away_team)} ${awayScore} · ${getLiveDisplayName(game.home_team)} ${homeScore}`
            : null;
          const liveDetail = game.completed ? "Final" : live ? getGameMinute(game) : null;

          return [
            {
              id: `${game.id}-${group.sport}`,
              sport: group.sport as "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER",
              matchup: `${getLiveDisplayName(game.away_team)} vs ${getLiveDisplayName(game.home_team)}`,
              pick: formatDisplayedPick(livePickData.pick, group.sport),
              odds: livePickData.odds ?? null,
              status: String(livePickData.status ?? "Pending"),
              time: formatTime(game.commence_time).toUpperCase(),
              startTime: game.commence_time,
              liveStatus,
              liveScore,
              liveDetail,
              displayTime: formatTime(game.commence_time).toUpperCase(),
            },
          ];
        })
      );
    const signalsLiveRows: SignalsLiveRow[] = groupedFilteredLiveGames.flatMap((group) =>
      group.games.map((game, index) => {
        const oddsGame = findOddsGameForLive(game, liveOddsGames);
        const awayScore = getLiveScoreValue(game, game.away_team);
        const homeScore = getLiveScoreValue(game, game.home_team);
        const hasScore = awayScore !== "-" || homeScore !== "-";
        const live = isGameLive(game);
        const statusLabel = game.completed
          ? "Final"
          : live
          ? getGameMinute(game)
          : "";
        const centerValue = hasScore
          ? `${awayScore}-${homeScore}`
          : live
          ? getGameMinute(game)
          : formatScoreboardTime(game.commence_time);

        return {
          id: `signals-live-${group.leagueKey}-${game.id}-${index}`,
          gameId: String(game.id),
          sport: group.sport as SignalsLiveRow["sport"],
          leagueTitle: group.title,
          awayTeam: getLiveDisplayName(game.away_team),
          homeTeam: getLiveDisplayName(game.home_team),
          awayScore: String(awayScore),
          homeScore: String(homeScore),
          centerValue,
          statusLabel,
          awayOdds: oddsGame ? formatAmericanOdds(getMoneyline(oddsGame, game.away_team)) : "N/A",
          totalLabel: getScoreboardTotalLabel(oddsGame),
          homeOdds: oddsGame ? formatAmericanOdds(getMoneyline(oddsGame, game.home_team)) : "N/A",
        };
      })
    );
    const effectiveSignalHomeRows = signalHomeRows.length > 0 ? signalHomeRows : snapshotPicksToSignalRows(globalSnapshotMode.picks, globalSnapshotMode.snapshot);
    const effectiveSignalsLiveRows = signalsLiveRows.length > 0 ? signalsLiveRows : snapshotPicksToLiveRows(globalSnapshotMode.picks, globalSnapshotMode.snapshot);

    return (
      <SignalsHomePage
        topPlay={precisionTopPlay}
        topSignals={precisionTopSignals}
        signalRows={effectiveSignalHomeRows}
        liveRows={effectiveSignalsLiveRows}
        liveLoading={liveLoading}
        liveErrorMessage={null}
        signalGroupCount={effectiveSignalHomeRows.length}
        activeSection={appSection}
        demoModeEnabled={globalSnapshotMode.demoModeEnabled}
        demoSnapshotDate={globalSnapshotMode.snapshot?.snapshotDate ?? null}
        loading={precisionLoading}
        errorMessage={precisionError}
        journeyMessage={signalsJourneyMessage}
        onDismissJourneyMessage={() => setSignalsJourneyMessage(null)}
        onRetry={() => setPrecisionRefreshKey((value) => value + 1)}
        onNavigate={(section) => navigateAppState({ section })}
        onSportProductAction={(sport) => handleTopSignalCommerceAction(sport)}
        onTopPlayAction={handleTopPlayCommerceAction}
        onTopPlayNotify={() => handlePrecisionNotify("top_play")}
        onSportNotify={(sport) => handlePrecisionNotify(topSignalProductForSport(sport), sport)}
        activeDate={activeDay}
        onDateChange={(date) => navigateAppState({ section: "signals", view: "live", day: date })}
        activeSubscriptionSports={activeSubscriptionSports}
        selectedSubscriptionSport={selectedPackSport}
        onSelectedSubscriptionSportChange={setSelectedPackSport}
        onPlanSubscribe={(plan, sport) => {
          void handleSubscribe(plan, sport);
        }}
        onLiveRowOpen={(row) => {
          const liveGame = groupedFilteredLiveGames
            .flatMap((group) => group.games.map((game) => ({ game, sport: group.sport })))
            .find(({ game }) => String(game.id) === row.gameId);

          if (liveGame) {
            handleLiveGameClick(liveGame.game, liveGame.sport);
          }
        }}
      />
    );
  }

  if (appSection === "more") {
    const joinPlans = [
      {
        plan: "exclusive" as const,
        title: "Exclusive",
        price: "$34.99",
        subtitle: "Choose Your Sport",
        featureTitle: "Not Ranked Top 3",
        featureSubtitle: "One Sport Focus",
        features: ["Choose 1 Sport", "Top 3 Signals", "Not Ranked", "Signal History", "Closing Status"],
        cta: "Get Exclusive",
        accent: "cyan" as const,
      },
      {
        plan: "premium" as const,
        title: "Premium",
        price: "$59.99",
        subtitle: "Choose Your Sport",
        featureTitle: "Ranked Top 3",
        featureSubtitle: "Best to Worst",
        features: ["Choose 1 Sport", "Ranked Top 3", "Best to Worst", "Atlas AI Ranking", "Signal History", "Closing Status"],
        cta: "Get Premium",
        accent: "gold" as const,
        badge: "Most Popular",
      },
      {
        plan: "unlimited" as const,
        title: "Atlas Unlimited",
        price: "$99.99",
        subtitle: "All Available Sports",
        featureTitle: "Up to 5 Official",
        featureSubtitle: "For Every Sport",
        features: ["All Available Sports", "Up to 5 Per Sport", "Ranked Signals", "Auto-Includes New Sports", "Signal History", "Closing Status"],
        cta: "Get Unlimited",
        accent: "purple" as const,
      },
    ];
    const joinStyles = {
      cyan: {
        shell: "border-cyan-300/40 bg-cyan-400/[0.045] shadow-[0_0_18px_rgba(34,211,238,0.12)]",
        text: "text-cyan-300",
        pill: "border-cyan-300/35 bg-cyan-300/10 text-cyan-200",
        button: "border-cyan-300/70 bg-cyan-300 text-black shadow-[0_0_14px_rgba(34,211,238,0.22)]",
        check: "text-cyan-300",
        icon: "border-cyan-300/45 bg-cyan-300/10 text-cyan-200",
      },
      gold: {
        shell: "border-amber-300/55 bg-amber-400/[0.055] shadow-[0_0_20px_rgba(251,191,36,0.16)]",
        text: "text-amber-300",
        pill: "border-amber-300/45 bg-amber-300/12 text-amber-200",
        button: "border-amber-300/80 bg-amber-300 text-black shadow-[0_0_14px_rgba(251,191,36,0.22)]",
        check: "text-amber-300",
        icon: "border-amber-300/45 bg-amber-300/10 text-amber-200",
      },
      purple: {
        shell: "border-purple-300/45 bg-purple-400/[0.045] shadow-[0_0_18px_rgba(192,132,252,0.14)]",
        text: "text-purple-300",
        pill: "border-purple-300/40 bg-purple-300/10 text-purple-200",
        button: "border-purple-300/75 bg-purple-500 text-white shadow-[0_0_14px_rgba(192,132,252,0.22)]",
        check: "text-purple-300",
        icon: "border-purple-300/45 bg-purple-300/10 text-purple-200",
      },
    };
    const comparisonRows = [
      ["Choose 1 Sport", "✓", "✓", "✓"],
      ["Top 3 Signals", "✓", "✓", "✓"],
      ["Ranked (Best to Worst)", "×", "✓", "✓"],
      ["All Active Sports", "×", "×", "✓"],
      ["Auto-Includes New Sports", "×", "×", "✓"],
      ["Signal History", "✓", "✓", "✓"],
      ["Closing Status", "✓", "✓", "✓"],
    ];
    function JoinIcon({ type, className = "" }: { type: "star" | "crown" | "diamond"; className?: string }) {
      if (type === "crown") {
        return (
          <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
            <circle cx="14" cy="19" r="4" fill="currentColor" />
            <circle cx="32" cy="11" r="4" fill="currentColor" />
            <circle cx="50" cy="19" r="4" fill="currentColor" />
            <path d="M12 25 25 36 32 18l7 18 13-11-4 22H16l-4-22Z" fill="currentColor" />
            <path d="M16 50h32l-3 7H19l-3-7Z" fill="currentColor" />
          </svg>
        );
      }

      if (type === "diamond") {
        return (
          <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
            <path d="M11 21 22 9h20l11 12-21 35L11 21Z" fill="currentColor" />
            <path d="M22 9 27 21H11L22 9Zm20 0-5 12h16L42 9ZM27 21h10l-5 35-5-35Z" fill="rgba(255,255,255,.32)" />
            <path d="m22 9 10 12L42 9H22Zm5 12 5 35 5-35H27Z" fill="rgba(5,8,22,.34)" />
          </svg>
        );
      }

      return (
        <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
          <path d="m32 8.5 6.8 13.8 15.2 2.2-11 10.8 2.6 15.2L32 43.3l-13.6 7.2L21 35.3 10 24.5l15.2-2.2L32 8.5Z" />
        </svg>
      );
    }

    function JoinUiIcon({
      type,
      className = "",
    }: {
      type: "signin" | "signup" | "lock" | "check" | "shield" | "updates" | "trophy";
      className?: string;
    }) {
      if (type === "signin") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <path d="M10 7V5.8c0-.9.7-1.6 1.6-1.6h6.1c.9 0 1.6.7 1.6 1.6v12.4c0 .9-.7 1.6-1.6 1.6h-6.1c-.9 0-1.6-.7-1.6-1.6V17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M3.8 12h10.4m-3.4-3.6 3.6 3.6-3.6 3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }

      if (type === "signup") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
            <path d="M3.8 19.2c.8-3 2.6-4.5 5.2-4.5 2.1 0 3.7 1 4.6 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M17.5 8.5v6M14.5 11.5h6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        );
      }

      if (type === "lock") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7.7a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 14v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );
      }

      if (type === "check") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
            <path d="m8 12.2 2.4 2.4L16.2 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }

      if (type === "shield") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <path d="M12 3.5 19 6v5.2c0 4.4-2.7 7.5-7 9.3-4.3-1.8-7-4.9-7-9.3V6l7-2.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m8.8 12 2 2 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }

      if (type === "updates") {
        return (
          <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 12h1.5l1.2-3.2 2.2 6.4 1.3-3.2H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.2 6.8 5.6 5.2M16.8 6.8l1.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        );
      }

      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M7 5h10v3a5 5 0 0 1-10 0V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 7H4.5c0 4 2 6 5 6.5M17 7h2.5c0 4-2 6-5 6.5M12 13v4M8.5 20h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }

    return (
      <main className="h-[100dvh] overflow-hidden bg-[#020715] text-white">
        <div className="mx-auto h-[100dvh] w-full max-w-md bg-[#020715]">
          <div className="relative h-[100dvh] overflow-hidden">
            <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-screen w-full max-w-md overflow-hidden">
              <img
                src="/join-atlas-frame.jpeg"
                alt="Join Atlas Signals"
                className="h-full w-full object-cover object-top"
              />
            </div>
            <button
              type="button"
              onClick={() => navigateAppState({ section: "signals", view: "live", sport: "TOP" })}
              aria-label="Back to signals"
              className="fixed left-[max(14px,calc(50%_-_210px))] top-[5.2%] z-30 h-12 w-12 rounded-full"
            />

            <div
              className="fixed inset-0 z-10 mx-auto w-full max-w-md overflow-y-auto overscroll-contain"
              style={{ clipPath: "inset(19vh 0 0 0)" }}
            >
            <div className="space-y-4 px-4 pb-[108px] pt-[19vh]">
            <section className="rounded-[18px] border border-cyan-300/18 bg-[#07111d]/90 p-3 shadow-[0_0_24px_rgba(34,211,238,0.08)] backdrop-blur-md">
              <div className="grid grid-cols-[1fr_34px_1fr] items-center gap-2">
                <div className="text-center">
                  <h2 className="text-[14px] font-black text-white">Welcome Back</h2>
                  <p className="mt-1 text-[10px] font-semibold text-white/54">Sign in to continue</p>
                  <button
                    type="button"
                    onClick={() => {
                      setJoinAuthMode("signin");
                      setJoinAuthOpen(true);
                      setJoinAuthMessage(null);
                    }}
                    className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-cyan-300 text-[12px] font-black uppercase tracking-[0.10em] text-black shadow-[0_0_18px_rgba(34,211,238,0.18)]"
                  >
                    <JoinUiIcon type="signin" className="h-5 w-5" />
                    Sign In
                  </button>
                </div>

                <div className="flex h-full flex-col items-center justify-center">
                  <span className="h-8 w-px bg-white/10" />
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-white/12 bg-[#080d19] text-[10px] font-black text-white/78">OR</span>
                  <span className="h-8 w-px bg-white/10" />
                </div>

                <div className="text-center">
                  <h2 className="text-[14px] font-black text-white">New Here?</h2>
                  <p className="mt-1 text-[10px] font-semibold text-white/54">Create an account to get started</p>
                  <button
                    type="button"
                    onClick={() => {
                      setJoinAuthMode("signup");
                      setJoinAuthOpen(true);
                      setJoinAuthMessage(null);
                    }}
                    className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-cyan-300/65 bg-transparent text-[12px] font-black uppercase tracking-[0.10em] text-cyan-300"
                  >
                    <JoinUiIcon type="signup" className="h-5 w-5" />
                    Sign Up
                  </button>
                </div>
              </div>

              {joinAuthMessage ? (
                <div
                  className={`mt-4 rounded-[14px] border px-3 py-2 text-[12px] leading-4 ${
                    joinAuthMessage.tone === "error"
                      ? "border-red-400/25 bg-red-500/10 text-red-100"
                      : joinAuthMessage.tone === "success"
                      ? "border-lime-300/25 bg-lime-400/10 text-lime-100"
                      : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                  }`}
                >
                  <p className="font-black">{joinAuthMessage.title}</p>
                  {joinAuthMessage.body ? <p className="mt-0.5 text-white/68">{joinAuthMessage.body}</p> : null}
                </div>
              ) : null}

              {authSession.authenticated ? (
                <div className="mt-4 rounded-[16px] border border-white/10 bg-white/[0.04] px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Signed in</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-bold text-white/80">{authSession.email}</p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={authBusy}
                      className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-black text-white/70 disabled:opacity-60"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              ) : joinAuthOpen ? (
                <form onSubmit={handleInlineAuthSubmit} className="mt-4 grid gap-2 rounded-[16px] border border-cyan-300/15 bg-black/24 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                    {joinAuthMode === "signup" ? "Create Account" : "Sign In"}
                  </p>
                  <input
                    value={joinEmail}
                    onChange={(event) => setJoinEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="Email"
                    required
                    className="h-11 rounded-[12px] border border-white/10 bg-black/35 px-3 text-[14px] text-white outline-none placeholder:text-white/32 focus:border-cyan-300"
                  />
                  <input
                    value={joinPassword}
                    onChange={(event) => setJoinPassword(event.target.value)}
                    type="password"
                    autoComplete={joinAuthMode === "signup" ? "new-password" : "current-password"}
                    placeholder="Password"
                    required
                    minLength={6}
                    className="h-11 rounded-[12px] border border-white/10 bg-black/35 px-3 text-[14px] text-white outline-none placeholder:text-white/32 focus:border-cyan-300"
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="h-11 rounded-[12px] bg-cyan-300 text-[12px] font-black uppercase tracking-[0.12em] text-black disabled:opacity-60"
                  >
                    {authBusy ? "Working..." : joinAuthMode === "signup" ? "Create Account" : "Sign In"}
                  </button>
                </form>
              ) : null}

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-2.5 text-center">
                {[
                  ["lock", "Secure & Encrypted"],
                  ["check", "Cancel Anytime"],
                  ["shield", "Trusted by Winners"],
                ].map(([icon, label]) => (
                  <div key={label} className="flex items-center justify-center gap-1 text-[8.5px] font-bold text-white/48">
                    <JoinUiIcon type={icon as "lock" | "check" | "shield"} className="h-4 w-4 text-white/48" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="text-center">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <span className="h-px bg-cyan-300/22" />
                <h2 className="text-[15px] font-black uppercase tracking-[0.24em] text-cyan-300">Choose Your Plan</h2>
                <span className="h-px bg-cyan-300/22" />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-white/50">Pick the plan that matches your game.</p>

              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {joinPlans.map((plan) => {
                  const styles = joinStyles[plan.accent];

                  return (
                    <article
                      key={plan.plan}
                      className={`relative flex min-h-[270px] min-w-0 flex-col rounded-[15px] border px-1.5 pb-1.5 pt-3.5 text-left ${styles.shell}`}
                    >
                      {plan.badge ? (
                        <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-300 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.06em] text-black">
                          {plan.badge}
                        </span>
                      ) : null}

                      <div className="flex justify-center">
                        <span className={`grid h-9 w-9 place-items-center rounded-full border shadow-[0_0_12px_currentColor] ${styles.icon}`}>
                          <JoinIcon
                            type={plan.plan === "premium" ? "crown" : plan.plan === "unlimited" ? "diamond" : "star"}
                            className="h-5 w-5"
                          />
                        </span>
                      </div>

                      <p className={`mt-1.5 text-center text-[11.5px] font-black uppercase tracking-[0.07em] ${styles.text}`}>
                        {plan.title}
                      </p>
                      <p className="mt-0.5 text-center text-[7.5px] font-bold leading-tight text-white/78">
                        {plan.subtitle}
                      </p>

                      <div className={`mt-1.5 rounded-[10px] border px-1 py-1.5 text-center ${styles.pill}`}>
                        <p className="text-[9px] font-black leading-tight text-white">{plan.featureTitle}</p>
                        <p className={`mt-0.5 text-[8px] font-black leading-tight ${styles.text}`}>{plan.featureSubtitle}</p>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-0.5">
                        {plan.features.map((feature) => (
                          <p key={feature} className="grid grid-cols-[9px_1fr] gap-1 text-[7.5px] font-semibold leading-tight text-white/76">
                            <span className={`${styles.check} leading-tight`}>✓</span>
                            <span>{feature}</span>
                          </p>
                        ))}
                      </div>

                      <div className="mt-auto pt-1.5">
                        <div className="text-center">
                          <span className="text-[14px] font-black leading-none text-white">{plan.price}</span>
                          <span className="ml-0.5 text-[7px] font-bold text-white/52">/mo</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleJoinPlanChoose(plan.plan)}
                          disabled={checkoutPlan !== null}
                          className={`mt-1.5 h-[29px] w-full rounded-[9px] border px-0.5 text-[8px] font-black uppercase tracking-[0.035em] disabled:opacity-60 ${styles.button}`}
                        >
                          {plan.cta}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[14px] border border-white/10 bg-black/20 p-1.5">
              <div className="mb-1.5 flex items-center justify-center gap-1.5">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/86">Premium Add-ons</p>
                <span className="text-[6.5px] font-black uppercase tracking-[0.06em] text-white/40">Not included</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!authSession.authenticated) {
                      setJoinAuthMode("signup");
                      setJoinAuthOpen(true);
                      setJoinAuthMessage({
                        tone: "info",
                        title: "Create your account first.",
                        body: "Sign up here, then unlock Top Signal inside Atlas Signals.",
                      });
                      return;
                    }

                    void handleSubscribe(topSignalProductForSport(selectedPackSport), selectedPackSport);
                  }}
                  disabled={checkoutPlan !== null}
                  className="min-h-[112px] rounded-[14px] border border-purple-300/35 bg-purple-400/[0.055] p-2 text-center shadow-[0_0_14px_rgba(192,132,252,0.10)] disabled:opacity-60"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-purple-300/40 bg-purple-300/10 text-purple-200">
                      <JoinIcon type="star" className="h-5 w-5" />
                    </span>
                    <div className="text-left">
                      <p className="text-[9.5px] font-black uppercase tracking-[0.06em] text-purple-300">Top Signal</p>
                      <p className="text-[15px] font-black text-white">$24.99 <span className="text-[8px] text-white/50">/ day</span></p>
                    </div>
                  </div>
                  <p className="mt-2 text-[8px] font-semibold leading-tight text-white/68">The #1 strongest signal of the day for a specific sport.</p>
                  <span className="mt-2 inline-flex w-full justify-center rounded-[9px] border border-purple-300/45 px-2 py-1 text-[8px] font-black uppercase text-purple-200">Unlock</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!authSession.authenticated) {
                      setJoinAuthMode("signup");
                      setJoinAuthOpen(true);
                      setJoinAuthMessage({
                        tone: "info",
                        title: "Create your account first.",
                        body: "Sign up here, then unlock Top Play inside Atlas Signals.",
                      });
                      return;
                    }

                    void handleSubscribe("top_play");
                  }}
                  disabled={checkoutPlan !== null}
                  className="min-h-[112px] rounded-[14px] border border-amber-300/35 bg-amber-400/[0.055] p-2 text-center shadow-[0_0_14px_rgba(251,191,36,0.10)] disabled:opacity-60"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-300/40 bg-amber-300/10 text-amber-200">
                      <JoinIcon type="crown" className="h-5 w-5" />
                    </span>
                    <div className="text-left">
                      <p className="text-[9.5px] font-black uppercase tracking-[0.06em] text-amber-300">Top Play</p>
                      <p className="text-[15px] font-black text-white">$149.99</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[8px] font-semibold leading-tight text-white/68">The highest-conviction play selected by Atlas Signals.</p>
                  <span className="mt-2 inline-flex w-full justify-center rounded-[9px] border border-amber-300/45 px-2 py-1 text-[8px] font-black uppercase text-amber-200">Unlock</span>
                </button>
              </div>
            </section>

            <section>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <span className="h-px bg-cyan-300/20" />
                <h2 className="text-[15px] font-black uppercase tracking-[0.24em] text-cyan-300">Compare Plans</h2>
                <span className="h-px bg-cyan-300/20" />
              </div>
              <div className="mt-3 overflow-hidden rounded-[16px] border border-white/12 bg-cyan-300/[0.035] text-[10px]">
                <div className="grid grid-cols-[1.35fr_1fr_1fr_1fr] border-b border-white/10 text-center font-black uppercase tracking-[0.08em]">
                  <div className="px-2 py-3 text-left text-cyan-300">Features</div>
                  <div className="px-2 py-3 text-cyan-300">Exclusive</div>
                  <div className="relative px-2 py-3 text-amber-300">
                    <span className="absolute left-1/2 top-[-9px] -translate-x-1/2 rounded-full bg-amber-300 px-2 py-0.5 text-[6px] text-black">Most Popular</span>
                    Premium
                  </div>
                  <div className="px-2 py-3 text-purple-300">Elite</div>
                </div>
                {comparisonRows.map(([feature, exclusive, premium, elite]) => (
                  <div key={feature} className="grid grid-cols-[1.35fr_1fr_1fr_1fr] border-b border-white/8 last:border-b-0">
                    <div className="px-2 py-2.5 font-semibold text-white/72">{feature}</div>
                    <div className={`px-2 py-2.5 text-center text-[16px] font-black ${exclusive === "✓" ? "text-cyan-300" : "text-white/34"}`}>{exclusive}</div>
                    <div className={`px-2 py-2.5 text-center text-[16px] font-black ${premium === "✓" ? "text-amber-300" : "text-white/34"}`}>{premium}</div>
                    <div className={`px-2 py-2.5 text-center text-[16px] font-black ${elite === "✓" ? "text-purple-300" : "text-white/34"}`}>{elite}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-cyan-300/16 bg-[#07111d]/86 p-3 shadow-[0_0_24px_rgba(34,211,238,0.07)] backdrop-blur-md">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    icon: "updates" as const,
                    title: "24/7 Updates",
                    body: "Real-time signals and market scans",
                    tone: "border-cyan-300/28 bg-cyan-300/10 text-cyan-300",
                  },
                  {
                    icon: "trophy" as const,
                    title: "Winning Edge",
                    body: "AI-powered analysis for sharp results",
                    tone: "border-amber-300/28 bg-amber-300/10 text-amber-300",
                  },
                  {
                    icon: "shield" as const,
                    title: "Cancel Anytime",
                    body: "No long-term contracts. You're in control.",
                    tone: "border-emerald-300/28 bg-emerald-300/10 text-emerald-300",
                  },
                ].map((item, index) => (
                  <div
                    key={item.title}
                    className={`grid min-w-0 grid-cols-[28px_1fr] gap-2 ${index < 2 ? "border-r border-white/10 pr-2" : ""}`}
                  >
                    <span className={`grid h-8 w-8 place-items-center rounded-full border ${item.tone}`}>
                      <JoinUiIcon type={item.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[9.5px] font-black leading-tight text-white/72">{item.title}</span>
                      <span className="mt-0.5 block text-[7.5px] font-semibold leading-[1.25] text-white/42">{item.body}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        </div>
        <AtlasBottomNavigation
          activeSection="more"
          placement="fixed"
          zIndexClass="z-50"
          onNavigate={(section) => {
            if (section === "signals") {
              navigateAppState({ section, view: "live" });
              return;
            }

            navigateAppState({ section });
          }}
        />
        </div>
      </main>
    );
  }

  return (
  <main className="min-h-screen bg-[#050816] text-white">
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className={`sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 px-4 backdrop-blur ${
        appSection === "signals" ? "pb-2 pt-4" : appSection === "news" ? "pb-2 pt-4" : appSection === "bankroll" ? "pb-2 pt-3" : "pb-3 pt-5"
      } ${appSection === "news" || appSection === "bankroll" ? "hidden" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            {appSection === "news" ? null : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src="/icon.png"
                    alt="Atlas Signals"
                    className={`${appSection === "bankroll" ? "h-6 w-6" : "h-8 w-8"} object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]`}
                  />

                  <p className={`${appSection === "bankroll" ? "text-[9px]" : "text-[11px]"} uppercase tracking-[0.26em] text-cyan-400/90`}>
                    {sectionEyebrow}
                  </p>
                </div>
              </div>
            )}
            <h1 className={`${appSection === "news" ? "mt-0" : "mt-1"} font-bold leading-none tracking-tight ${
              appSection === "signals" ? "text-[36px]" : appSection === "news" ? "text-[30px]" : appSection === "bankroll" ? "text-[28px]" : "text-[40px]"
            }`}>
              {sectionTitle}
            </h1>
            {appSection === "signals" ? (
              <p className="mt-1.5 text-[13px] font-semibold text-white/62">
                Premium Intelligence. Real Time Edge.
              </p>
            ) : appSection === "news" ? (
              <p className="mt-1 text-[12px] font-semibold text-white/58">
                Real-Time Event Moving Markets
              </p>
            ) : null}
          </div>

          {appSection === "signals" || appSection === "scores" ? (
            <CompactScheduleDatePicker
              value={activeDay}
              onChange={(day) => navigateAppState({ day })}
            />
          ) : (
            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              {appSection === "news" ? "Impact" : appSection === "bankroll" ? "Active" : selectedSport}
            </div>
          )}
        </div>

        {appSection === "scores" ? (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-[18px] border border-white/10 bg-white/[0.04] p-1">
            <button
              onClick={() => navigateAppState({ view: "odds" })}
              className={`rounded-[14px] px-4 py-2.5 text-sm font-bold transition-all ${
                viewMode === "odds"
                  ? "bg-cyan-500 text-black"
                  : "text-white/65"
              }`}
            >
              Subs
            </button>

            <button
              onClick={() => navigateAppState({ view: "live" })}
              className={`rounded-[14px] px-4 py-2.5 text-sm font-bold transition-all ${
                viewMode === "live"
                  ? "bg-cyan-500 text-black"
                  : "text-white/65"
              }`}
            >
              Live
            </button>
          </div>
        ) : null}

        {appSection !== "signals" && appSection !== "news" && appSection !== "bankroll" ? (
        <div className="mt-3 grid grid-cols-6 gap-1">
          {sportsTabs.map((sport) => (
            <button
              key={sport}
              onClick={() => navigateAppState({ sport })}
              className={`min-w-0 whitespace-nowrap rounded-full px-1 py-2 text-[11px] font-bold transition-all ${
                selectedSport === sport
                  ? "bg-cyan-500 text-black"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {sport}
            </button>
          ))}
        </div>
        ) : null}

      </header>

      <section className={`flex-1 px-4 ${appSection === "signals" || appSection === "bankroll" ? "space-y-2.5 py-2" : "space-y-3 py-3"}`}>
        {appSection === "signals" ? (
          <>
        {shouldShowSubscriptionPlans ? (
          subscriptionPlansBoard
        ) : viewMode === "live" ? (
          <>
            <SignalsHome
              selectedSport={selectedSport}
              selectedSignalSport={selectedPrecisionSignalSport}
              topPlay={precisionTopPlay}
              topSignals={precisionTopSignals}
              loading={precisionLoading}
              signalGroupCount={groupedSignalLiveGames.length}
              onSelectSignalSport={setSelectedPackSport}
              onUnlockTopPlay={() => handleSubscribe("top_play")}
            />

            {liveLoading ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                Loading live games...
              </div>
              
            ) : groupedSignalLiveGames.length === 0 ? (
              selectedSport === "TOP" ? (
                <div className="rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    Signal Detected Board
                  </p>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                    No public signals detected yet
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/70">
                    Atlas is still monitoring the active sports board. Top Signal and Top Play continue to update above through the Precision Engine.
                  </p>
                </div>
              ) : isUnavailableSport(selectedSport) ? (
                <div className="rounded-[28px] border border-yellow-400/20 bg-yellow-500/10 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-300">
                    {selectedSport}
                  </p>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                    {selectedSport} is not available yet
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/70">
                    {isSeasonClosedSport(selectedSport)
                      ? `${selectedSport} season has ended. This section will reactivate once the next season and signal workflow are ready.`
                      : `${selectedSport} support is coming in a future update. This section will activate once the market and signal system are ready.`}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                  No signal detected games available.
                </div>
              )
            ) : (
              <section className="overflow-hidden rounded-[20px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),rgba(255,255,255,0.035)_46%)]">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
                  <div>
                    <p className="text-[13px] font-black uppercase tracking-[0.14em] text-cyan-300">
                      Signal Detected
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/48">
                      Live Market Opportunities
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignalListExpanded((value) => !value)}
                    className="rounded-full bg-white/8 px-3 py-1.5 text-[10px] font-bold text-white/70"
                  >
                    {signalListExpanded ? "Show Less" : "View All"} <span className="ml-1 text-[14px] leading-none">→</span>
                  </button>
                </div>

                {(() => {
                  const rows = groupedSignalLiveGames.flatMap((group) =>
                    group.games.flatMap((game) => {
                      const livePickData = getLivePickForSport(game, group.sport, {
                        mlb: mlbSignalsData,
                        nba: nbaSignalsData,
                        nhl: nhlSignalsData,
                        soccer: soccerSignalsLiveData,
                      });

                      const top5 = getTop5BySport(
                        group.sport,
                        activeMlbTop5Data,
                        activeNbaTop5Data,
                        activeNhlTop5Data,
                        activeSoccerTop5Data
                      );

                      if (!livePickData || isTop5LiveGame(game, top5)) {
                        return [];
                      }

                      return [
                        {
                          game,
                          sport: group.sport,
                          livePickData,
                          pickLabel: formatDisplayedPick(livePickData.pick, group.sport),
                          odds: livePickData.odds ?? null,
                          result: getLivePickResult(game, livePickData),
                        },
                      ];
                    })
                  );

                  const visibleRows = signalListExpanded ? rows : rows.slice(0, 5);

                  return visibleRows.map((row, idx) => (
                    <SignalDetectedRow
                      key={`${row.game.id}-${row.sport}-${idx}`}
                      game={row.game}
                      sport={row.sport}
                      pickLabel={row.pickLabel}
                      odds={row.odds}
                      result={row.result}
                      isLast={idx === visibleRows.length - 1}
                      onOpen={() =>
                        setSelectedSignalInsight(
                          buildSignalInsight(row.game, row.sport, row.livePickData)
                        )
                      }
                    />
                  ));
                })()}
              </section>
            )}

            <SignalsActivitySummary
              signalGroupCount={groupedSignalLiveGames.length}
              topSignals={precisionTopSignals}
              topPlay={precisionTopPlay}
            />
          </>
        ) : loading ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
            Loading {selectedSport} games...
          </div>
        ) : isTopTab ? (
          canViewTopTab(userAccess) ? (
            eliteTopSignals.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                No Top Signals available today.
              </div>
            ) : (
              <div className="space-y-3">
                {eliteTopSignals.map((pick, idx) => (
                  <article
                    key={`top-${idx}`}
                    className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                  >
                    <div className="mb-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-400/95">
                        Top Signal {pick.sport}
                      </p>
                      {pick.startTime && (
                        <p className="mt-2 text-[13px] font-medium text-white/55">
                          {formatTime(pick.startTime)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <TeamBadge
                          teamName={pick.awayTeam ?? ""}
                          sport={pick.sport}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                            {getDisplayAbbr(pick.awayTeam ?? "")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <TeamBadge
                          teamName={pick.homeTeam ?? ""}
                          sport={pick.sport}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                            {getDisplayAbbr(pick.homeTeam ?? "")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-4">
                      

<div
  className={`mb-3 inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]
    ${
      pick.status === "WON"
        ? "bg-green-500/15 text-green-300 border border-green-400/30"
        : pick.status === "LOST"
        ? "bg-red-500/15 text-red-300 border border-red-400/30"
        : pick.status === "PUSH"
        ? "bg-yellow-500/15 text-yellow-300 border border-yellow-400/30"
        : "bg-cyan-400/10 text-cyan-300 border border-cyan-400/25"
    }
  `}
>
  {pick.status === "WON"
    ? "Signal Won"
    : pick.status === "LOST"
    ? "Signal Lost"
    : pick.status === "PUSH"
    ? "Signal Push"
    : "Pending"}
</div>

                      <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
                        {formatDisplayedPick(pick.pick, pick.sport)}
                      </p>

                      <div
                        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(
                          pick.status
                        )}`}
                      >
                        {formatStatusLabel(pick.status)}
                      </div>

                      <p className="mt-2 text-[11px] text-white/40">
                        {pick.status === "CONFIRMED" && "Validated by system"}
                        {pick.status === "REMOVED" && "Signal removed due to market shift"}
                        {pick.status === "DOWNGRADED" &&
                          "Confidence reduced before game time"}
                        {!pick.status && "Monitoring market conditions"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Unlock TOP
              </p>

              <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                Top Signal is sold separately
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/70">
                Packs do not include Top Signal or Top Play. Unlock a daily Top Signal
                by sport, or get the strongest Atlas pick of the day with Top Play.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Daily purchase
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Top Signal $24.99
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Top Play $149.99
                </span>
              </div>

              <div className="mt-5 space-y-2 text-[13px] text-white/65">
                <p>• MLB Top Signal</p>
                <p>• NBA Top Signal</p>
                <p>• NHL Top Signal</p>
                <p>• Soccer Top Signal</p>
                <p>• NFL Top Signal</p>
              </div>

              <button
                type="button"
                onClick={() => handleSubscribe("top_play")}
                disabled={checkoutPlan !== null}
                className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                Unlock Top Play ($149.99)
              </button>
            </div>
          )
        ) : isUnavailableSport(selectedSport) ? (
          <div className="rounded-[28px] border border-yellow-400/20 bg-yellow-500/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-300">
              {selectedSport}
            </p>

            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
              {selectedSport} is not available yet
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/70">
              {isSeasonClosedSport(selectedSport)
                ? `${selectedSport} season has ended. Subscriptions for this sport will reactivate once the next season and signal workflow are ready.`
                : `${selectedSport} subscriptions are not active yet. This sport will be added once the signal engine and market workflow are ready.`}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Coming soon
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Signals in development
              </span>
            </div>
          </div>
        ) : !hasSportAccess(userAccess, selectedSport) ? (
          <section className="py-2">
            <div className="text-center">
              <h2 className="text-[24px] font-bold tracking-tight text-white">
                Choose your Atlas access
              </h2>
              <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-6 text-white/65">
                Choose Premium for one sport, or Atlas Unlimited for every available sport. Top Signal stays separate.
              </p>
            </div>

            {hasPaidSubscription ? (
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={billingBusy}
                className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                {billingBusy ? "Opening Billing" : "Manage Billing"}
              </button>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  {
                    product: selectedTopSignalProduct ?? "top_signal_mlb",
                    name: "TOP SIGNAL",
                    price: "$24.99",
                    period: "daily",
                    tone: "violet",
                    summary: `Unlock only today's strongest ${selectedSport} signal. This is a one-day purchase, not a subscription.`,
                    features: [
                      "One sport",
                      "Daily unlock",
                      "No Top 5",
                      "No History",
                    ],
                    cta: "Unlock",
                  },
                  {
                    product: "exclusive" as const,
                    plan: "exclusive" as const,
                    name: "EXCLUSIVE",
                    price: "$34.99",
                    period: "month",
                    tone: "bronze",
                    summary: "Top 3 ranked Signals Detected across all available sports.",
                    features: [
                      "All Available Sports",
                      "Top 3 Signals Detected",
                      "Ranked Signals",
                      "Live Status Updates",
                    ],
                    excludes: ["Top Signal"],
                    cta: "Choose",
                  },
                  {
                    product: "premium" as const,
                    plan: "premium" as const,
                    name: "PREMIUM",
                    price: "$59.99",
                    period: "month",
                    tone: "silver",
                    summary: "Up to 5 official ranked Atlas Signals for one selected sport.",
                    recommended: true,
                    features: [
                      "Choose Your Sport",
                      "Up to 5 Official Signals",
                      "Ranked Signals",
                      "Recommended",
                    ],
                    excludes: ["Top Signal"],
                    cta: "Choose",
                  },
                  {
                    product: "unlimited" as const,
                    plan: "unlimited" as const,
                    name: "ATLAS UNLIMITED",
                    price: "$99.99",
                    period: "month",
                    tone: "cyan",
                    summary: "Up to 5 official ranked Atlas Signals for every available sport.",
                    features: [
                      "All Available Sports",
                      "Up to 5 Per Sport",
                      "Ranked Signals",
                      "Dynamic sports coverage",
                    ],
                    excludes: ["Top Signal"],
                    cta: "Choose",
                  },
                ]
                  .filter((option) => !("plan" in option))
                  .map((option) => (
                  <article
                    key={option.product}
                    className={`flex min-w-0 flex-col rounded-[18px] border p-2.5 ${
                      option.recommended
                        ? "border-cyan-300/45 bg-cyan-400/[0.08] shadow-[0_0_22px_rgba(34,211,238,0.08)]"
                        : "border-cyan-400/20 bg-cyan-400/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                          {option.name}
                        </p>
                        <div className="mt-2">
                          <span className="block text-[18px] font-black leading-none text-white">
                            {option.price}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-none text-white/60">
                            / {option.period}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-black shadow-[0_0_14px_rgba(0,0,0,0.30)] ${
                          option.tone === "gold"
                            ? "border-yellow-200/55 bg-yellow-400/25 text-yellow-200"
                            : option.tone === "silver"
                            ? "border-slate-200/55 bg-slate-300/20 text-slate-100"
                            : option.tone === "bronze"
                            ? "border-orange-200/55 bg-orange-400/20 text-orange-200"
                            : option.tone === "violet"
                            ? "border-violet-200/55 bg-violet-400/20 text-violet-100"
                            : "border-cyan-200/55 bg-cyan-400/20 text-cyan-100"
                        }`}
                      >
                        {"plan" in option ? "5" : "1"}
                      </div>
                    </div>

                    {option.recommended ? (
                      <div className="mt-2 inline-flex rounded-full bg-cyan-400 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-black">
                        Recommended
                      </div>
                    ) : null}

                    <p className="mt-2 text-[8.5px] leading-3 text-white/65">
                      {option.summary}
                    </p>

                    <div className="my-2.5 h-px bg-cyan-400/20" />

                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                      Includes:
                    </p>

                    <div className="mt-2 space-y-1.5">
                      {option.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-1.5">
                          <span className="mt-[7px] h-px w-2.5 shrink-0 bg-cyan-300/70" />
                          <span className="min-w-0 text-[8.5px] leading-3 text-white/72">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>

                    {"excludes" in option && option.excludes ? (
                      <>
                        <p className="mt-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/42">
                          No incluye:
                        </p>
                        <div className="mt-1 space-y-1">
                          {option.excludes.map((feature) => (
                            <div key={feature} className="flex items-start gap-1.5">
                              <span className="mt-[7px] h-px w-2.5 shrink-0 bg-white/30" />
                              <span className="min-w-0 text-[8.5px] leading-3 text-white/50">
                                {feature}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

                    <div className="mt-auto pt-3">
                      <button
                        type="button"
                        onClick={() => handleSubscribe(option.product)}
                        disabled={checkoutPlan !== null}
                        className="w-full rounded-[11px] bg-cyan-500 px-1.5 py-2 text-[9px] font-black text-black transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {option.cta}
                      </button>
                    </div>
                  </article>
                ))}
                </div>
                <div className="mt-6">
                  <PackSportSelector
                    value={selectedPackSport}
                    onChange={setSelectedPackSport}
                    sports={activeSubscriptionSports}
                  />
                </div>
                <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                  {subscriptionPackPlans.map((pack) => (
                    <PackCard
                      key={pack.plan}
                      pack={pack}
                      onChoose={(plan) => handleSubscribe(plan)}
                      disabled={checkoutPlan !== null}
                    />
                  ))}
                </div>
                <StripeTrustBar />
              </>
            )}
          </section>
        ) : visibleSubscriptionPickCount === 0 ? (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
    No subscription picks available for {userAccess.plan === "elite" || userAccess.plan === "unlimited" ? "active sports" : selectedSport}.
  </div>
) : (
  <div className="space-y-3">
    {selectedTopSignalProduct && !hasSelectedTopSignalUnlock ? (
      <div className="rounded-[22px] border border-violet-300/25 bg-violet-500/[0.08] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">
              Top Signal Locked
            </p>
            <h3 className="mt-1 text-[18px] font-black text-white">
              Unlock {selectedSport} Top Signal
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-white/60">
              Top Signal is a daily product and is not included with Exclusive,
              Premium or Elite.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSubscribe(selectedTopSignalProduct)}
            disabled={checkoutPlan !== null}
            className="shrink-0 rounded-[14px] bg-cyan-400 px-3 py-2 text-[11px] font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            $24.99
          </button>
        </div>
      </div>
    ) : null}

    {canViewStatsAndHistory(userAccess) ? (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Top Signal
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {selectedTopSignalRecord.wins}-{selectedTopSignalRecord.losses}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Push: {selectedTopSignalRecord.pushes}
        </p>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Top 3
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {top5RecordStats.wins}-{top5RecordStats.losses}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Push: {top5RecordStats.pushes}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Decided: {top5RecordStats.decided}
        </p>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Win Rate
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {selectedTopSignalRecord.winRate}%
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Top Signal
        </p>
      </div>
    </div>
    ) : null}

    {subsScoresLoading ? (
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
        Loading results...
      </div>
    ) : null}

    {subscriptionSportGroups.map((group) => (
      <div key={`subscription-group-${group.sport}`} className="space-y-3">
        {hasAllSportsAccessPlan(userAccess.plan) ? (
          <div className="rounded-[18px] border border-cyan-300/18 bg-cyan-400/[0.045] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
              {group.sport}
            </p>
            <p className="mt-1 text-[12px] text-white/58">
              Ranked Top 3 for this sport.
            </p>
          </div>
        ) : null}
        {group.picks.map((pick, idx) => {
      const savedResult = String(pick.status ?? "").toUpperCase();
      const finalResult =
        isHistoricalDay &&
        (savedResult === "WON" || savedResult === "LOST" || savedResult === "PUSH")
          ? savedResult
          : getSubsPickResult(pick, subsScoreGames);

      const resultLabel =
        finalResult === "WON"
          ? "Signal Won"
          : finalResult === "LOST"
          ? "Signal Lost"
          : finalResult === "PUSH"
          ? "Signal Push"
          : "Pending";

      const resultClass =
        finalResult === "WON"
          ? "bg-green-500/15 text-green-300 border-green-400/30"
          : finalResult === "LOST"
          ? "bg-red-500/15 text-red-300 border-red-400/30"
          : finalResult === "PUSH"
          ? "bg-yellow-500/15 text-yellow-300 border-yellow-400/30"
          : "bg-cyan-400/10 text-cyan-300 border-cyan-400/25";

      return (
        <article
          key={`subs-pick-${group.sport}-${idx}`}
          className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
        >
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
              {group.sport}
            </p>

            {pick.startTime && (
              <p className="mt-2 text-[13px] font-medium text-white/55">
                {formatTime(pick.startTime)}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TeamBadge teamName={pick.awayTeam ?? ""} sport={group.sport} />
              <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                {getDisplayAbbr(pick.awayTeam ?? "")}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <TeamBadge teamName={pick.homeTeam ?? ""} sport={group.sport} />
              <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                {getDisplayAbbr(pick.homeTeam ?? "")}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-4">
            <div
              className={`mb-3 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${resultClass}`}
            >
              {resultLabel}
            </div>

            <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
              {formatDisplayedPick(pick.pick, group.sport)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <div
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(
                  pick.status
                )}`}
              >
                {formatStatusLabel(pick.status)}
              </div>

              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  String(pick.label).includes("Top Signal")
                    ? "bg-purple-500/18 text-purple-300"
                    : "bg-yellow-500/18 text-yellow-300"
                }`}
              >
                {pick.label}
              </span>
            </div>

            <p className="mt-2 text-[11px] text-white/40">
              {pick.status === "CONFIRMED" && "Validated by system"}
              {pick.status === "REMOVED" && "Signal removed due to market shift"}
              {pick.status === "DOWNGRADED" &&
                "Confidence reduced before game time"}
              {!pick.status && "Monitoring market conditions"}
            </p>
          </div>
        </article>
      );
        })}
      </div>
    ))}
  </div>
)}

{viewMode === "odds" && canViewStatsAndHistory(userAccess) && (
  <div className="mt-6">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
      Top Signal History
    </p>

    <div className="mt-3 space-y-2">
      {visibleTopSignalHistory.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No history available
        </div>
      ) : (
        visibleTopSignalHistory.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <div>
              <p className="text-[13px] font-medium text-white">
                {item.away_team} vs {item.home_team}
              </p>
              <p className="text-[11px] text-white/50">
                {item.pick}
              </p>
            </div>

            <div
              className={`text-[11px] font-semibold ${
                item.result === "WON"
                  ? "text-green-400"
                  : item.result === "LOST"
                  ? "text-red-400"
                  : item.result === "PUSH"
                  ? "text-yellow-400"
                  : "text-white/40"
              }`}
            >
              {item.result}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}

{viewMode === "live" && activeDay < getRelativeDayKey(0) && canViewTop5History(userAccess) && (
  <div className="mt-6">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
      Top 3 Signals History
    </p>

    <div className="mt-3 space-y-2">
      {top5History.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No history available
        </div>
      ) : (
        top5History.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <div>
              <p className="text-[13px] font-medium text-white">
                {item.away_team} vs {item.home_team}
              </p>
              <p className="text-[11px] text-white/50">
                {item.pick}
              </p>
            </div>

            <div
              className={`text-[11px] font-semibold ${
                item.result === "WON"
                  ? "text-green-400"
                  : item.result === "LOST"
                  ? "text-red-400"
                  : item.result === "PUSH"
                  ? "text-yellow-400"
                  : "text-white/40"
              }`}
            >
              {item.result}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}
          </>
        ) : appSection === "scores" ? (
          <>
            {shouldShowSubscriptionPlans ? (
              subscriptionPlansBoard
            ) : liveLoading ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                Loading scores...
              </div>
            ) : groupedFilteredLiveGames.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  {selectedSport}
                </p>
                <p className="mt-2 text-[18px] font-bold text-white">
                  No games on this slate
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedFilteredLiveGames.map((group) => {
                      const scoreTop5 = getTop5BySport(
                        group.sport,
                        activeMlbTop5Data,
                        activeNbaTop5Data,
                        activeNhlTop5Data,
                        activeSoccerTop5Data
                      );
                      const scoreTopSignal = scoreTop5.find(
                        (pick) => pick.isTopSignal || pick.rank === 1
                      );
                      const scoreGames = [...group.games].sort((a, b) => {
                        const aIsTopSignal = scoreTopSignal
                          ? isTop5LiveGame(a, [scoreTopSignal])
                          : false;
                        const bIsTopSignal = scoreTopSignal
                          ? isTop5LiveGame(b, [scoreTopSignal])
                          : false;

                        if (aIsTopSignal === bIsTopSignal) return 0;

                        return aIsTopSignal ? -1 : 1;
                      });

                      return (
                        <article
                          key={`scores-${group.leagueKey}`}
                          className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]"
                        >
                          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                            <p className="truncate text-[13px] font-bold text-white">
                              {group.title}
                            </p>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">
                              {group.games.length} games
                            </span>
                          </div>

                          {scoreGames.map((game, idx) => {
                            const oddsGame = findOddsGameForLive(game, liveOddsGames);
                      const scoreIsTopSignal = scoreTopSignal
                        ? isTop5LiveGame(game, [scoreTopSignal])
                        : false;
                      const scoreTopSignalProduct = topSignalProductBySport[group.sport];
                      const scoreTopSignalUnlocked =
                        userAccess.plan === "admin" ||
                        userAccess.unlocks.topSignals.includes(group.sport);

                      return (
                        <LiveScoreboardRow
                          key={`score-${game.id}-${idx}`}
                          game={game}
                          sport={group.sport}
                          oddsGame={oddsGame}
                          isLast={idx === scoreGames.length - 1}
                          topSignalHighlight={scoreIsTopSignal}
                          topSignalCta={
                            scoreIsTopSignal && !scoreTopSignalUnlocked && scoreTopSignalProduct
                              ? {
                                  label: "Top Signal $24.99",
                                  onClick: () => handleSubscribe(scoreTopSignalProduct),
                                }
                              : null
                          }
                          onOpen={() => handleLiveGameClick(game, group.sport)}
                        />
                      );
                    })}
                  </article>
                      );
                    })}
              </div>
            )}
          </>
        ) : appSection === "news" ? (
          <div className="space-y-2.5">
            <section className="rounded-[19px] border border-cyan-300/14 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_32%),linear-gradient(180deg,rgba(4,12,25,0.98),rgba(2,7,17,0.98))] p-1.5 shadow-[0_0_22px_rgba(34,211,238,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[28px] font-black uppercase leading-none tracking-[-0.035em] text-white">
                    MARKET IMPACT
                  </h2>
                  <p className="mt-1 max-w-[320px] truncate text-[11px] font-semibold leading-snug text-white/58">
                    Live Intelligence Center
                  </p>
                </div>
                <span className="mt-0.5 shrink-0 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.13em] text-emerald-200">
                  Live
                </span>
              </div>

              <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-[15px] border border-white/10 bg-black/18 shadow-[inset_0_1px_12px_rgba(255,255,255,0.02)]">
                {[
                  { label: "Team Impact", value: impactTeamCount, trend: impactTeamCount > 0 ? "New" : "", color: "text-sky-300", icon: "team" as const },
                  { label: "Market Impact", value: impactMarketCount, trend: impactMarketCount > 0 ? "New" : "", color: "text-orange-300", icon: "market" as const },
                  { label: "Atlas Intelligence", value: impactIntelligenceCount, trend: impactIntelligenceCount > 0 ? "New" : "", color: "text-violet-300", icon: "intelligence" as const },
                  { label: "Last Update", value: impactLastUpdateShortLabel, trend: pulseLastUpdatedAt ? "Live" : "", color: "text-cyan-200", icon: "clock" as const },
                ].map((item, index) => (
                  <div
                    key={item.label}
                    className={`min-w-0 px-1.5 py-1.5 ${index === 0 ? "" : "border-l border-white/10"}`}
                  >
                    <div className={`leading-none ${item.color}`}>
                      <ImpactSummaryIcon name={item.icon} className="h-[18px] w-[18px]" />
                    </div>
                    <p className="mt-0.5 truncate text-[6px] font-black uppercase tracking-[0.06em] text-white/44">
                      {item.label}
                    </p>
                    <p className={`mt-0.5 truncate text-[18px] font-black leading-none ${item.color}`}>
                      {item.value}
                    </p>
                    {item.trend ? (
                      <p className="truncate text-[6.5px] font-black uppercase tracking-[0.08em] text-white/36">{item.trend}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="relative h-[48px] overflow-visible rounded-[15px] border border-white/10 bg-[#030814]/95 px-1.5 pt-1 shadow-[0_0_18px_rgba(34,211,238,0.055)]">
                <OfficialSportSelectorRow
                  selectedSport={pulseSportToOfficialSport(pulseSportFilter)}
                  onSelectSport={(sport) => setPulseSportFilter(officialSportToPulseSport(sport))}
                  framed={false}
                />
              </div>

              <div className="[&_button]:py-[0.45rem]">
                <AtlasControlCenterTabBar
                  tab={pulseImpactFilter}
                  items={pulseImpactTabItems}
                  compact
                  onTab={(tab) => {
                    setPulseImpactFilter(tab as ImpactFeedFilter);
                  }}
                />
              </div>
            </section>

            {pulseLoading ? (
              <section className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`pulse-loading-${index}`}
                    className="h-[140px] animate-pulse rounded-[18px] border border-white/10 bg-white/[0.035]"
                  />
                ))}
              </section>
            ) : currentUnifiedImpactItems.length === 0 ? (
              <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center shadow-[0_0_22px_rgba(34,211,238,0.06)]">
                <p className="text-[15px] font-black text-white">
                  {pulseImpactFilter === "MARKET"
                    ? "No Market Impact events detected today."
                    : pulseImpactFilter === "INTELLIGENCE"
                    ? "No Atlas Intelligence insights detected today."
                    : "No Team Impact events detected today."}
                </p>
              </section>
            ) : (
              <section className="space-y-2">
                {currentUnifiedImpactItems.map((feedItem) => {
                  const item = feedItem.item;
                  const badgeSport = getTeamImpactSportBadge(feedItem.sport as TeamImpactEvent["sport"]);
                  const isMarketImpact = feedItem.kind === "market";
                  const isIntelligenceImpact = feedItem.kind === "intelligence";
                  const accent = getImpactAccent(feedItem.kind);
                  const confidenceClass = getImpactConfidenceBadgeClass(feedItem.confidence);
                  const matchup = isIntelligenceImpact
                    ? getAtlasIntelligenceMatchupLabel(item as AtlasIntelligenceEvent)
                    : isMarketImpact
                    ? getMarketMatchupLabel((item as MarketImpactEvent).awayTeam, (item as MarketImpactEvent).homeTeam, badgeSport)
                    : getOfficialMatchupLabel((item as TeamImpactEvent).awayTeam, (item as TeamImpactEvent).homeTeam, badgeSport);
                  const primaryTeam = isIntelligenceImpact
                    ? (item as AtlasIntelligenceEvent).details.homeTeam || (item as AtlasIntelligenceEvent).details.awayTeam || feedItem.sport
                    : isMarketImpact
                    ? getMarketDisplayTeamName((item as MarketImpactEvent).homeTeam, badgeSport)
                    : getTeamImpactSubjectTeam(item as TeamImpactEvent, badgeSport);
                  const secondaryTeam = isIntelligenceImpact
                    ? (item as AtlasIntelligenceEvent).details.awayTeam
                    : isMarketImpact
                    ? getMarketDisplayTeamName((item as MarketImpactEvent).awayTeam, badgeSport)
                    : (item as TeamImpactEvent).awayTeam && (item as TeamImpactEvent).homeTeam
                      ? getSportDisplayTeamName((item as TeamImpactEvent).awayTeam === primaryTeam ? (item as TeamImpactEvent).homeTeam : (item as TeamImpactEvent).awayTeam, badgeSport)
                      : null;
                  const sourceLabel = isIntelligenceImpact
                    ? "Atlas Intelligence"
                    : isMarketImpact
                      ? "Atlas Market Scan"
                      : (item as TeamImpactEvent).source;
                  const sourceUrl = isMarketImpact || isIntelligenceImpact ? null : (item as TeamImpactEvent).sourceUrl;
                  const whyLabel = isIntelligenceImpact ? "SUMMARY:" : "WHY:";
                  const whyText = isIntelligenceImpact
                    ? getPreviewSentence((item as AtlasIntelligenceEvent).summary)
                    : isMarketImpact
                      ? getPreviewSentence((item as MarketImpactEvent).why)
                      : getPreviewSentence((item as TeamImpactEvent).why);
                  const impactLabel = isIntelligenceImpact ? "TIMELINE:" : isMarketImpact ? "HISTORY:" : "IMPACT:";
                  const impactText = isIntelligenceImpact
                    ? getPreviewSentence(getAtlasIntelligenceTimeline(item as AtlasIntelligenceEvent))
                    : isMarketImpact
                      ? getPreviewSentence((item as MarketImpactEvent).impact)
                      : getPreviewSentence((item as TeamImpactEvent).impact);
                  const marketEvent = isMarketImpact ? (item as ConsolidatedMarketImpactEvent) : null;
                  const teamEvent = !isMarketImpact && !isIntelligenceImpact ? (item as TeamImpactEvent) : null;
                  const detailTitle = isIntelligenceImpact
                    ? getAtlasIntelligenceImpact(item as AtlasIntelligenceEvent)
                    : isMarketImpact && marketEvent
                      ? getMarketMonitorTitle(marketEvent)
                      : teamEvent
                        ? teamEvent.eventType
                        : accent.label;
                  const detailSubtitle = isIntelligenceImpact
                    ? matchup
                    : isMarketImpact && marketEvent
                      ? `${marketEvent.market} • ${matchup}`
                      : teamEvent
                        ? `${primaryTeam} • ${feedItem.sport}`
                        : matchup;
                  const marketAnchorState = marketEvent ? getMarketAnchorState(marketEvent) : null;
                  const marketOpeningMovement = marketEvent ? getMarketOpeningMovement(marketEvent) : null;
                  const marketCurrentMovement = marketEvent ? getMarketCurrentMovement(marketEvent) : null;
                  const marketOpenState = marketEvent && marketOpeningMovement
                    ? formatMarketStateLine(getMarketVisualSelection(marketOpeningMovement), getMarketOpeningLine(marketEvent), getMarketOpeningOdds(marketEvent), marketEvent.market)
                    : null;
                  const marketCurrentState = marketEvent && marketCurrentMovement && marketAnchorState
                    ? formatMarketStateLine(getMarketVisualSelection(marketCurrentMovement), marketAnchorState.currentLine, marketAnchorState.currentOdds, marketEvent.market)
                    : null;
                  const marketLineStatus = marketEvent ? getMarketLineMoveStatus(marketEvent) : null;
                  const marketTrend = marketEvent ? getMarketTrend(marketEvent) : null;
                  const whyFullText = isIntelligenceImpact
                    ? joinImpactDetailLines([
                        (item as AtlasIntelligenceEvent).summary,
                        `Team event: ${(item as AtlasIntelligenceEvent).details.teamEventType}`,
                        `Team event time: ${formatTeamImpactTimestamp((item as AtlasIntelligenceEvent).details.teamEventTime)}`,
                        `Market: ${(item as AtlasIntelligenceEvent).details.market}`,
                        `Market movement: ${(item as AtlasIntelligenceEvent).details.marketMovementType.replaceAll("_", " ")}`,
                        `Market time: ${formatTeamImpactTimestamp((item as AtlasIntelligenceEvent).details.marketTime)}`,
                        `Minutes between events: ${(item as AtlasIntelligenceEvent).details.minutesBetween}`,
                      ])
                    : isMarketImpact && marketEvent
                      ? joinImpactDetailLines([
                          `Movement: ${getMarketDirectionWhy(marketEvent)}`,
                          `Market: ${marketEvent.market}`,
                          `Selection: ${marketCurrentState?.market ?? marketEvent.selection}`,
                          marketAnchorState?.currentBook ? `Book: ${marketAnchorState.currentBook}` : null,
                          marketAnchorState ? `Detected In: ${marketAnchorState.booksOnAnchor || marketEvent.booksMoved} of ${marketEvent.booksObserved} sportsbooks` : null,
                          `Consensus: ${marketEvent.booksMoved} of ${marketEvent.booksObserved} (${marketEvent.consensusPercent.toFixed(0)}%)`,
                          marketAnchorState?.transition ? `Anchor Transition: ${formatMarketLineOnly(marketAnchorState.transition.oldLine, marketEvent.market)} -> ${formatMarketLineOnly(marketAnchorState.transition.newLine, marketEvent.market)}` : null,
                          marketAnchorState?.transition ? `Reason: ${marketAnchorState.transition.reason}` : null,
                          marketEvent.firstMoveAt ? `First Move: ${formatTeamImpactTimestamp(marketEvent.firstMoveAt)}` : null,
                          marketEvent.sportsbookNamesMoved.length > 0 ? `Books: ${marketEvent.sportsbookNamesMoved.join(", ")}` : null,
                        ])
                      : teamEvent
                        ? joinImpactDetailLines([
                            teamEvent.why,
                            `Event: ${teamEvent.eventType}`,
                            teamEvent.playerName ? `Player: ${teamEvent.playerName}` : null,
                            `Team: ${primaryTeam}`,
                            matchup ? `Game context: ${matchup}` : null,
                            `Status: ${teamEvent.status}`,
                            `Source: ${teamEvent.source}`,
                            teamEvent.sourceUrl ? `Source URL: ${teamEvent.sourceUrl}` : null,
                          ])
                        : whyText;
                  const impactFullText = isIntelligenceImpact
                    ? joinImpactDetailLines([
                        getAtlasIntelligenceImpact(item as AtlasIntelligenceEvent),
                        getAtlasIntelligenceTimeline(item as AtlasIntelligenceEvent),
                        `Market: ${(item as AtlasIntelligenceEvent).details.market}`,
                        `Movement size: ${(item as AtlasIntelligenceEvent).details.movementSize}`,
                        `Minutes between team event and market move: ${(item as AtlasIntelligenceEvent).details.minutesBetween}`,
                      ])
                    : isMarketImpact && marketEvent
                      ? joinImpactDetailLines([
                          "Complete movement history today",
                          getMarketImpactHistoryText(marketEvent),
                        ])
                      : teamEvent
                        ? joinImpactDetailLines([
                            teamEvent.impact,
                            `Area affected: ${getTeamImpactCompactSummary(teamEvent)}`,
                            `Team: ${primaryTeam}`,
                            matchup ? `Game context: ${matchup}` : null,
                            teamEvent.playerName ? `Player: ${teamEvent.playerName}` : null,
                            `Confidence: ${teamEvent.confidence}`,
                            `Published: ${formatTeamImpactTimestamp(teamEvent.publishedAt)}`,
                          ])
                        : impactText;

                  if (isIntelligenceImpact) {
                    const intelligence = item as AtlasIntelligenceEvent;

                    return (
                      <article
                        key={feedItem.id}
                        className={`relative overflow-hidden rounded-[18px] border ${accent.border} bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.105),transparent_34%),linear-gradient(180deg,rgba(6,16,31,0.94),rgba(3,8,20,0.98))] px-2 pb-1.5 pt-0 ${accent.glow}`}
                      >
                        <div className={`-mx-2 mb-1 flex items-center justify-between gap-3 border-b px-2 py-0.5 ${accent.banner}`}>
                          <div className="min-w-0">
                            <p className={`truncate text-[10px] font-black uppercase tracking-[0.11em] ${accent.text}`}>
                              <span className="mr-1.5">{accent.icon}</span>{accent.label}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <span className={`rounded-full border px-1.5 py-px text-[8px] font-black uppercase tracking-[0.08em] ${confidenceClass}`}>
                              {getImpactConfidenceLabel(feedItem.kind, feedItem.confidence)}
                            </span>
                            <span className="text-[9px] font-black text-white/46">{formatTeamImpactTimestamp(feedItem.publishedAt)}</span>
                          </div>
                        </div>

                        <div className="mt-1 grid grid-cols-[47px_1fr] gap-2">
                          <div className="relative grid place-items-center">
                            <TerminalTeamMark teamName={primaryTeam} sport={badgeSport} size="lg" />
                              {secondaryTeam ? (
                                <span className="absolute -bottom-1 -right-1">
                                  <TerminalTeamMark teamName={secondaryTeam} sport={badgeSport} />
                                </span>
                              ) : null}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[18px] font-black leading-tight text-white">{getAtlasIntelligenceImpact(intelligence)}</h3>
                            <p className="mt-0.5 truncate text-[12px] font-bold text-white/64">{matchup}</p>
                            <span className="mt-1 inline-flex rounded-full border border-violet-300/24 bg-violet-300/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-violet-200">
                              {feedItem.sport}
                            </span>
                          </div>
                        </div>

                        <div className={`mt-1.5 rounded-[11px] border px-2 py-1 ${accent.panel}`}>
                          <p className={`text-[9px] font-black uppercase tracking-[0.1em] ${accent.text}`}>SUMMARY</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-[13px] text-white/76">{intelligence.summary}</p>
                        </div>

                        <div className="mt-1 rounded-[11px] border border-violet-300/10 bg-black/14 px-2 py-1">
                          <p className="truncate text-[9px] font-bold leading-3 text-white/62">
                            <span className="font-black text-violet-200/72">{formatTeamImpactTimestamp(intelligence.details.teamEventTime)}</span>
                            <span className="mx-1 text-white/28">·</span>
                            {intelligence.details.teamEventType}
                            <span className="mx-1.5 text-violet-300">→</span>
                            <span className="font-black text-violet-200/72">{formatTeamImpactTimestamp(intelligence.publishedAt)}</span>
                            <span className="mx-1 text-white/28">·</span>
                            Market Reaction
                          </p>
                        </div>

                        <ImpactDetailButtons
                          whyLabel="WHY"
                          whyText={getAtlasIntelligenceWhy(intelligence)}
                          whyFullText={whyFullText}
                          impactLabel="IMPACT"
                          impactText={getAtlasIntelligenceImpact(intelligence)}
                          impactFullText={impactFullText}
                          accent={accent}
                          title={detailTitle}
                          subtitle={detailSubtitle}
                          onOpen={setImpactDetailSheet}
                        />

                        <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1">
                          <p className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-white/50">
                            News + Market Correlation
                          </p>
                          <span className={`text-[10px] font-black ${accent.text}`}>View Source →</span>
                        </div>
                      </article>
                    );
                  }

                  return (
                    <article
                      key={feedItem.id}
                        className={`relative overflow-hidden rounded-[18px] border ${accent.border} bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_34%),linear-gradient(180deg,rgba(6,16,31,0.94),rgba(3,8,20,0.98))] px-2 pb-1 pt-0 ${accent.glow}`}
                    >
                      <div className={`-mx-2 mb-1 flex items-center justify-between gap-3 border-b px-2 py-0.5 ${accent.banner}`}>
                        <p className={`min-w-0 truncate text-[10px] font-black uppercase tracking-[0.11em] ${accent.text}`}>
                          {isMarketImpact ? (
                            <span className="mr-1.5 inline-flex align-[-3px]">
                              <ImpactSummaryIcon name="market" className="h-[14px] w-[14px]" />
                            </span>
                          ) : (
                            <span className="mr-1.5">{accent.icon}</span>
                          )}
                          {accent.label}
                        </p>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className={`rounded-full border px-1.5 py-px text-[8px] font-black uppercase tracking-[0.08em] ${confidenceClass}`}>
                            {getImpactConfidenceLabel(feedItem.kind, feedItem.confidence)}
                          </span>
                          <span className="text-[9px] font-black text-white/50">{formatTeamImpactTimestamp(feedItem.publishedAt)}</span>
                        </div>
                      </div>

                      {marketEvent ? (
                        <>
                          <div className="mt-1 grid grid-cols-[1fr_58px] gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <MarketTeamMark teamName={marketEvent.awayTeam} sport={badgeSport} />
                                <span className="text-[18px] font-black text-orange-300/80">›</span>
                                <MarketTeamMark teamName={marketEvent.homeTeam} sport={badgeSport} />
                              </div>
                              <h3 className="mt-0.5 text-[17px] font-black leading-tight text-white">
                                {getMarketMonitorTitle(marketEvent)}
                              </h3>
                              <p className="mt-0.5 text-[12px] font-black leading-[14px] text-orange-200/82">{marketCurrentState?.market ?? getMarketImpactPrimaryTitle(marketEvent, badgeSport)}</p>
                              <p className="text-[11px] font-bold leading-[13px] text-white/58">{matchup}</p>
                              <span className="mt-0.5 inline-flex rounded-full border border-orange-300/24 bg-orange-300/10 px-1.5 py-px text-[8px] font-black uppercase tracking-[0.08em] text-orange-200">
                                {feedItem.sport}
                              </span>
                            </div>
                            <div className="self-start rounded-[9px] border border-orange-300/18 bg-orange-400/[0.04] px-1 py-0.5 text-center shadow-[0_0_10px_rgba(249,115,22,0.07)]">
                              <p className="text-[12px] font-black leading-none text-orange-300">{marketEvent.booksMoved}<span className="text-[7px] text-white/62"> / </span>{marketEvent.booksObserved}</p>
                              <div className="my-px h-px bg-orange-300/12" />
                              <p className="text-[14px] font-black leading-none text-orange-300">{marketEvent.consensusPercent.toFixed(0)}%</p>
                              <p className="text-[5.5px] font-black uppercase tracking-[0.06em] text-white/50">Consensus</p>
                            </div>
                          </div>

                          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[12px] border border-orange-300/14 bg-orange-400/[0.035] px-2 py-0.5 text-center shadow-[0_0_14px_rgba(249,115,22,0.08)]">
                            <div>
                              <p className="text-[7px] font-black uppercase tracking-[0.1em] text-white/42">Open</p>
                              <p className="mt-px truncate text-[16px] font-black leading-none text-white">{marketOpenState?.market ?? "N/A"}</p>
                              <p className="mt-0.5 text-[10px] font-black leading-none text-white/62">{marketOpenState?.odds ?? "Odds N/A"}</p>
                            </div>
                            <div className="grid min-w-[30px] place-items-center">
                              <MarketMovementIcon direction={marketLineStatus?.direction ?? "stable"} />
                            </div>
                            <div>
                              <p className="text-[7px] font-black uppercase tracking-[0.1em] text-white/42">Current</p>
                              <p className="mt-px truncate text-[16px] font-black leading-none text-orange-300">{marketCurrentState?.market ?? "N/A"}</p>
                              <p className="mt-0.5 text-[10px] font-black leading-none text-orange-200/78">{marketCurrentState?.odds ?? "Odds N/A"}</p>
                              {marketAnchorState?.currentBook ? (
                                <p className="mt-px truncate text-[7px] font-black uppercase tracking-[0.06em] text-white/42">{marketAnchorState.currentBook}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div className={`rounded-[10px] border px-2 py-0.5 ${marketLineStatus?.badge ?? "border-orange-300/12 bg-black/16"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[7px] font-black uppercase tracking-[0.1em] text-white/42">Last Change</p>
                                <p className="text-[8px] font-black text-orange-200/68">{formatTeamImpactTimestamp(marketEvent.latestMoveAt ?? marketEvent.publishedAt)}</p>
                              </div>
                              <p className="mt-px text-[7px] font-black uppercase tracking-[0.1em] text-white/42">Status</p>
                              <p className={`truncate text-[10px] font-black uppercase tracking-[0.06em] ${marketLineStatus?.tone ?? "text-white/78"}`}>
                                {marketLineStatus?.label ?? "LINE STATUS"}
                              </p>
                              <p className="truncate text-[7px] font-black uppercase tracking-[0.06em] text-white/40">
                                Detected in {marketAnchorState?.booksOnAnchor || marketEvent.booksMoved} / {marketEvent.booksObserved}
                              </p>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-black/16 px-1 py-0.5 text-center">
                              <p className="text-[7px] font-black uppercase tracking-[0.1em] text-white/42">Trend</p>
                              <p className={`mt-px truncate text-[9px] font-black leading-none ${marketTrend?.tone ?? "text-yellow-300"}`}>
                                {marketTrend?.label ?? "Stable"}
                              </p>
                              <p className="mt-px truncate text-[8px] font-black text-white/50">{marketTrend?.detail ?? "Open"}</p>
                            </div>
                          </div>
                        </>
                      ) : teamEvent ? (
                        <div className="mt-1 grid grid-cols-[47px_1fr] gap-2">
                          <TerminalTeamMark teamName={primaryTeam} sport={badgeSport} size="lg" />
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 text-[18px] font-black leading-tight text-white">{teamEvent.eventType}</h3>
                            <p className="truncate text-[11px] font-bold text-white/64">{primaryTeam}</p>
                            <span className="mt-0.5 inline-flex rounded-full border border-sky-300/24 bg-sky-300/10 px-1.5 py-px text-[8px] font-black uppercase tracking-[0.08em] text-sky-200">
                              {feedItem.sport}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      <ImpactDetailButtons
                        whyLabel={whyLabel.replace(":", "")}
                        whyText={whyText}
                        whyFullText={whyFullText}
                        impactLabel={impactLabel.replace(":", "")}
                        impactText={impactText}
                        impactFullText={impactFullText}
                        accent={accent}
                        title={detailTitle}
                        subtitle={detailSubtitle}
                        onOpen={setImpactDetailSheet}
                      />

                      {isMarketImpact ? (
                        <div className="mt-1 border-t border-white/10 pt-0.5">
                          <p className="truncate text-[8px] font-black uppercase tracking-[0.1em] text-white/45">
                            Atlas Market Monitoring
                          </p>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-0.5">
                          <div className="min-w-0">
                            <p className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-white/50">
                              {teamEvent ? getTeamImpactCompactSummary(teamEvent) : sourceLabel}
                            </p>
                          </div>
                          {sourceUrl ? (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`shrink-0 text-[10px] font-black ${accent.text}`}
                            >
                              View Source →
                            </a>
                          ) : (
                            <span className={`shrink-0 text-[10px] font-black ${accent.text}`}>View Source →</span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        ) : appSection === "bankroll" ? (
          <AtlasBankrollScreen atlasSources={effectiveBankrollAtlasSources} membership={bankrollMembership} globalDemoModeEnabled={globalSnapshotMode.demoModeEnabled} />
        ) : false ? (
          <div className="space-y-3">
            <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                Watchlist
              </p>
              <h2 className="mt-2 text-[22px] font-black tracking-tight text-white">
                Your sports board
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-white/62">
                {followedSports.length} sports, {followedTeams.length} teams, {followedGames.length} games matching your follows.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {sportsTabs
                .filter((sport) => sport !== "TOP" && sport !== "NFL")
                .map((sport) => (
                  <div
                    key={`follow-${sport}`}
                    className={`rounded-[18px] border p-4 text-left transition-all ${
                      followedSports.includes(sport)
                        ? "border-cyan-400/40 bg-cyan-400/[0.10]"
                        : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSport(sport);
                          setAppSection("signals");
                          setViewMode("live");
                        }}
                        className="min-w-0 text-left"
                      >
                        <p className="text-[15px] font-black text-white">{sport}</p>
                        <p className="mt-1 text-[11px] text-white/50">
                          {sport === selectedSport ? filteredLiveGames.length : 0} games today
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFollowedSport(sport)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                          followedSports.includes(sport)
                            ? "bg-cyan-400 text-black"
                            : "bg-white/10 text-white/55"
                        }`}
                      >
                        {followedSports.includes(sport) ? "On" : "Follow"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Teams from {selectedSport}
                </p>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-white/45">
                  {availableTeamsForFollowing.length}
                </span>
              </div>

              {availableTeamsForFollowing.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-black/20 px-3 py-3 text-[13px] text-white/45">
                  No teams available on this slate.
                </div>
              ) : (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {availableTeamsForFollowing.slice(0, 16).map((team) => (
                    <button
                      key={`team-follow-${team.key}`}
                      type="button"
                      onClick={() => toggleFollowedTeam(team.name)}
                      className={`flex min-w-[104px] flex-col items-center rounded-[18px] border px-3 py-3 ${
                        followedTeams.includes(team.key)
                          ? "border-cyan-400/45 bg-cyan-400/[0.12]"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <TeamBadge teamName={team.name} sport={selectedSport} />
                      <span className="mt-2 w-full truncate text-center text-[11px] font-bold text-white">
                        {getDisplayAbbr(team.name)}
                      </span>
                      <span
                        className={`mt-2 rounded-full px-2 py-0.5 text-[9px] font-black ${
                          followedTeams.includes(team.key)
                            ? "bg-cyan-400 text-black"
                            : "bg-white/10 text-white/45"
                        }`}
                      >
                        {followedTeams.includes(team.key) ? "Following" : "Follow"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Followed games
              </p>

              <div className="mt-3 space-y-2">
                {followedGames.length === 0 ? (
                  <div className="rounded-2xl bg-black/20 px-3 py-3 text-[13px] leading-5 text-white/45">
                    Follow a sport or team to build your personalized game board.
                  </div>
                ) : (
                  followedGames.slice(0, 8).map((game, idx) => {
                    const gameSport = getLiveSportFromKey(game.sport_key);
                    const awayScore =
                      game.scores?.find((s) => s.name === game.away_team)?.score ?? "-";
                    const homeScore =
                      game.scores?.find((s) => s.name === game.home_team)?.score ?? "-";
                    const hasScore = awayScore !== "-" || homeScore !== "-";

                    return (
                      <button
                        key={`followed-game-${game.id}-${idx}`}
                        type="button"
                        onClick={() => handleLiveGameClick(game, gameSport)}
                        className="block w-full rounded-2xl bg-black/25 px-3 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300">
                            {gameSport}
                          </span>
                          <span className="text-[11px] font-semibold text-white/45">
                            {hasScore ? `${awayScore}-${homeScore}` : formatTime(game.commence_time)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-white">
                              {getLiveDisplayName(game.away_team)}
                            </p>
                            <p className="mt-1 truncate text-[13px] font-bold text-white">
                              {getLiveDisplayName(game.home_team)}
                            </p>
                          </div>
                          <div className="flex shrink-0 -space-x-2">
                            <TeamBadge teamName={game.away_team} sport={gameSport} />
                            <TeamBadge teamName={game.home_team} sport={gameSport} />
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {followedSports.length > 0 || followedTeams.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (authSession.authenticated) {
                    Promise.all([
                      ...followedSports.map((sport) =>
                        fetch("/api/user-follows", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ followType: "sport", sport }),
                        })
                      ),
                      ...followedTeams.map((teamKey) =>
                        fetch("/api/user-follows", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ followType: "team", teamKey }),
                        })
                      ),
                    ]).catch(() => undefined);
                  }

                  setFollowedSports([]);
                  setFollowedTeams([]);
                }}
                className="w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[13px] font-bold text-white/55"
              >
                Clear Watchlist
              </button>
            ) : null}

            {subsPicks.length > 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Premium watch
                </p>
                <div className="mt-3 space-y-2">
                  {subsPicks.slice(0, 3).map((pick, idx) => (
                    <div
                      key={`watch-${idx}`}
                      className="flex items-center justify-between rounded-2xl bg-black/25 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-white">
                          {pick.awayTeam} vs {pick.homeTeam}
                        </p>
                        <p className="text-[11px] text-white/45">
                          {pick.startTime ? formatTime(pick.startTime) : "Time pending"}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-yellow-500/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-yellow-300">
                        {pick.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : appSection === "alerts" ? (
          <div className="space-y-3">
            <section className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                    Alerts Center
                  </p>
                  <h2 className="mt-2 text-[22px] font-black tracking-tight text-white">
                    Today&apos;s signal feed
                  </h2>
                  <p className="mt-2 text-[13px] leading-5 text-white/62">
                    Alerts are generated from current games, premium picks, validation status and records.
                  </p>
                </div>

                <span className="rounded-full bg-cyan-400 px-3 py-1.5 text-[11px] font-black text-black">
                  {atlasAlerts.length}
                </span>
              </div>
            </section>

            {atlasAlerts.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[16px] font-bold text-white">
                  No alerts yet
                </p>
                <p className="mt-2 text-[13px] leading-5 text-white/55">
                  Atlas will surface alerts when games start, premium boards are available, signals validate, or records update.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {atlasAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={alert.action}
                    className="block w-full rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-left transition-all active:scale-[0.995]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          alert.tone === "green"
                            ? "bg-green-300"
                            : alert.tone === "red"
                            ? "bg-red-300"
                            : alert.tone === "yellow"
                            ? "bg-yellow-300"
                            : alert.tone === "cyan"
                            ? "bg-cyan-300"
                            : "bg-white/50"
                        }`}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                              alert.tone === "green"
                                ? "bg-green-500/15 text-green-300"
                                : alert.tone === "red"
                                ? "bg-red-500/15 text-red-300"
                                : alert.tone === "yellow"
                                ? "bg-yellow-500/15 text-yellow-300"
                                : alert.tone === "cyan"
                                ? "bg-cyan-400/10 text-cyan-300"
                                : "bg-white/10 text-white/55"
                            }`}
                          >
                            {alert.label}
                          </span>
                        </div>

                        <p className="mt-3 truncate text-[15px] font-black text-white">
                          {alert.title}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-white/55">
                          {alert.body}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <section className="rounded-[24px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),rgba(255,255,255,0.04)_48%)] p-4 shadow-[0_0_26px_rgba(34,211,238,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">
                    Join Atlas
                  </p>
                  <h2 className="mt-1.5 text-[24px] font-black tracking-tight text-white">
                    Sign in / Sign up
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-white/58">
                    Create your account here, then choose your Atlas Signals pack below.
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.10em] text-cyan-200">
                  {authSession.authenticated ? userAccess.plan : "Account"}
                </span>
              </div>

              {joinAuthMessage ? (
                <div
                  className={`mt-3 rounded-[16px] border px-3 py-2 text-[12px] leading-4 ${
                    joinAuthMessage.tone === "error"
                      ? "border-red-400/25 bg-red-500/10 text-red-100"
                      : joinAuthMessage.tone === "success"
                      ? "border-lime-300/25 bg-lime-400/10 text-lime-100"
                      : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                  }`}
                >
                  <p className="font-black">{joinAuthMessage.title}</p>
                  {joinAuthMessage.body ? <p className="mt-0.5 text-white/68">{joinAuthMessage.body}</p> : null}
                </div>
              ) : null}

              {authSession.authenticated ? (
                <div className="mt-4 rounded-[18px] border border-white/10 bg-black/22 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    Signed in
                  </p>
                  <p className="mt-1 truncate text-[16px] font-black text-white">
                    {authSession.email}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={authBusy}
                    className="rounded-[16px] border border-white/15 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-60"
                  >
                    Logout
                  </button>
                    <button
                      type="button"
                      onClick={
                        hasPaidSubscription
                          ? handleManageBilling
                          : () => {
                              setAppSection("more");
                              setJoinAuthMessage({
                                tone: "info",
                                title: "Choose your pack below.",
                                body: "Select Exclusive, Premium or Elite to continue to secure checkout.",
                              });
                            }
                      }
                      disabled={billingBusy}
                      className="rounded-[16px] border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 text-[13px] font-bold text-cyan-200 disabled:opacity-60"
                    >
                      {hasPaidSubscription ? "Billing" : "Plans"}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInlineAuthSubmit} className="mt-4">
                  <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-white/10 bg-black/24 p-1">
                    {(["signup", "signin"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setJoinAuthMode(mode);
                          setJoinAuthMessage(null);
                        }}
                        className={`rounded-[12px] px-3 py-2 text-[12px] font-black uppercase tracking-[0.10em] transition-all ${
                          joinAuthMode === mode
                            ? "bg-cyan-300 text-black"
                            : "text-white/56"
                        }`}
                      >
                        {mode === "signup" ? "Sign Up" : "Sign In"}
                      </button>
                    ))}
                  </div>

                  <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-white/48">
                    Email
                    <input
                      value={joinEmail}
                      onChange={(event) => setJoinEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      required
                      className="mt-1.5 w-full rounded-[14px] border border-white/10 bg-black/35 px-3 py-3 text-[14px] normal-case tracking-normal text-white outline-none transition-colors focus:border-cyan-300"
                    />
                  </label>

                  <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-white/48">
                    Password
                    <input
                      value={joinPassword}
                      onChange={(event) => setJoinPassword(event.target.value)}
                      type="password"
                      autoComplete={joinAuthMode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      className="mt-1.5 w-full rounded-[14px] border border-white/10 bg-black/35 px-3 py-3 text-[14px] normal-case tracking-normal text-white outline-none transition-colors focus:border-cyan-300"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="mt-4 w-full rounded-[16px] bg-cyan-300 px-4 py-3 text-[13px] font-black uppercase tracking-[0.12em] text-black shadow-[0_0_18px_rgba(34,211,238,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authBusy
                      ? "Working..."
                      : joinAuthMode === "signup"
                      ? "Create Account"
                      : "Sign In"}
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">
                    Atlas Packs
                  </p>
                  <h2 className="mt-1 text-[21px] font-black tracking-tight text-white">
                    Choose your membership
                  </h2>
                </div>
                <p className="text-right text-[9px] font-bold leading-3 text-white/42">
                  Top Signal and Top Play stay separate.
                </p>
              </div>

              <div className="mt-3">
                <PackSportSelector
                  value={selectedPackSport}
                  onChange={setSelectedPackSport}
                  sports={activeSubscriptionSports}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {subscriptionPackPlans.map((pack) => (
                  <PackCard
                    key={`join-pack-${pack.plan}`}
                    pack={pack}
                    onChoose={handleJoinPlanChoose}
                    disabled={checkoutPlan !== null}
                    compact
                  />
                ))}
              </div>

              <StripeTrustBar />
            </section>

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                    Stats Center
                  </p>
                  <h2 className="mt-2 text-[22px] font-black tracking-tight text-white">
                    {selectedSport} performance
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-white/50">
                    Confirmed records only. Pushes and pending picks stay separated from win rate.
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                  {userAccess.plan}
                </span>
              </div>

              {canViewStatsAndHistory(userAccess) ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] border border-cyan-400/20 bg-cyan-400/[0.08] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200/70">
                        Top Signal
                      </p>
                      <p className="mt-3 text-[28px] font-black leading-none text-white">
                        {selectedTopSignalRecord.wins}-{selectedTopSignalRecord.losses}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/55">
                        <p>Push: {selectedTopSignalRecord.pushes}</p>
                        <p>Pending: {selectedTopSignalRecord.pending}</p>
                        <p>Decided: {selectedTopSignalRecord.decided}</p>
                        <p>Total: {selectedTopSignalRecord.total}</p>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-yellow-400/20 bg-yellow-500/[0.08] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-yellow-200/70">
                        Top 3
                      </p>
                      <p className="mt-3 text-[28px] font-black leading-none text-white">
                        {top5RecordStats.wins}-{top5RecordStats.losses}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/55">
                        <p>Push: {top5RecordStats.pushes}</p>
                        <p>Pending: {top5RecordStats.pending}</p>
                        <p>Decided: {top5RecordStats.decided}</p>
                        <p>Total: {top5RecordStats.total}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                        Top Signal Win Rate
                      </p>
                      <p className="mt-2 text-[26px] font-black text-cyan-300">
                        {selectedTopSignalRecord.winRate}%
                      </p>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                        Top 3 Win Rate
                      </p>
                      <p className="mt-2 text-[26px] font-black text-yellow-300">
                        {top5RecordStats.winRate}%
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-[20px] border border-cyan-400/20 bg-cyan-400/[0.07] p-4">
                  <p className="text-[15px] font-bold text-white">
                    Premium stats are locked
                  </p>
                  <p className="mt-2 text-[13px] leading-5 text-white/62">
                    Premium and Elite unlock ranked Top 3 records, win rate, decided picks and history.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAppSection("signals");
                      setViewMode("odds");
                    }}
                    className="mt-4 w-full rounded-[16px] bg-cyan-500 px-4 py-3 text-[13px] font-black text-black"
                  >
                    View Plans
                  </button>
                </div>
              )}
            </section>

            {canViewStatsAndHistory(userAccess) ? (
              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Recent Results
                </p>

                <div className="mt-4 space-y-2">
                  {[...visibleTopSignalHistory.slice(0, 2), ...top5History.slice(0, 3)]
                    .slice(0, 5)
                    .map((item, idx) => (
                      <div
                        key={`more-history-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-black/25 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-white">
                            {item.away_team} vs {item.home_team}
                          </p>
                          <p className="truncate text-[11px] text-white/45">
                            {item.pick}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                            item.result === "WON"
                              ? "bg-green-500/15 text-green-300"
                              : item.result === "LOST"
                              ? "bg-red-500/15 text-red-300"
                              : item.result === "PUSH"
                              ? "bg-yellow-500/15 text-yellow-300"
                              : "bg-white/10 text-white/45"
                          }`}
                        >
                          {item.result ?? "PENDING"}
                        </span>
                      </div>
                    ))}

                  {visibleTopSignalHistory.length === 0 && top5History.length === 0 ? (
                    <div className="rounded-2xl bg-black/20 px-3 py-3 text-[13px] text-white/45">
                      No recent history available yet.
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Signal Timeline
              </p>
              <div className="mt-4 space-y-3">
                {["7:00 am - Daily board", "Pregame - Validation", "Final - Record update"].map(
                  (item) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                      <p className="text-[13px] font-semibold text-white/75">{item}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {selectedSignalInsight ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-4 pb-4 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[28px] border border-cyan-400/25 bg-[#07111f] p-5 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                  Atlas Pick Analysis
                </p>
                <h2 className="mt-2 text-[22px] font-black leading-tight text-white">
                  {selectedSignalInsight.pick}
                </h2>
                <p className="mt-1 truncate text-[12px] font-semibold text-white/45">
                  {selectedSignalInsight.awayTeam} vs {selectedSignalInsight.homeTeam}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSignalInsight(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-[18px] font-bold text-white/70"
                aria-label="Close analysis"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-[13px] leading-6 text-white/70">
              {selectedSignalInsight.analysisSummary}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] border border-cyan-400/15 bg-cyan-400/[0.06] p-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
                  Confidence
                </p>
                <p className="mt-1 text-[15px] font-black text-cyan-300">
                  {selectedSignalInsight.confidenceLabel ?? "Qualified"}
                </p>
              </div>

              <div className="rounded-[16px] border border-emerald-400/15 bg-emerald-400/[0.06] p-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
                  Edge
                </p>
                <p className="mt-1 text-[15px] font-black text-emerald-300">
                  {selectedSignalInsight.edgeLabel ?? "Model edge"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                Why Atlas selected it
              </p>
              <div className="mt-3 space-y-2">
                {selectedSignalInsight.modelFactors.map((factor) => (
                  <div key={factor} className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="mt-1 grid h-4 w-4 place-items-center rounded-full border border-cyan-300/65 text-[9px] text-cyan-300">
                      ✓
                    </span>
                    <p className="text-[12px] leading-5 text-white/68">
                      {factor}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {selectedSignalInsight.riskNote ? (
              <p className="mt-3 text-[11px] leading-5 text-white/42">
                {selectedSignalInsight.riskNote}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {impactDetailSheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-3 backdrop-blur-sm"
          onClick={() => setImpactDetailSheet(null)}
        >
          <div
            className={`max-h-[82vh] w-full max-w-md overflow-hidden rounded-t-[28px] border ${impactDetailSheet.accent.border} bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_34%),#07101f] shadow-[0_-22px_70px_rgba(34,211,238,0.16)]`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="impact-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/18" />

            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-4">
              <div className="min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${impactDetailSheet.accent.text}`}>
                  {impactDetailSheet.label}
                </p>
                <h2
                  id="impact-detail-title"
                  className="mt-2 line-clamp-2 text-[22px] font-black leading-tight tracking-[-0.03em] text-white"
                >
                  {impactDetailSheet.title}
                </h2>
                <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-white/48">
                  {impactDetailSheet.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setImpactDetailSheet(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-cyan-300/40 hover:text-cyan-200"
                aria-label="Close impact detail"
              >
                ×
              </button>
            </div>

            <div className="max-h-[calc(82vh-112px)] overflow-y-auto px-5 py-4">
              <div className={`rounded-[18px] border px-4 py-3 ${impactDetailSheet.accent.panel}`}>
                <div className="space-y-3">
                  {impactDetailSheet.text.split(/\n{2,}/).map((paragraph, index) => {
                    const labelMatch = paragraph.match(/^([^:\n]{2,28}):\s+([\s\S]+)$/);

                    if (labelMatch) {
                      return (
                        <div key={`${impactDetailSheet.label}-${index}`} className="grid grid-cols-[92px_1fr] gap-3 border-b border-white/8 pb-2 last:border-b-0 last:pb-0">
                          <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${impactDetailSheet.accent.text}`}>
                            {labelMatch[1]}
                          </p>
                          <p className="whitespace-pre-wrap text-[12px] font-semibold leading-5 text-white/76">
                            {labelMatch[2]}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <p key={`${impactDetailSheet.label}-${index}`} className="whitespace-pre-wrap text-[13px] font-semibold leading-5 text-white/74">
                        {paragraph}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pulseSourcesSheet ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-4 pb-4 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[26px] border border-cyan-400/25 bg-[#07111f] p-4 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                  Sources
                </p>
                <h2 className="mt-2 line-clamp-2 text-[17px] font-black leading-tight text-white">
                  {pulseSourcesSheet.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setPulseSourcesSheet(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-[18px] font-bold text-white/70"
                aria-label="Close sources"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {pulseSourcesSheet.sources.map((source) => {
                const content = (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-black text-white">
                        {source.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-white/42">
                        {source.provider === "OddsAPI" ? "Generated by Atlas AI" : `Reliability ${source.reliability}`}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-cyan-300/25 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200">
                      {source.url ? "Read" : "Atlas"}
                    </span>
                  </>
                );

                return source.url ? (
                  <a
                    key={`${source.name}-${source.url}`}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.045] px-3 py-2.5"
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    key={`${source.name}-${source.provider}-${source.publishedAt}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.045] px-3 py-2.5"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {useBankrollSplashOverlay && appSection === "bankroll" ? (
        <div
          className={`fixed inset-0 z-[90] transition-opacity duration-500 ease-out ${
            showSplash ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden="true"
        >
          <AtlasSplashScreen entered={splashEntered} />
        </div>
      ) : null}

      <AtlasBottomNavigation
        activeSection={appSection}
        onNavigate={(section) => {
          if (section === "signals") {
            navigateAppState({ section, view: "live" });
            return;
          }

          navigateAppState({ section });
        }}
      />
    </div>
  </main>
);
}
export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050816] text-white">
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading...
            </div>
          </div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
