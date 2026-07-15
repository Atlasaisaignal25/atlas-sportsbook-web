"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { HowItWorksSheet } from "./HowItWorksSheet";
import { PrecisionRevealSheet } from "./PrecisionRevealSheet";
import { SignalDetectedDetailSheet } from "./SignalDetectedDetailSheet";
import type { SignalDetectedRow } from "./SignalDetectedFeed";
import { SignalInfoBar } from "./SignalInfoBar";
import { OfficialSportSelectorRow } from "./OfficialSportSelectorRow";
import { SportSignalRail } from "./SportSignalRail";
import type { SportCode, SportSignalViewModel } from "./SportSignalCard";
import { SportLineIcon } from "./sportVisuals";
import { SportSignalDetailSheet } from "./SportSignalDetailSheet";
import { TodayActivityCard, type ActivityMetric } from "./TodayActivityCard";
import { TopPlayCard, type TopPlayViewModel } from "./TopPlayCard";
import { TopPlayDetailSheet } from "./TopPlayDetailSheet";
import { teamBranding } from "../../lib/teamBranding";
import {
  AtlasControlCenterPanel,
  filterAtlasControlCenterData,
  type AtlasActivityFilter,
  type AtlasControlCenterData,
  type AtlasControlMode,
  type AtlasControlTab,
} from "../../admin/AdminDashboard";
import { AtlasBottomNavigation } from "../AtlasBottomNavigation";

export type SignalsHomePrecisionResponse = {
  productType?: "top_signal" | "top_play";
  sport?: string;
  date?: string;
  status?: string;
  releaseAt?: string | null;
  lockedAt?: string | null;
  progressPercent?: number;
  minutesToRelease?: number | null;
  minutesToKickoff?: number | null;
  canPurchase?: boolean;
  canRevealPick?: boolean;
  purchased?: boolean;
  admin?: boolean;
  availableForPurchase?: boolean;
  noPlayReason?: string | null;
  preview?: {
    message?: string;
    subtitle?: string;
  };
  pick?: {
    gameId?: string | null;
    matchup?: string | null;
    startTime?: string | null;
    pickLabel?: string | null;
    market?: string | null;
    selection?: string | null;
    line?: number | null;
    odds?: number | null;
  } | null;
};

export type SignalsHomeNavSection = "bankroll" | "news" | "signals" | "alerts" | "more";
export type SelectedSport = "all" | "baseball" | "basketball" | "football" | "ice_hockey" | "soccer";
export type SignalsContentMode = "signals" | "live";

export type SignalsLiveRow = {
  id: string;
  gameId: string;
  sport: SportCode;
  leagueTitle: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: string;
  homeScore: string;
  centerValue: string;
  statusLabel: string;
  awayOdds: string;
  totalLabel: string;
  homeOdds: string;
};

export type PrecisionNotifyResult =
  | { status: "reserved"; prepared?: boolean; persisted?: boolean }
  | { status: "prepared"; prepared?: boolean; persisted?: boolean }
  | { status: "login" }
  | { status: "error"; message?: string };

export type PrecisionUnlockResult =
  | { status: "checkout" }
  | { status: "login" }
  | { status: "view_pick" }
  | { status: "error"; message: string };

type JourneyMessage = {
  tone: "success" | "info" | "error";
  title: string;
  body?: string;
};

type ProfileOverview = {
  profile: {
    name: string;
    username: string;
    initials: string;
    membershipTier: string;
    memberSince: string;
    timeZone: string;
  };
  summary: {
    signalsReceived: number | string;
    winRate: string;
    roi: string;
    accuracy: string;
    sampleSize: number;
  };
  signals: Array<{
    id: string;
    sport?: string;
    product: string;
    productCode: string;
    rank?: number | null;
    selection: string;
    event: string;
    opponent: string;
    team: string;
    status: string;
    statusDescription?: string;
    gameTime: string;
    publishedAt: string;
  }>;
  productSections?: Array<{
    code: string;
    title: string;
    sport: string;
    progress: string;
    emptyText?: string;
    signals: ProfileOverview["signals"];
  }>;
  products: Array<{
    code: string;
    name: string;
    status: string;
    detail: string;
    expandable: boolean;
  }>;
  recommendations: Array<{
    code: string;
    title: string;
    description: string;
    cta: string;
    tone: string;
  }>;
  activity: Array<{
    id: string;
    type: string;
    description: string;
    time: string;
    product: string;
  }>;
  unreadCount: number;
};

type SignalsHomePageProps = {
  topPlay?: SignalsHomePrecisionResponse | null;
  topSignals?: Partial<Record<SportCode, SignalsHomePrecisionResponse | null>>;
  signalRows?: SignalDetectedRow[];
  liveRows?: SignalsLiveRow[];
  liveLoading?: boolean;
  liveErrorMessage?: string | null;
  signalGroupCount?: number;
  activeSection?: SignalsHomeNavSection;
  demoModeEnabled?: boolean;
  demoSnapshotDate?: string | null;
  onNavigate?: (section: SignalsHomeNavSection) => void;
  onSportProductAction?: (sport: SportCode) => Promise<PrecisionUnlockResult> | PrecisionUnlockResult | void;
  onTopPlayAction?: () => Promise<PrecisionUnlockResult> | PrecisionUnlockResult | void;
  onTopPlayNotify?: () => Promise<PrecisionNotifyResult>;
  onSportNotify?: (sport: SportCode) => Promise<PrecisionNotifyResult>;
  onLiveRowOpen?: (row: SignalsLiveRow) => void;
  activeDate?: string;
  onDateChange?: (date: string) => void;
  activeSubscriptionSports?: SportCode[];
  selectedSubscriptionSport?: SportCode;
  onSelectedSubscriptionSportChange?: (sport: SportCode) => void;
  onPlanSubscribe?: (plan: "exclusive" | "premium" | "unlimited", sport?: SportCode) => void;
  onRetry?: () => void;
  journeyMessage?: JourneyMessage | null;
  onDismissJourneyMessage?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
};

const sports: SportCode[] = ["MLB", "NBA", "NFL", "NHL", "SOCCER"];
const selectedSportToSportCode: Record<Exclude<SelectedSport, "all">, SportCode> = {
  baseball: "MLB",
  basketball: "NBA",
  football: "NFL",
  ice_hockey: "NHL",
  soccer: "SOCCER",
};

const sportCodeToSelectedSport: Record<SportCode, Exclude<SelectedSport, "all">> = {
  MLB: "baseball",
  NBA: "basketball",
  NFL: "football",
  NHL: "ice_hockey",
  SOCCER: "soccer",
};

const selectedSportLabels: Record<SelectedSport, string> = {
  all: "All Sports",
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  ice_hockey: "Hockey",
  soccer: "Soccer",
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function formatDemoSnapshotDate(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatCalendarMonth(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  })
    .format(parseDateKey(dateKey))
    .toUpperCase();
}

function formatCalendarDay(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    timeZone: "UTC",
  }).format(parseDateKey(dateKey));
}

function formatCalendarWeekday(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(parseDateKey(dateKey))
    .toUpperCase();
}

function getDateBoardLabel(dateKey: string) {
  const today = getTodayKey();
  if (dateKey === today) return "Today";
  return dateKey < today ? "Results" : "Schedule";
}

const selectedSportTopSignalEndpoints: Record<SelectedSport, string | null> = {
  all: null,
  baseball: "/api/precision/top-signal/mlb",
  basketball: "/api/precision/top-signal/nba",
  football: "/api/precision/top-signal/nfl",
  ice_hockey: "/api/precision/top-signal/nhl",
  soccer: "/api/precision/top-signal/soccer",
};

function getLogoKey(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const logoFolderToSport: Record<string, SportCode> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  soccer: "SOCCER",
};

const liveTeamLogoFileOverrides: Record<string, string> = {
  oaklandathletics: "athletics",
  stlouiscardinals: "stlouiscardinals",
};

const soccerLiveTeamLogoPathOverrides: Record<string, string> = {
  acmilan: "/team-logos/soccer/acmilan.png",
  clubamerica: "/team-logos/soccer/cfamerica.png",
  clubamrica: "/team-logos/soccer/cfamerica.png",
  inter: "/team-logos/soccer/intermilan.png",
  internazionale: "/team-logos/soccer/intermilan.png",
  intermiami: "/team-logos/soccer/intermiami.png",
  intermiamicf: "/team-logos/soccer/intermiami.png",
  orlandocity: "/team-logos/soccer/orlandocity.png",
  orlandocitysc: "/team-logos/soccer/orlandocity.png",
  parissaintgermain: "/team-logos/soccer/parissg.png",
  psg: "/team-logos/soccer/parissg.png",
  porto: "/team-logos/soccer/fcporto.png",
  pumasunam: "/team-logos/soccer/pumas.png",
  tigresuanl: "/team-logos/soccer/tigres.png",
  atletico: "/team-logos/soccer/atlticomadrid.png",
  atleticomadrid: "/team-logos/soccer/atlticomadrid.png",
  atlticomadrid: "/team-logos/soccer/atlticomadrid.png",
  unitedstates: "/team-logos/soccer/flags/us.svg",
  usa: "/team-logos/soccer/flags/us.svg",
  us: "/team-logos/soccer/flags/us.svg",
  mexico: "/team-logos/soccer/flags/mx.svg",
  canada: "/team-logos/soccer/flags/ca.svg",
  brazil: "/team-logos/soccer/flags/br.svg",
  argentina: "/team-logos/soccer/flags/ar.svg",
  england: "/team-logos/soccer/flags/eng.svg",
  france: "/team-logos/soccer/flags/fr.svg",
  germany: "/team-logos/soccer/flags/de.svg",
  spain: "/team-logos/soccer/flags/es.svg",
  portugal: "/team-logos/soccer/flags/pt.svg",
  netherlands: "/team-logos/soccer/flags/nl.svg",
  holland: "/team-logos/soccer/flags/nl.svg",
  japan: "/team-logos/soccer/flags/jp.svg",
  morocco: "/team-logos/soccer/flags/ma.svg",
  uruguay: "/team-logos/soccer/flags/uy.svg",
  belgium: "/team-logos/soccer/flags/be.svg",
  croatia: "/team-logos/soccer/flags/hr.svg",
  colombia: "/team-logos/soccer/flags/co.svg",
  ecuador: "/team-logos/soccer/flags/ec.svg",
  southkorea: "/team-logos/soccer/flags/kr.svg",
  korea: "/team-logos/soccer/flags/kr.svg",
  denmark: "/team-logos/soccer/flags/dk.svg",
  poland: "/team-logos/soccer/flags/pl.svg",
  switzerland: "/team-logos/soccer/flags/ch.svg",
  chile: "/team-logos/soccer/flags/cl.svg",
  costarica: "/team-logos/soccer/flags/cr.svg",
};

const liveTeamLogoLookup = Object.entries(teamBranding).reduce(
  (lookup, [teamName, team]) => {
    const folder = team.logo.match(/\/team-logos\/([^/]+)\//)?.[1];
    const sport = folder ? logoFolderToSport[folder] : null;

    if (!folder || !sport) return lookup;

    const teamKey = getLogoKey(teamName);
    const fileKey = liveTeamLogoFileOverrides[teamKey] ?? teamKey;
    const logo = sport === "SOCCER"
      ? soccerLiveTeamLogoPathOverrides[teamKey] ?? team.logo
      : `/team-logos/${folder}/${fileKey}.png`;

    [teamName, team.shortName, team.abbr].forEach((alias) => {
      const aliasKey = getLogoKey(alias);
      lookup[sport][aliasKey] = sport === "SOCCER"
        ? soccerLiveTeamLogoPathOverrides[aliasKey] ?? logo
        : logo;
    });

    return lookup;
  },
  {
    MLB: {},
    NBA: {},
    NFL: {},
    NHL: {},
    SOCCER: {},
  } as Record<SportCode, Record<string, string>>
);

function getLiveTeamLogoSrc(name: string, sport: SportCode) {
  const key = getLogoKey(name);
  const mappedSoccerLogo = sport === "SOCCER" ? soccerLiveTeamLogoPathOverrides[key] : null;
  if (mappedSoccerLogo) return mappedSoccerLogo;

  const mappedLogo = liveTeamLogoLookup[sport][key];

  if (mappedLogo) return mappedLogo;

  if (sport === "NBA") return `/team-logos/nba/${key}.png`;
  if (sport === "NHL") return `/team-logos/nhl/${key}.png`;
  if (sport === "MLB") return `/team-logos/mlb/${liveTeamLogoFileOverrides[key] ?? key}.png`;
  if (sport === "SOCCER") return `/team-logos/soccer/${key}.png`;

  return null;
}

function getSignalMatchupTeams(row: SignalDetectedRow) {
  const matchup = row.matchup ?? "";
  const teams = matchup
    .split(/\s+(?:vs\.?|at|@)\s+/i)
    .map((team) => team.trim())
    .filter(Boolean);

  return {
    awayTeam: teams[0] ?? "",
    homeTeam: teams.length > 1 ? teams.slice(1).join(" vs ") : "",
  };
}

function getTeamInitials(team: string) {
  const words = team.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AT";
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function SignalTeamLogo({
  team,
  sport,
  className = "",
}: {
  team: string;
  sport: SportCode;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logoSrc = team ? getLiveTeamLogoSrc(team, sport) : null;
  const canShowLogo = Boolean(logoSrc && failedSrc !== logoSrc);

  return (
    <span
      className={`grid place-items-center ${className}`}
      aria-hidden="true"
    >
      {canShowLogo ? (
        <img
          src={logoSrc ?? ""}
          alt=""
          className="h-full w-full object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.18)]"
          onError={() => {
            if (logoSrc) setFailedSrc(logoSrc);
          }}
        />
      ) : (
        <span className="grid h-[82%] w-[82%] place-items-center rounded-full border border-white/14 bg-[#061521] text-[8px] font-black uppercase tracking-[-0.04em] text-cyan-200">
          {getTeamInitials(team)}
        </span>
      )}
    </span>
  );
}

function SignalTeamLogoStack({
  row,
  size = "compact",
}: {
  row: SignalDetectedRow;
  size?: "compact" | "large";
}) {
  const { awayTeam, homeTeam } = getSignalMatchupTeams(row);
  const containerSize = size === "large" ? "h-[60px] w-[60px]" : "h-[50px] w-[50px]";
  const logoSize = size === "large" ? "h-[36px] w-[36px]" : "h-[28px] w-[28px]";

  return (
    <span className={`relative isolate block shrink-0 ${containerSize}`} aria-label={`${row.matchup} team logos`}>
      <SignalTeamLogo team={awayTeam} sport={row.sport} className={`absolute left-1 top-1 z-10 ${logoSize}`} />
      <SignalTeamLogo team={homeTeam || awayTeam} sport={row.sport} className={`absolute bottom-1 right-1 z-20 ${logoSize}`} />
    </span>
  );
}

function getSignalStartTime(row: SignalDetectedRow) {
  if (!row.startTime) return null;
  const parsed = Date.parse(row.startTime);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDisplayTimeToMinutes(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3];

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function getSignalStartMinutes(row: SignalDetectedRow) {
  const displayMinutes = parseDisplayTimeToMinutes(row.time);
  if (displayMinutes !== null) return displayMinutes;

  const parsed = getSignalStartTime(row);
  if (parsed === null) return null;

  const date = new Date(parsed);
  return date.getHours() * 60 + date.getMinutes();
}

export function sortSignalsByStartTime(signals: SignalDetectedRow[]) {
  return [...signals].sort((a, b) => {
    const aStart = getSignalStartMinutes(a);
    const bStart = getSignalStartMinutes(b);

    if (aStart !== null && bStart !== null && aStart !== bStart) {
      return aStart - bStart;
    }

    if (aStart !== null) return -1;
    if (bStart !== null) return 1;

    const aDetected = a.detectedAt ? Date.parse(a.detectedAt) : null;
    const bDetected = b.detectedAt ? Date.parse(b.detectedAt) : null;

    if (aDetected !== null && bDetected !== null && !Number.isNaN(aDetected) && !Number.isNaN(bDetected) && aDetected !== bDetected) {
      return aDetected - bDetected;
    }

    return a.id.localeCompare(b.id);
  });
}

const compactTeamSuffixes = [
  "Diamondbacks",
  "Blue Jays",
  "White Sox",
  "Red Sox",
  "Guardians",
  "Nationals",
  "Athletics",
  "Yankees",
  "Phillies",
  "Cardinals",
  "Mariners",
  "Dodgers",
  "Rockies",
  "Orioles",
  "Rangers",
  "Astros",
  "Braves",
  "Brewers",
  "Padres",
  "Tigers",
  "Royals",
  "Twins",
  "Angels",
  "Pirates",
  "Marlins",
  "Giants",
  "Mets",
  "Cubs",
  "Reds",
  "Rays",
  "Chiefs",
  "Chargers",
  "Raiders",
  "Lakers",
  "Celtics",
  "Oilers",
  "Canucks",
  "Real Madrid",
  "Barcelona",
];

function compactTeamName(team: string) {
  const normalized = team.trim();
  const exact = compactTeamSuffixes.find((name) => normalized.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const suffix = compactTeamSuffixes.find((name) =>
    normalized.toLowerCase().endsWith(` ${name.toLowerCase()}`),
  );
  return suffix ?? normalized;
}

function compactSignalPickLabel(pick: string) {
  const value = pick.trim();
  if (!value || /^(over|under)\b/i.test(value)) return value;

  const match = value.match(/\s+(ML|[+-]\d+(?:\.\d+)?|\([+-]?\d+(?:\.\d+)?\))$/i);
  if (!match || match.index === undefined) return value;

  const team = value.slice(0, match.index).trim();
  return `${compactTeamName(team)} ${match[1]}`;
}

export function getSignalsBySport(signals: SignalDetectedRow[], sport: SelectedSport) {
  if (sport === "all") return signals;
  const sportCode = selectedSportToSportCode[sport];
  return signals.filter((signal) => signal.sport === sportCode);
}

export function getUpcomingSignalsBySport(
  signals: SignalDetectedRow[],
  sport: SelectedSport,
  now: Date,
) {
  const nowTime = now.getTime();
  return sortSignalsByStartTime(getSignalsBySport(signals, sport)).filter((signal) => {
    const startTime = getSignalStartTime(signal);
    return startTime === null || startTime > nowTime;
  });
}

export function getNextSignalBySport(
  signals: SignalDetectedRow[],
  sport: SelectedSport,
  now: Date,
) {
  return getUpcomingSignalsBySport(signals, sport, now)[0] ?? null;
}

function getSignalViewAllResultBadge(status?: string | null) {
  const normalized = (status ?? "").trim().toUpperCase();

  if (["WON", "WIN", "WINNER", "W"].includes(normalized)) {
    return {
      icon: "✓",
      label: "WIN",
      iconClassName: "text-emerald-200",
      badgeClassName: "border-emerald-300/55 bg-emerald-400/10 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.16)]",
      cardClassName: "ring-1 ring-inset ring-emerald-300/18 bg-emerald-400/[0.025]",
    };
  }

  if (["LOST", "LOSS", "LOSE", "L"].includes(normalized)) {
    return {
      icon: "✕",
      label: "LOSS",
      iconClassName: "text-rose-200",
      badgeClassName: "border-red-300/55 bg-red-400/10 text-red-200 shadow-[0_0_14px_rgba(248,113,113,0.14)]",
      cardClassName: "ring-1 ring-inset ring-red-300/18 bg-red-400/[0.025]",
    };
  }

  if (normalized === "PUSH") {
    return {
      icon: null,
      label: "PUSH",
      iconClassName: "text-white/45",
      badgeClassName: "border-white/24 bg-white/8 text-white/66",
      cardClassName: "ring-1 ring-inset ring-white/10 bg-white/[0.015]",
    };
  }

  if (normalized === "CANCELLED") {
    return {
      icon: null,
      label: "CANCELLED",
      iconClassName: "text-white/45",
      badgeClassName: "border-white/20 bg-white/8 text-white/56",
      cardClassName: "ring-1 ring-inset ring-white/10 bg-white/[0.015]",
    };
  }

  if (normalized === "FINAL") {
    return {
      icon: null,
      label: "FINAL",
      iconClassName: "text-white/45",
      badgeClassName: "border-white/20 bg-white/8 text-white/62",
      cardClassName: "ring-1 ring-inset ring-white/10 bg-white/[0.015]",
    };
  }

  return null;
}

function formatCompactSignalScore(score?: string | null) {
  if (!score) return null;
  const compactMatch = score.match(/^\s*(\d+)\s*[-|]\s*(\d+)\s*$/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}`;

  const values = Array.from(score.matchAll(/\b\d+\b/g)).map((match) => match[0]);
  if (values.length >= 2) return `${values[values.length - 2]}-${values[values.length - 1]}`;

  return null;
}

function getCompletedSignalResultCard(row: SignalDetectedRow) {
  const displayStatus = getSignalDisplayStatus(row);
  const resultBadge = getSignalViewAllResultBadge(displayStatus);
  const compactScore = formatCompactSignalScore(row.liveScore);
  if (!resultBadge) return null;
  if (displayStatus !== "CANCELLED" && !compactScore) return null;

  return {
    ...resultBadge,
    score: compactScore,
  };
}

function getSignalDisplayStatus(row: SignalDetectedRow) {
  const liveStatus = row.liveStatus?.trim().toUpperCase();
  if (liveStatus) return liveStatus;

  const normalized = row.status?.trim().toUpperCase();
  if (["WON", "LOST", "PUSH", "LIVE", "FINAL", "CANCELLED"].includes(normalized)) return normalized;

  return "PENDING";
}

function getSignalStatusClasses(status: string) {
  const normalized = status.toUpperCase();

  if (normalized === "LIVE") return "border-emerald-300/45 bg-emerald-400/10 text-emerald-200";
  if (normalized === "FINAL" || normalized === "CANCELLED") return "border-white/22 bg-white/8 text-white/70";
  if (normalized === "WON" || normalized === "LOST" || normalized === "PUSH") return "border-white/20 bg-white/8 text-white/78";

  return "border-cyan-300/45 bg-cyan-300/10 text-cyan-200";
}

function getSignalPrimaryTimeLabel(row: SignalDetectedRow) {
  const status = getSignalDisplayStatus(row);

  if (status === "LIVE" || status === "FINAL" || status === "WON" || status === "LOST" || status === "PUSH") {
    return row.displayTime || row.time;
  }

  return row.displayTime || row.time;
}

function getSignalSecondaryTimeLabel(row: SignalDetectedRow) {
  const status = getSignalDisplayStatus(row);

  if (status === "LIVE") return row.liveDetail || "Live";
  if (status === "FINAL" || status === "WON" || status === "LOST" || status === "PUSH") return row.liveDetail;

  return null;
}

function formatCountdown(minutes?: number | null) {
  if (minutes === null || minutes === undefined || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
}

function normalizeStatus(status?: string) {
  const value = (status ?? "scanning").toLowerCase();
  if (value === "closed") return "locked";
  if (value === "offseason") return "off_season";
  return value;
}

function getTopPlayStatusLabel(status?: string) {
  switch (normalizeStatus(status)) {
    case "validating":
      return "Market Analysis";
    case "strong_candidate":
      return "Strong Candidate";
    case "final_review":
      return "Final Review";
    case "available_now":
      return "Available Now";
    case "locked":
      return "Closed";
    case "no_play":
      return "No Play";
    default:
      return "Market Scan";
  }
}

function getSportStatusLabel(status?: string) {
  switch (normalizeStatus(status)) {
    case "validating":
      return "Analyzing Market";
    case "strong_candidate":
      return "Strong Candidate";
    case "final_review":
      return "Final Review";
    case "available_now":
      return "Available Now";
    case "locked":
      return "Closed Today";
    case "no_play":
      return "No Signal Today";
    case "off_season":
    case "unavailable":
      return "OFF SEASON";
    default:
      return "Scanning Market";
  }
}

function getVisualProgress(status?: string, backendProgress?: number) {
  const mapped = (() => {
    switch (normalizeStatus(status)) {
      case "scanning":
        return 10;
      case "validating":
        return 35;
      case "strong_candidate":
        return 60;
      case "final_review":
        return 85;
      case "available_now":
      case "locked":
      case "no_play":
      case "off_season":
      case "unavailable":
        return 100;
      default:
        return Number.isFinite(backendProgress) ? Number(backendProgress) : 10;
    }
  })();

  return Math.max(0, Math.min(100, Math.round(mapped)));
}

function formatOdds(odds?: number | null) {
  if (odds === null || odds === undefined || Number.isNaN(Number(odds))) return "";
  return `${Number(odds) > 0 ? "+" : ""}${odds}`;
}

function formatSignalPickWithOdds(row: SignalDetectedRow) {
  const pick = compactSignalPickLabel(row.pick);
  const odds = formatOdds(row.odds);
  if (!odds || pick.includes(odds)) return pick;
  return `${pick} ${odds}`;
}

function formatPickMeta(data?: SignalsHomePrecisionResponse | null) {
  const parts = [
    data?.pick?.market,
    data?.pick?.line === null || data?.pick?.line === undefined ? null : String(data.pick.line),
    formatOdds(data?.pick?.odds),
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : null;
}

function hasRevealAccess(data?: SignalsHomePrecisionResponse | null) {
  return Boolean(data?.admin || (data?.purchased && data?.canRevealPick));
}

function isClosed(data?: SignalsHomePrecisionResponse | null) {
  return (
    normalizeStatus(data?.status) === "locked" ||
    (data?.minutesToKickoff !== null &&
      data?.minutesToKickoff !== undefined &&
      data.minutesToKickoff <= 0)
  );
}

function buildTopPlayViewModel(data?: SignalsHomePrecisionResponse | null): TopPlayViewModel {
  const status = normalizeStatus(data?.status);
  const canReveal = hasRevealAccess(data);
  const closed = isClosed(data);
  const available = Boolean(
    data?.availableForPurchase ||
      data?.canPurchase ||
      status === "available_now"
  );

  if (canReveal) {
    return {
      status: "Available Now",
      progressPercent: 100,
      helperText: "Unlocked for today",
      actionLabel: "View Pick",
      actionTone: "view",
      pickLabel: data?.pick?.pickLabel ?? "Top Play unlocked",
      pickMeta: formatPickMeta(data),
    };
  }

  if (status === "no_play") {
    return {
      status: "No Play",
      progressPercent: 100,
      helperText: "No Top Play Today",
      actionLabel: "No Play",
      actionTone: "closed",
    };
  }

  if (closed) {
    return {
      status: "Closed",
      progressPercent: 100,
      helperText: "Today's Top Play Closed",
      actionLabel: "Closed",
      actionTone: "closed",
    };
  }

  if (available) {
    return {
      status: "Available Now",
      progressPercent: 100,
      helperText: "$149.99 / day",
      actionLabel: "Unlock",
      actionTone: "unlock",
    };
  }

  return {
    status: getTopPlayStatusLabel(status),
    progressPercent: getVisualProgress(status, data?.progressPercent),
    helperText: formatCountdown(data?.minutesToRelease) || "Coming Soon",
    actionLabel: "Notify Me",
    actionTone: "notify",
  };
}

function buildSportSignalViewModel(
  sport: SportCode,
  data?: SignalsHomePrecisionResponse | null,
): SportSignalViewModel {
  const status = normalizeStatus(data?.status);
  const canReveal = hasRevealAccess(data);
  const closed = isClosed(data);
  const available = Boolean(
    data?.availableForPurchase ||
      data?.canPurchase ||
      status === "available_now"
  );

  if (canReveal) {
    return {
      sport,
      status: "Available Now",
      progressPercent: 100,
      helperText: "Unlocked",
      actionLabel: "View Pick",
      actionTone: "view",
      pickLabel: data?.pick?.pickLabel ?? "Unlocked",
      pickMeta: formatPickMeta(data),
    };
  }

  if (status === "no_play") {
    return {
      sport,
      status: "No Signal Today",
      progressPercent: 100,
      helperText: "No Signal",
      actionLabel: "No Signal",
      actionTone: "closed",
    };
  }

  if (status === "off_season" || status === "unavailable") {
    return {
      sport,
      status: "OFF SEASON",
      progressPercent: 100,
      helperText: "Off Season",
      actionLabel: "Off",
      actionTone: "closed",
    };
  }

  if (closed) {
    return {
      sport,
      status: "Closed Today",
      progressPercent: 100,
      helperText: "Closed",
      actionLabel: "Closed",
      actionTone: "closed",
    };
  }

  if (available) {
    return {
      sport,
      status: "Available Now",
      progressPercent: 100,
      helperText: "$24.99 / day",
      actionLabel: "Unlock",
      actionTone: "unlock",
    };
  }

  return {
    sport,
    status: getSportStatusLabel(status),
    progressPercent: getVisualProgress(status, data?.progressPercent),
    helperText: formatCountdown(data?.minutesToRelease) || "Coming Soon",
    actionLabel: "Notify Me",
    actionTone: "notify",
  };
}

function isActiveSportSignalView(signal: SportSignalViewModel) {
  if (signal.actionTone === "view" || signal.actionTone === "unlock") return true;
  if (signal.actionTone === "closed") return false;

  const status = signal.status.toLowerCase();
  const helper = signal.helperText.toLowerCase();

  if (
    status.includes("off season") ||
    status.includes("no signal") ||
    status.includes("closed") ||
    helper.includes("off season") ||
    helper.includes("no signal") ||
    helper.includes("closed")
  ) {
    return false;
  }

  return signal.progressPercent > 0;
}

function orderSportSignalViews(signals: SportSignalViewModel[]) {
  return [...signals].sort((first, second) => {
    const firstActive = isActiveSportSignalView(first);
    const secondActive = isActiveSportSignalView(second);

    if (firstActive !== secondActive) return firstActive ? -1 : 1;

    return sports.indexOf(first.sport) - sports.indexOf(second.sport);
  });
}

function CalendarBadge({
  value,
  onChange,
}: {
  value: string;
  onChange?: (date: string) => void;
}) {
  const month = formatCalendarMonth(value);
  const day = formatCalendarDay(value);

  return (
    <label className="relative grid h-[68px] w-[56px] place-items-center overflow-hidden rounded-[18px] border border-cyan-300/22 bg-cyan-950/18 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
      <input
        type="date"
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange?.(event.target.value);
        }}
        aria-label="Select board date"
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
          {month}
        </p>
        <p className="mt-1 text-[28px] font-black leading-none text-white">
          {day}
        </p>
      </div>
    </label>
  );
}

function OpportunitySkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-[112px] rounded-[20px] bg-white/[0.055]" />
      <div className="grid grid-cols-5 gap-1.5">
        {sports.map((sport) => (
          <div key={`skeleton-${sport}`} className="h-[126px] rounded-[15px] bg-white/[0.055]" />
        ))}
      </div>
    </div>
  );
}

function SignalsModeSwitch({
  mode,
  onChange,
}: {
  mode: SignalsContentMode;
  onChange: (mode: SignalsContentMode) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 rounded-[13px] border border-white/10 bg-[#080b18]/92 p-[2px] shadow-[0_0_18px_rgba(34,211,238,0.08)] backdrop-blur-md"
      role="tablist"
      aria-label="Signals view mode"
    >
      {(["signals", "live"] as SignalsContentMode[]).map((item) => {
        const active = mode === item;

        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item)}
            className={`h-7 rounded-[10px] text-[12px] font-black transition ${
              active
                ? "bg-cyan-300 text-black shadow-[0_0_18px_rgba(34,211,238,0.26)]"
                : "text-white/58 hover:text-white"
            }`}
          >
            {item === "signals" ? "Signals" : "Scores"}
          </button>
        );
      })}
    </div>
  );
}

function SignalsContent({ children }: { children: ReactNode }) {
  return <div className="mt-2 space-y-2">{children}</div>;
}

const frameSportHotspots: Array<{ sport: SelectedSport; label: string; left: string; width: string }> = [
  { sport: "all", label: "TOP", left: "3.3%", width: "13.5%" },
  { sport: "baseball", label: "Baseball", left: "18.7%", width: "13.7%" },
  { sport: "basketball", label: "Basketball", left: "34.1%", width: "13.8%" },
  { sport: "ice_hockey", label: "Hockey", left: "49.5%", width: "13.8%" },
  { sport: "football", label: "Football", left: "64.8%", width: "13.7%" },
  { sport: "soccer", label: "Soccer", left: "80.2%", width: "13.6%" },
];

const frameSportMeta: Record<SportCode, { title: string; color: string; glow: string }> = {
  MLB: { title: "BASEBALL", color: "#22d3ee", glow: "rgba(34,211,238,0.10)" },
  NBA: { title: "BASKETBALL", color: "#22d3ee", glow: "rgba(34,211,238,0.10)" },
  NFL: { title: "FOOTBALL", color: "#22d3ee", glow: "rgba(34,211,238,0.10)" },
  NHL: { title: "HOCKEY", color: "#22d3ee", glow: "rgba(34,211,238,0.10)" },
  SOCCER: { title: "SOCCER", color: "#22d3ee", glow: "rgba(34,211,238,0.10)" },
};

function getSportCompetitionLabel(sport: SportCode) {
  return frameSportMeta[sport]?.title ?? sport;
}

function SignalsFrameHotspots({
  onSelectSport,
  onHowItWorks,
  onNavigate,
}: {
  onSelectSport: (sport: SelectedSport) => void;
  onHowItWorks: () => void;
  onNavigate?: (section: SignalsHomeNavSection) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <button
        type="button"
        aria-label="Open My Atlas"
        onClick={() => onNavigate?.("alerts")}
        className="pointer-events-auto absolute right-[29.5%] top-[2.1%] h-[4.6%] w-[9%] rounded-2xl"
      />
      <button
        type="button"
        aria-label="Open My Atlas"
        onClick={() => onNavigate?.("more")}
        className="pointer-events-auto absolute right-[4.2%] top-[2.0%] h-[4.9%] w-[22.5%] rounded-2xl"
      />
      <button
        type="button"
        aria-label="How Atlas Signals works"
        onClick={onHowItWorks}
        className="pointer-events-auto absolute right-[4.0%] top-[13.0%] h-[4.7%] w-[29.8%] rounded-2xl"
      />
      {frameSportHotspots.map((item) => (
        <button
          key={item.sport}
          type="button"
          aria-label={item.label}
          onClick={() => onSelectSport(item.sport)}
          className="pointer-events-auto absolute top-[18.1%] h-[5.5%] rounded-2xl"
          style={{ left: item.left, width: item.width }}
        />
      ))}
    </div>
  );
}

function FrameTopActions({
  onHowItWorks,
  onNavigate,
  activeDate,
  onDateChange,
}: {
  onHowItWorks: () => void;
  onNavigate?: (section: SignalsHomeNavSection) => void;
  activeDate: string;
  onDateChange?: (date: string) => void;
}) {
  const month = formatCalendarMonth(activeDate);
  const day = formatCalendarDay(activeDate);
  const boardLabel = getDateBoardLabel(activeDate);

  return (
    <>
      <div className="pointer-events-auto absolute right-[3.4%] top-[2.4%] z-50 flex items-center gap-1.5">
        <label
          aria-label={`Select ${boardLabel} date ${month} ${day}`}
          className="relative grid h-[34px] w-[34px] cursor-pointer place-items-center overflow-hidden rounded-[10px] border border-cyan-300/30 bg-[#061526]/80 text-center shadow-[0_0_12px_rgba(34,211,238,0.08)] backdrop-blur-md"
        >
          <input
            type="date"
            value={activeDate}
            onChange={(event) => {
              if (event.target.value) onDateChange?.(event.target.value);
            }}
            aria-label="Select board date"
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <span className="block text-[6.5px] font-black uppercase tracking-[0.10em] text-cyan-300">{month}</span>
          <span className="-mt-1 block text-[16px] font-black leading-none text-white">{day}</span>
        </label>
        <button
          type="button"
          onClick={() => onNavigate?.("more")}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-amber-400/75 bg-black/36 px-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-[0_0_12px_rgba(217,145,18,0.08)] backdrop-blur-md"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Join
        </button>
      </div>
      <button
        type="button"
        onClick={onHowItWorks}
        className="pointer-events-auto absolute right-[3.4%] top-[13.65%] z-50 inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-cyan-300/55 bg-black/34 px-2.5 text-[9px] font-black text-white shadow-[0_0_12px_rgba(34,211,238,0.08)] backdrop-blur-md"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-cyan-200" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        How It Works
      </button>
    </>
  );
}

function FrameSportSelectorRow({
  selectedSport,
  onSelectSport,
}: {
  selectedSport: SelectedSport;
  onSelectSport: (sport: SelectedSport) => void;
}) {
  return (
    <OfficialSportSelectorRow
      selectedSport={selectedSport}
      onSelectSport={(sport) => onSelectSport(sport as SelectedSport)}
      className="absolute left-[3.1%] right-[3.1%] top-[18.6%] z-40"
    />
  );
}

function FrameSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="pb-0.5 pt-1.5 text-[12.5px] font-black uppercase tracking-[0.16em] text-cyan-300">{children}</h2>;
}

function FrameTopPlayCard({
  data,
  onOpen,
  onAction,
}: {
  data: TopPlayViewModel;
  onOpen: () => void;
  onAction: () => void;
}) {
  const progress = Math.max(0, Math.min(100, data.progressPercent || 0));
  const actionLabel = data.actionTone === "view" ? "VIEW" : "UNLOCK";

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="atlas-top-play-card relative grid min-h-[76px] grid-cols-[46px_minmax(0,1fr)_94px] items-center gap-1.5 overflow-hidden rounded-[16px] border border-amber-300/95 bg-[radial-gradient(circle_at_12%_45%,rgba(245,158,11,0.18),rgba(2,7,19,0.84)_39%),linear-gradient(180deg,rgba(10,20,34,0.94),rgba(3,8,20,0.97))] px-2.5 py-2 shadow-[0_0_24px_rgba(245,158,11,0.24),inset_0_0_24px_rgba(245,158,11,0.05)]"
    >
      <div className="atlas-top-play-trophy grid h-10 w-10 place-items-center rounded-full border border-amber-300/80 bg-amber-400/10 shadow-[0_0_24px_rgba(250,204,21,0.42),inset_0_0_16px_rgba(250,204,21,0.12)]">
        <TrophyIcon className="h-8 w-8 drop-shadow-[0_0_10px_rgba(250,204,21,0.70)]" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[17px] font-black uppercase tracking-[-0.02em] text-white">TOP PLAY</p>
          <span className="rounded-full bg-cyan-400/13 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-300">
            ALL SPORTS
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-white/78">Atlas is comparing every sport</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#facc15,#f59e0b,#fde68a)] shadow-[0_0_14px_rgba(250,204,21,0.55)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-8 text-right text-[15px] font-black text-amber-300">{progress}%</span>
        </div>
      </div>
      <div className="flex h-full flex-col justify-center border-l border-white/14 pl-2">
        <p className="truncate text-[12px] font-black text-amber-300">{data.status || "Market Scan"}</p>
        <p className="mt-1 truncate whitespace-nowrap text-[9px] font-semibold text-white/62">
          {data.helperText || "Coming Soon"}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          className="atlas-unlock-cta mt-1.5 inline-flex h-7 items-center justify-center rounded-[10px] border border-[#c8911d]/90 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-[#d7a12a]"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

function FrameTopSignalCard({
  signal,
  active,
  onOpen,
  onAction,
}: {
  signal: SportSignalViewModel;
  active: boolean;
  onOpen: (sport: SportCode) => void;
  onAction: (sport: SportCode) => void;
}) {
  const meta = frameSportMeta[signal.sport];
  const progress = Math.max(0, Math.min(100, signal.progressPercent || 0));
  const cta =
    signal.actionTone === "view"
      ? "VIEW"
      : signal.actionTone === "closed"
        ? signal.actionLabel.toUpperCase()
        : "UNLOCK";
  const borderColor = active ? meta.color : "rgba(148,163,184,0.36)";
  const accentColor = active ? meta.color : "rgba(226,232,240,0.62)";
  const glow = active ? meta.glow : "rgba(148,163,184,0.04)";
  const disabled = signal.actionTone === "closed";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(signal.sport)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(signal.sport);
      }}
      className={`min-h-[104px] rounded-[12px] border bg-[linear-gradient(180deg,rgba(8,18,32,0.92),rgba(3,8,20,0.96))] px-1 py-1 text-center shadow-[0_0_8px_var(--sport-glow)] ${
        active ? "" : "opacity-75 saturate-[0.55]"
      }`}
      style={{ borderColor, "--sport-glow": glow } as CSSProperties}
    >
      <p className="truncate text-[8px] font-black uppercase tracking-[-0.04em] text-white">{meta.title}</p>
      <div className="mx-auto mt-0.5 h-10 w-10 text-white drop-shadow-[0_0_7px_rgba(255,255,255,0.10)]">
        <SportLineIcon sport={signal.sport} className="h-full w-full" />
      </div>
      <p className="mt-1 text-[9.5px] font-black" style={{ color: accentColor }}>Top Signal</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <div className="h-1.5 w-8 overflow-hidden rounded-full bg-white/12">
          <div
            className="h-full rounded-full shadow-[0_0_10px_currentColor] transition-[width] duration-300"
            style={{ width: `${progress}%`, backgroundColor: accentColor, color: accentColor }}
          />
        </div>
        <span className="text-[8.5px] font-black" style={{ color: accentColor }}>{progress}%</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          onAction(signal.sport);
        }}
        className="atlas-unlock-cta atlas-unlock-cta-compact mt-1 h-[18px] w-full rounded-[8px] border text-[7px] font-black uppercase tracking-[0.03em] disabled:cursor-default disabled:opacity-70"
        style={{ borderColor, color: accentColor }}
      >
        {cta}
      </button>
    </article>
  );
}

function FrameSignalInfoBar() {
  return (
    <div className="grid min-h-[35px] grid-cols-[minmax(0,1.1fr)_1px_minmax(0,0.9fr)] items-center overflow-hidden rounded-[18px] border border-white/16 bg-[linear-gradient(180deg,rgba(8,18,33,0.64),rgba(2,7,19,0.72))] px-2 text-[clamp(7.2px,2vw,8.5px)] font-semibold leading-none tracking-[-0.065em] text-white/78 shadow-[0_0_18px_rgba(0,213,255,0.04),inset_0_0_16px_rgba(255,255,255,0.015)]">
      <div className="flex min-w-0 items-center justify-start gap-1 pr-1.5">
        <span className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border border-cyan-300/80 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.13)]">
          <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 7h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 whitespace-nowrap">Top Signal releases 1 hour before each game</span>
      </div>
      <div className="h-[22px] w-px shrink-0 bg-white/24" />
      <div className="flex min-w-0 items-center justify-start gap-1 pl-2">
        <span className="grid h-[19px] w-[19px] shrink-0 place-items-center text-white/68">
          <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 whitespace-nowrap">Picks remain locked after kickoff</span>
      </div>
    </div>
  );
}

function ActivityMetricIcon({ index, className = "" }: { index: number; className?: string }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="0.85" opacity="0.35" />
        <circle cx="12" cy="12" r="6.2" stroke="currentColor" strokeWidth="0.9" opacity="0.52" />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="0.85" opacity="0.42" />
        <path d="M12 12 18.2 5.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.9" />
        <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.55" />
        <path d="M12 12h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="18.2" cy="5.8" r="1.6" fill="currentColor" />
        <circle cx="18.2" cy="5.8" r="2.8" stroke="currentColor" strokeWidth="0.6" opacity="0.32" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M12 3.6 18.1 6v5.4c0 3.8-2.2 6.6-6.1 8.1-3.9-1.5-6.1-4.3-6.1-8.1V6L12 3.6Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
        <path d="M12 6.2 16 7.8v3.4c0 2.6-1.3 4.6-4 5.9-2.7-1.3-4-3.3-4-5.9V7.8l4-1.6Z" fill="currentColor" opacity="0.12" />
        <circle cx="11.2" cy="11.3" r="3" stroke="currentColor" strokeWidth="1.55" />
        <path d="m13.4 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M8.7 6.9 12 5.7l3.3 1.2" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" opacity="0.52" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M5.2 18.6V12.4M10.6 18.6V9.9M16 18.6V6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M4.3 16.5 9 11.7l4.1 2.4 6.7-7.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.3 6.9h3.5v3.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.2 18.6h13.6" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.42" />
        <rect x="4.2" y="14.2" width="2" height="4.4" rx="0.8" fill="currentColor" opacity="0.12" />
        <rect x="9.6" y="11.2" width="2" height="7.4" rx="0.8" fill="currentColor" opacity="0.12" />
        <rect x="15" y="8.1" width="2" height="10.5" rx="0.8" fill="currentColor" opacity="0.12" />
      </svg>
    );
  }

  if (index === 3) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.45" />
        <circle cx="12" cy="12" r="3.8" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
        <path d="m9.1 12.1 1.9 1.9 4.1-4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.8 7.8 6.6 6.6M16.2 7.8l1.2-1.2M7.8 16.2l-1.2 1.2M16.2 16.2l1.2 1.2" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.46" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M7.8 4.4h8.4v3.3a4.2 4.2 0 0 1-8.4 0V4.4Z" fill="currentColor" opacity="0.12" />
      <path d="M7.8 4.4h8.4v3.3a4.2 4.2 0 0 1-8.4 0V4.4Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <path d="M7.8 6.4H5.1a3.1 3.1 0 0 0 3.1 4.8M16.2 6.4h2.7a3.1 3.1 0 0 1-3.1 4.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M12 11.6v4.3M8.9 20h6.2M10 15.9h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path d="m12 6.65.68 1.36 1.5.22-1.08 1.05.26 1.49L12 10.06l-1.36.71.26-1.49-1.08-1.05 1.5-.22L12 6.65Z" fill="currentColor" />
      <path d="M16.4 3.8 17.2 3M17.7 5.4h1.2M15.7 5.1l.8.8" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function FrameTodayActivityCard({ metrics }: { metrics: ActivityMetric[] }) {
  const [lastUpdateLabel, setLastUpdateLabel] = useState<string | null>(null);
  const stageStyles = [
    {
      state: "SCANNING",
      text: "text-lime-300",
      border: "border-lime-300/55",
      bg: "bg-lime-300/[0.08]",
      glow: "shadow-[0_0_18px_rgba(163,230,53,0.26),inset_0_0_16px_rgba(163,230,53,0.08)]",
      line: "from-lime-300/20 via-lime-300/55 to-cyan-300/25",
    },
    {
      state: "REVIEWING",
      text: "text-cyan-300",
      border: "border-cyan-300/55",
      bg: "bg-cyan-300/[0.08]",
      glow: "shadow-[0_0_18px_rgba(34,211,238,0.26),inset_0_0_16px_rgba(34,211,238,0.08)]",
      line: "from-cyan-300/20 via-cyan-300/55 to-blue-400/25",
    },
    {
      state: "ANALYZING",
      text: "text-blue-300",
      border: "border-blue-300/55",
      bg: "bg-blue-300/[0.08]",
      glow: "shadow-[0_0_18px_rgba(96,165,250,0.26),inset_0_0_16px_rgba(96,165,250,0.08)]",
      line: "from-blue-300/20 via-blue-300/55 to-violet-300/25",
    },
    {
      state: "WAITING",
      text: "text-violet-300",
      border: "border-violet-300/55",
      bg: "bg-violet-300/[0.08]",
      glow: "shadow-[0_0_18px_rgba(196,181,253,0.26),inset_0_0_16px_rgba(196,181,253,0.08)]",
      line: "from-violet-300/20 via-violet-300/55 to-amber-300/25",
    },
    {
      state: "READY",
      text: "text-amber-300",
      border: "border-amber-300/55",
      bg: "bg-amber-300/[0.08]",
      glow: "shadow-[0_0_18px_rgba(252,211,77,0.28),inset_0_0_16px_rgba(252,211,77,0.08)]",
      line: "",
    },
  ];

  useEffect(() => {
    setLastUpdateLabel(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date()),
    );
  }, []);

  return (
    <section className="rounded-[17px] border border-white/14 bg-[radial-gradient(circle_at_top_left,rgba(0,213,255,0.08),transparent_36%),linear-gradient(180deg,rgba(6,18,31,0.92),rgba(3,8,20,0.96))] px-3 py-1.5 shadow-[0_0_18px_rgba(0,213,255,0.06)]">
      <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-cyan-300">TODAY&apos;S ACTIVITY</h2>
      <div className="relative mt-1.5 grid grid-cols-5 text-center">
        {metrics.map((metric, index) => {
          const style = stageStyles[index] ?? stageStyles[1];
          const value = Number(metric.value);
          const active = Number.isFinite(value) && value > 0;
          const nextValue = Number(metrics[index + 1]?.value ?? 0);
          const nextActive = Number.isFinite(nextValue) && nextValue > 0;

          return (
            <div key={metric.label} className="relative px-1">
              {index < metrics.length - 1 ? (
                <span
                  className={`absolute left-[58%] right-[-42%] top-[16px] h-px bg-gradient-to-r ${style.line} ${
                    active || nextActive ? "opacity-85 shadow-[0_0_8px_currentColor]" : "opacity-28"
                  }`}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={`relative z-10 mx-auto grid h-8 w-8 place-items-center rounded-full border bg-[radial-gradient(circle_at_34%_22%,rgba(255,255,255,0.20),rgba(255,255,255,0.05)_18%,rgba(6,16,29,0.94)_48%,rgba(1,6,16,0.99))] ${style.border} before:absolute before:inset-[3px] before:rounded-full before:border before:border-white/[0.055] before:content-[''] after:absolute after:left-[8px] after:top-[5px] after:h-[4px] after:w-[10px] after:rounded-full after:bg-white/14 after:blur-[1px] after:content-[''] ${
                  active ? `${style.glow} motion-safe:animate-pulse` : "shadow-[0_0_8px_rgba(148,163,184,0.08),inset_0_0_10px_rgba(255,255,255,0.035)] opacity-72"
                }`}
              >
                <ActivityMetricIcon className={`h-[18px] w-[18px] ${style.text}`} index={index} />
              </span>
              <p key={`${metric.label}-${metric.value}`} className="mt-1 text-[24px] font-black leading-none tracking-[-0.055em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.12)]">
                {metric.value}
              </p>
              <p className="mt-0.5 min-h-[19px] text-[7.5px] font-semibold leading-tight text-white/66">{metric.label}</p>
              <span className={`mt-0.5 inline-flex max-w-full items-center justify-center rounded-full border px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[0.08em] ${style.border} ${style.bg} ${active ? style.text : "text-white/38"}`}>
                {active ? style.state : "IDLE"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-end">
        <p className="text-[7px] font-black uppercase tracking-[0.14em] text-white/34">
          Last Update <span className="text-cyan-300/70">{lastUpdateLabel ?? "Live"}</span>
        </p>
      </div>
    </section>
  );
}

function FrameSignalDetectedFeed({
  rows,
  count,
  loading,
  errorMessage,
  onRetry,
  onRowOpen,
  onViewAll,
  completedMode = false,
  sportsActiveCount = 0,
  gamesTrackedCount = 0,
  upcomingGamesCount = 0,
}: {
  rows: SignalDetectedRow[];
  count: number;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onRowOpen: (row: SignalDetectedRow) => void;
  onViewAll?: () => void;
  completedMode?: boolean;
  sportsActiveCount?: number;
  gamesTrackedCount?: number;
  upcomingGamesCount?: number;
}) {
  const visibleRows = sortSignalsByStartTime(rows).slice(0, 5);
  const headerTitle = completedMode ? "TODAY'S COMPLETED SIGNALS" : "SIGNAL DETECTED";

  return (
    <section className="relative isolate overflow-hidden rounded-[17px] border border-white/14 bg-[linear-gradient(180deg,rgba(6,18,31,0.86),rgba(3,8,20,0.92))]">
      <div className="relative z-20 flex items-center justify-between gap-2 border-b border-white/10 bg-[rgba(5,12,24,0.94)] px-3 py-2.5 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-[14px] font-black uppercase tracking-[0.18em] text-cyan-300">{headerTitle}</h2>
          <span className="truncate rounded-full bg-cyan-400/12 px-2.5 py-1 text-[9.5px] font-black text-cyan-300">All • {count} Signals</span>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="atlas-view-all-cta inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/16 bg-white/8 px-3 py-1 text-[11px] font-bold text-white/86"
        >
          View All <span className="text-lg leading-none">›</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-0 px-3 py-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`frame-signal-loading-${index}`} className="h-[56px] animate-pulse border-b border-white/8 bg-white/[0.025] last:border-b-0" />
          ))}
        </div>
      ) : errorMessage ? (
        <div className="p-4 text-sm text-white/70">
          <p className="font-black text-white">Unable to load market data.</p>
          <p className="mt-1">Please try again.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-black text-cyan-300">
              Retry
            </button>
          ) : null}
        </div>
      ) : visibleRows.length ? (
        <div className="relative z-10 bg-[rgba(3,8,20,0.42)]">
          {visibleRows.map((row) => {
            const label = getSportCompetitionLabel(row.sport);
            const displayStatus = getSignalDisplayStatus(row);
            const completedResult = getCompletedSignalResultCard(row);
            const primaryTime = getSignalPrimaryTimeLabel(row);
            const secondaryTime = getSignalSecondaryTimeLabel(row);

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onRowOpen(row)}
                className={`grid min-h-[60px] w-full grid-cols-[74px_minmax(0,1fr)_92px_20px] items-center gap-2 border-b border-white/10 px-3 py-1.5 text-left last:border-b-0 ${completedResult?.cardClassName ?? ""}`}
              >
                <div className="grid place-items-center gap-1">
                  <SignalTeamLogoStack row={row} />
                  <span className="max-w-[72px] truncate text-[8px] font-black uppercase tracking-[0.03em] text-white/58">
                    {label}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black text-white">{row.matchup}</p>
                  <p className="truncate text-[13px] font-semibold text-cyan-300">{formatSignalPickWithOdds(row)}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {completedResult ? (
                    <span className="flex flex-col items-end">
                      <span className="text-[7px] font-black uppercase tracking-[0.14em] text-white/45">Final</span>
                      {completedResult.score ? (
                        <span className="mt-0.5 whitespace-nowrap text-[18px] font-black leading-none text-white">
                          {completedResult.score}
                        </span>
                      ) : null}
                      <span className={`mt-1 inline-flex min-w-[62px] items-center justify-center gap-1 rounded-[9px] border px-2 py-1 text-[8px] font-black uppercase ${completedResult.badgeClassName}`}>
                        {completedResult.icon ? <span aria-hidden="true" className={completedResult.iconClassName}>{completedResult.icon}</span> : null}
                        <span>{completedResult.label}</span>
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className={`rounded-[9px] border px-2 py-1 text-[10px] font-black uppercase ${getSignalStatusClasses(displayStatus)}`}>
                        {displayStatus === "PENDING" ? "Pending" : displayStatus === "FINAL" ? "Pending" : displayStatus}
                      </span>
                      <span className="min-w-0 text-right">
                        <span className="block text-[11px] font-semibold leading-tight text-white/72">{primaryTime}</span>
                        {secondaryTime ? (
                          <span className="block text-[9px] font-black uppercase tracking-[0.08em] text-cyan-300/80">{secondaryTime}</span>
                        ) : null}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-2xl font-light text-white/70">›</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-4">
          <div className="rounded-[16px] border border-cyan-300/16 bg-cyan-300/[0.055] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">Today&apos;s Monitoring</p>
            <p className="mt-1 text-[13px] font-semibold text-white/74">Atlas is tracking the slate and will surface picks as they qualify.</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["Sports Active", String(Math.max(sportsActiveCount, 0))],
              ["Games Tracked", String(Math.max(gamesTrackedCount, 0))],
              ["Upcoming Games", String(Math.max(upcomingGamesCount, 0))],
              ["Engine Status", loading ? "Scanning" : "Monitoring"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-white/10 bg-white/[0.035] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/42">{label}</p>
                <p className="mt-1 text-[15px] font-black text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] font-semibold text-white/46">Last Update: Live</p>
        </div>
      )}
    </section>
  );
}

function LiveTeamMark({ name, sport }: { name: string; sport: SportCode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logoSrc = getLiveTeamLogoSrc(name, sport);
  const showLogo = logoSrc && failedSrc !== logoSrc;
  const markSizeClass = "h-8 w-8";
  const isSoccerFlag = sport === "SOCCER" && logoSrc?.includes("/team-logos/soccer/flags/");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (showLogo) {
    if (isSoccerFlag) {
      return (
        <span className={`grid ${markSizeClass} shrink-0 place-items-center`}>
          <span className="block h-7 w-7 overflow-hidden rounded-full shadow-[0_0_8px_rgba(255,255,255,0.18)]">
            <img
              src={logoSrc}
              alt=""
              className="block h-full w-full object-cover"
              onError={() => setFailedSrc(logoSrc)}
            />
          </span>
        </span>
      );
    }

    return (
      <span className={`grid ${markSizeClass} shrink-0 place-items-center`}>
        <img
          src={logoSrc}
          alt=""
          className={`${markSizeClass} object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.18)]`}
          onError={() => setFailedSrc(logoSrc)}
        />
      </span>
    );
  }

  return (
    <span className={`grid ${markSizeClass} shrink-0 place-items-center text-[9px] font-black text-white/70`}>
      {initials || "AT"}
    </span>
  );
}

function LiveContent({
  rows,
  loading,
  errorMessage,
  onRetry,
  onRowOpen,
}: {
  rows: SignalsLiveRow[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onRowOpen?: (row: SignalsLiveRow) => void;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, SignalsLiveRow[]>();

    rows.forEach((row) => {
      const key = row.leagueTitle || row.sport;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    });

    return Array.from(grouped.entries()).map(([title, groupRows]) => ({
      title,
      rows: groupRows,
    }));
  }, [rows]);

  if (loading) {
    return (
      <SignalsContent>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`signals-live-loading-${index}`} className="h-24 animate-pulse rounded-[18px] border border-white/10 bg-white/[0.05]" />
        ))}
      </SignalsContent>
    );
  }

  if (errorMessage) {
    return (
      <SignalsContent>
        <div className="rounded-[18px] border border-red-400/20 bg-red-950/50 p-5 text-center">
          <p className="text-[14px] font-black text-white">Unable to load live games.</p>
          <p className="mt-1 text-[12px] text-white/58">Please try again.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-full border border-red-200/25 px-4 py-2 text-[11px] font-black text-red-50"
            >
              Retry
            </button>
          ) : null}
        </div>
      </SignalsContent>
    );
  }

  if (!groups.length) {
    return (
      <SignalsContent>
        <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-5 text-center">
          <p className="text-[16px] font-black text-white">No live games available</p>
          <p className="mt-1 text-[12px] text-white/55">Atlas will update this board as games become available.</p>
        </div>
      </SignalsContent>
    );
  }

  return (
    <SignalsContent>
      {groups.map((group) => (
        <article
          key={`signals-live-${group.title}`}
          className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04]"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <p className="truncate text-[13px] font-black text-white">{group.title}</p>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white/55">
              {group.rows.length} games
            </span>
          </div>

          <div className="divide-y divide-white/10">
            {group.rows.map((row) => {
              const hasScore = row.awayScore !== "-" || row.homeScore !== "-";

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onRowOpen?.(row)}
                  className="block w-full px-3 py-3 text-left transition hover:bg-white/[0.035]"
                  aria-label={`Open ${row.awayTeam} vs ${row.homeTeam}`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_32px_82px_32px_minmax(0,1fr)] items-center gap-x-2">
                    <div className="min-w-0 text-right">
                      <span className="truncate text-right text-[13px] font-semibold text-white">
                        {row.awayTeam}
                      </span>
                    </div>
                    <LiveTeamMark name={row.awayTeam} sport={row.sport} />

                    <div className="text-center">
                      {row.statusLabel ? (
                        <p className={`truncate text-[9px] font-black ${hasScore ? "text-rose-300" : "text-cyan-300"}`}>
                          {row.statusLabel}
                        </p>
                      ) : null}
                      <p className={`${hasScore ? "text-[19px]" : "text-[15px]"} font-black leading-tight text-white`}>
                        {row.centerValue}
                      </p>
                    </div>

                    <LiveTeamMark name={row.homeTeam} sport={row.sport} />
                    <div className="min-w-0 text-left">
                      <span className="truncate text-[13px] font-semibold text-white">
                        {row.homeTeam}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <span className="rounded-full bg-black/55 px-2 py-1.5 text-center text-[10px] font-black text-white/82">
                      {row.awayOdds}
                    </span>
                    <span className="rounded-full bg-black/55 px-2 py-1.5 text-center text-[10px] font-black text-white/82">
                      {row.totalLabel}
                    </span>
                    <span className="rounded-full bg-black/55 px-2 py-1.5 text-center text-[10px] font-black text-white/82">
                      {row.homeOdds}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </SignalsContent>
  );
}

function HeaderBellIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 17H9m9-2v-4a6 6 0 0 0-12 0v4l-2 2h16l-2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

function HeaderUserIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21a8 8 0 0 0-16 0" strokeLinecap="round" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HeaderInfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" strokeLinecap="round" />
      <path d="M12 7h.01" strokeLinecap="round" />
    </svg>
  );
}

function SelectedSportIcon({ sport }: { sport: SelectedSport }) {
  if (sport === "all") {
    return (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" aria-hidden="true">
        <path
          d="m16 4 3.5 7.1 7.8 1.1-5.6 5.5 1.3 7.7-7-3.7-7 3.7 1.3-7.7-5.6-5.5 7.8-1.1L16 4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const sportCode = selectedSportToSportCode[sport];
  return <SportLineIcon sport={sportCode} className="h-9 w-9 opacity-95" alt="" />;
}

function TrophyIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-hidden="true">
      <path d="M19 14h18v6.5c0 6.6-3.6 11.4-9 12.4-5.4-1-9-5.8-9-12.4V14Z" fill="url(#selectedTrophyGradient)" stroke="#ffcf55" strokeWidth="1.4" />
      <path d="M19 18h-5c0 5 2.4 8.4 6.1 9.4M37 18h5c0 5-2.4 8.4-6.1 9.4M28 33v6M22 42h12M20 46h16" stroke="#ffcf55" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="selectedTrophyGradient" x1="18" y1="14" x2="38" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe58b" />
          <stop offset="0.45" stopColor="#ffb81c" />
          <stop offset="1" stopColor="#a86500" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const selectedSportOptions: Array<{ sport: SelectedSport; label: string }> = [
  { sport: "all", label: "TOP" },
  { sport: "baseball", label: "Baseball" },
  { sport: "basketball", label: "Basketball" },
  { sport: "ice_hockey", label: "Hockey" },
  { sport: "football", label: "Football" },
  { sport: "soccer", label: "Soccer" },
];

function SelectedSportSelector({
  selectedSport,
  onSelect,
}: {
  selectedSport: SelectedSport;
  onSelect: (sport: SelectedSport) => void;
}) {
  return (
    <div className="flex gap-2.5 overflow-x-auto px-3 pb-4 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {selectedSportOptions.map((option) => {
        const active = selectedSport === option.sport;

        return (
          <button
            key={option.sport}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option.sport)}
            className={`grid h-[86px] min-w-[78px] place-items-center rounded-[14px] border px-2 transition ${
              active
                ? "border-cyan-300 bg-cyan-400/8 text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.18)]"
                : "border-white/12 bg-white/[0.035] text-white/72"
            }`}
          >
            <span className={active ? "text-cyan-300" : "text-white/70"}>
              <SelectedSportIcon sport={option.sport} />
            </span>
            <span className="text-center text-[12px] font-bold leading-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SelectedSportTopSignalCard({
  sportLabel,
  progressPercent,
  actionLabel,
  disabled = false,
  onAction,
}: {
  sportLabel: string;
  progressPercent: number;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <section className="atlas-top-play-card relative grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)_76px] items-center gap-1.5 overflow-hidden rounded-[16px] border border-amber-300/95 bg-[radial-gradient(circle_at_12%_45%,rgba(245,158,11,0.18),rgba(2,7,19,0.84)_39%),linear-gradient(180deg,rgba(10,20,34,0.94),rgba(3,8,20,0.97))] px-2.5 py-2 shadow-[0_0_24px_rgba(245,158,11,0.24),inset_0_0_24px_rgba(245,158,11,0.05)]">
      <div className="atlas-top-play-trophy grid h-10 w-10 place-items-center rounded-full border border-amber-300/80 bg-amber-400/10 shadow-[0_0_24px_rgba(250,204,21,0.42),inset_0_0_16px_rgba(250,204,21,0.12)]">
          <TrophyIcon className="h-8 w-8 drop-shadow-[0_0_10px_rgba(250,204,21,0.70)]" />
        </div>

        <div className="min-w-0">
        <div className="min-w-0">
          <h2 className="whitespace-nowrap text-[clamp(10px,2.9vw,13px)] font-black uppercase tracking-[-0.08em] text-white">
            {sportLabel} Top Signal
          </h2>
        </div>
          <p className="mt-0.5 truncate text-[10.5px] font-semibold text-white/78">
            Best {sportLabel} Opportunity
          </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#facc15,#f59e0b,#fde68a)] shadow-[0_0_14px_rgba(250,204,21,0.55)] transition-[width] duration-300"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <span className="w-8 text-right text-[15px] font-black text-amber-300">{clampedProgress}%</span>
        </div>
      </div>

      <div className="flex h-full flex-col justify-center border-l border-white/14 pl-2">
        <p className="truncate text-[11px] font-black text-amber-300">One Time</p>
        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/68">Access</p>
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className={`atlas-unlock-cta mt-1.5 inline-flex h-7 items-center justify-center rounded-[10px] border px-2 text-[9px] font-black uppercase tracking-[0.08em] ${
            disabled
              ? "border-white/10 bg-white/[0.04] text-white/42 shadow-none"
              : "border-[#c8911d]/90 text-[#d7a12a]"
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

function getSelectedSportTopSignalActionLabel({
  signal,
  hasPrecisionData,
  hasSportRows,
  loading,
}: {
  signal?: SportSignalViewModel | null;
  hasPrecisionData: boolean;
  hasSportRows: boolean;
  loading: boolean;
}) {
  if (loading) return "Unlock";
  if (!hasPrecisionData && !hasSportRows) return "No Games Available";
  if (!signal) return "No Games Available";
  if (signal.actionTone === "view") return "View Pick";
  if (signal.actionTone === "unlock") return "Unlock";
  if (signal.actionTone === "notify") return "Unlock";
  if (signal.status === "No Signal Today") return "No Play";
  if (signal.status === "Closed Today") return "Closed";
  if (signal.status === "OFF SEASON") return "No Games Available";
  return "Closed";
}

function isSelectedSportTopSignalActionDisabled({
  signal,
  hasPrecisionData,
  hasSportRows,
  loading,
}: {
  signal?: SportSignalViewModel | null;
  hasPrecisionData: boolean;
  hasSportRows: boolean;
  loading: boolean;
}) {
  if (loading) return true;
  if (!hasPrecisionData && !hasSportRows) return true;
  if (!signal) return true;
  return signal.actionTone === "closed";
}

function formatSelectedSportTime(time: string) {
  return time.replace("AM", "a.m.").replace("PM", "p.m.");
}

function SelectedSportSignalRow({
  row,
  sport,
  onOpen,
}: {
  row: SignalDetectedRow;
  sport: SelectedSport;
  onOpen: () => void;
}) {
  const displayStatus = getSignalDisplayStatus(row);
  const completedResult = getCompletedSignalResultCard(row);
  const primaryTime = getSignalPrimaryTimeLabel(row);
  const secondaryTime = getSignalSecondaryTimeLabel(row);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`grid min-h-[66px] w-full grid-cols-[50px_56px_minmax(0,1fr)_68px_12px] items-center gap-2 rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,rgba(6,24,42,0.92),rgba(3,8,20,0.94))] px-2.5 text-left shadow-[inset_0_0_30px_rgba(34,211,238,0.03)] transition hover:border-cyan-300/25 ${completedResult?.cardClassName ?? ""}`}
    >
      <span className="grid place-items-center gap-1 border-r border-cyan-300/20 pr-3 text-cyan-300">
        <SignalTeamLogoStack row={row} size="compact" />
        <span className="text-[7px] font-black uppercase text-white">{selectedSportLabels[sport]}</span>
      </span>
      <span className="border-r border-cyan-300/20 pr-2 text-[11px] font-black leading-tight text-white">
        {completedResult ? (
          <>
            <span className="block text-[7px] uppercase tracking-[0.14em] text-white/45">Final</span>
            {completedResult.score ? (
              <span className="mt-0.5 block whitespace-nowrap text-[16px] leading-none text-white">{completedResult.score}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="block">{formatSelectedSportTime(primaryTime)}</span>
            {secondaryTime ? (
              <span className="mt-0.5 block text-[8px] uppercase tracking-[0.08em] text-cyan-300/75">{secondaryTime}</span>
            ) : null}
          </>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black text-white">{row.matchup}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-cyan-300">{formatSignalPickWithOdds(row)}</span>
      </span>
      <span className={`inline-flex min-h-[29px] min-w-[58px] items-center justify-center gap-1 justify-self-end rounded-[7px] border px-2 py-1.5 text-[8px] font-black uppercase ${completedResult ? completedResult.badgeClassName : getSignalStatusClasses(displayStatus)}`}>
        {completedResult ? (
          <>
            {completedResult.icon ? <span className={completedResult.iconClassName}>{completedResult.icon}</span> : null}
            <span>{completedResult.label}</span>
          </>
        ) : displayStatus === "PENDING" ? "Pending" : displayStatus === "FINAL" ? "Pending" : displayStatus}
      </span>
      <span className="text-lg font-light text-white">›</span>
    </button>
  );
}

function SelectedSportEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.035] px-5 py-8 text-center">
      <p className="text-lg font-black text-white">{title}</p>
      <p className="mt-2 text-sm text-white/58">{description}</p>
    </div>
  );
}

function SignalExplorerSheet({
  open,
  rows,
  loading,
  errorMessage,
  onRetry,
  onClose,
  onRowOpen,
}: {
  open: boolean;
  rows: SignalDetectedRow[];
  loading: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  onRowOpen: (row: SignalDetectedRow) => void;
}) {
  if (!open) return null;

  const orderedRows = sortSignalsByStartTime(rows);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Signal Detected Explorer"
      onClick={onClose}
    >
      <div
        className="max-h-[84vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-cyan-300/18 bg-[#050816] pb-5 shadow-[0_-18px_60px_rgba(34,211,238,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#050816] px-4 py-4 shadow-[0_10px_22px_rgba(5,8,22,0.92)]">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-cyan-300">
              Signal Detected
            </p>
            <p className="mt-1 text-sm text-white/58">All sports • {orderedRows.length} signals</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-lg font-black text-white/70"
            aria-label="Close Signal Detected Explorer"
          >
            ×
          </button>
        </div>

        <div className="px-3 py-3">
          {loading ? (
            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.025]">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`signal-explorer-loading-${index}`}
                  className="h-[64px] animate-pulse border-b border-white/8 bg-white/[0.025] last:border-b-0"
                />
              ))}
            </div>
          ) : errorMessage ? (
            <div className="rounded-[18px] border border-red-400/20 bg-red-950/30 p-4 text-sm text-white/70">
              <p className="font-black text-white">Unable to load market data.</p>
              <p className="mt-1">Please try again.</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-black text-cyan-300"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : orderedRows.length ? (
            <div className="relative z-0 isolate overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,18,31,0.82),rgba(3,8,20,0.94))]">
              {orderedRows.map((row) => {
                const displayStatus = getSignalDisplayStatus(row);
                const completedResult = getCompletedSignalResultCard(row);
                const primaryTime = getSignalPrimaryTimeLabel(row);
                const secondaryTime = getSignalSecondaryTimeLabel(row);

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onRowOpen(row);
                    }}
                    className={`grid min-h-[64px] w-full grid-cols-[60px_minmax(0,1fr)_92px_14px] items-center gap-2 border-b border-white/10 px-3 py-2 text-left last:border-b-0 ${completedResult?.cardClassName ?? ""}`}
                  >
                    <span className="grid place-items-center gap-1 text-cyan-300">
                      <SignalTeamLogoStack row={row} />
                      <span className="max-w-[58px] truncate text-[7.5px] font-black uppercase tracking-[0.03em] text-white/58">
                        {getSportCompetitionLabel(row.sport)}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-black text-white">{row.matchup}</span>
                      <span className="mt-0.5 block truncate text-[13px] font-semibold text-cyan-300">
                        {formatSignalPickWithOdds(row)}
                      </span>
                    </span>
                    {completedResult ? (
                      <span className="flex flex-col items-end justify-self-end">
                        <span className="text-[7px] font-black uppercase tracking-[0.14em] text-white/45">Final</span>
                        {completedResult.score ? (
                          <span className="mt-0.5 whitespace-nowrap text-[18px] font-black leading-none text-white">
                            {completedResult.score}
                          </span>
                        ) : null}
                        <span className={`mt-1 inline-flex min-w-[62px] items-center justify-center gap-1 rounded-[8px] border px-2 py-1 text-[8px] font-black uppercase ${completedResult.badgeClassName}`}>
                          {completedResult.icon ? <span aria-hidden="true" className={completedResult.iconClassName}>{completedResult.icon}</span> : null}
                          <span>{completedResult.label}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-self-end gap-2">
                        <span className={`rounded-[8px] border px-2 py-1 text-[9px] font-black uppercase ${getSignalStatusClasses(displayStatus)}`}>
                          {displayStatus === "PENDING" ? "Pending" : displayStatus === "FINAL" ? "Pending" : displayStatus}
                        </span>
                        <span className="text-right text-[10px] font-semibold leading-tight text-white/58">
                          <span className="block">{primaryTime}</span>
                          {secondaryTime ? (
                            <span className="block text-[8px] uppercase tracking-[0.08em] text-cyan-300/75">{secondaryTime}</span>
                          ) : null}
                        </span>
                      </span>
                    )}
                    <span className="text-xl font-light text-white/65">›</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border border-white/10 bg-white/[0.025] px-4 py-8 text-center">
              <p className="text-sm font-black text-white">No Signals Available Today.</p>
              <p className="mt-1 text-xs text-white/58">Check back when today&apos;s signals become available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type PricingPlanCode = "exclusive" | "premium" | "unlimited";

type PricingPlan = {
  code: PricingPlanCode;
  title: string;
  price: string;
  subtitle: string;
  featureTitle: string;
  featureSubtitle?: string;
  features: string[];
  cta: string;
  accent: "cyan" | "gold" | "purple";
  badge?: string;
};

const pricingPlans: PricingPlan[] = [
  {
    code: "exclusive",
    title: "Exclusive",
    price: "$34.99",
    subtitle: "All Available Sports",
    featureTitle: "Ranked Top 3",
    featureSubtitle: "Signals Detected",
    features: ["All Available Sports", "Top 3 Signals Detected", "Live Status Updates", "Progressive Delivery", "No Top Signal"],
    cta: "Get Exclusive",
    accent: "cyan",
  },
  {
    code: "premium",
    title: "Premium",
    price: "$59.99",
    subtitle: "Choose Your Sport",
    featureTitle: "Up to 5 Official",
    featureSubtitle: "Ranked Signals",
    features: ["Choose 1 Sport", "Up to 5 Official Signals", "Ranked Signals", "Live Status Updates", "No Top Signal"],
    cta: "Get Premium",
    accent: "gold",
    badge: "Most Popular",
  },
  {
    code: "unlimited",
    title: "Atlas Unlimited",
    price: "$99.99",
    subtitle: "Every Available Sport",
    featureTitle: "Up to 5 Official",
    featureSubtitle: "For Every Sport",
    features: ["All Available Sports", "Up to 5 Per Sport", "Ranked Signals", "Auto-Includes New Sports", "Live Status Updates"],
    cta: "Get Unlimited",
    accent: "purple",
  },
];

const pricingAccentStyles = {
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

function PricingIcon({ type, className = "" }: { type: "star" | "crown" | "diamond"; className?: string }) {
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

function PricingPacksSection({
  activeSports,
  selectedSport,
  onSelectedSportChange,
  onPlanSubscribe,
  onTopSignalAction,
  onTopPlayAction,
}: {
  activeSports: SportCode[];
  selectedSport: SportCode;
  onSelectedSportChange?: (sport: SportCode) => void;
  onPlanSubscribe?: (plan: PricingPlanCode, sport?: SportCode) => void;
  onTopSignalAction?: (sport: SportCode) => void;
  onTopPlayAction?: () => void;
}) {
  const sportsToShow = activeSports.length > 0 ? activeSports : (["MLB"] as SportCode[]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem("atlas_membership_open") === "1");
    } catch {
      setExpanded(false);
    }
  }, []);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;

      try {
        localStorage.setItem("atlas_membership_open", next ? "1" : "0");
      } catch {
        // The membership section still works if local storage is unavailable.
      }

      return next;
    });
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-cyan-300/24 bg-[#050816]/88 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="relative flex min-h-[66px] w-full items-center gap-3 overflow-hidden px-3 py-2 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-cyan-300/45 bg-cyan-300/10 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.18)]">
          <PricingIcon type="star" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black tracking-tight text-white">
            Atlas Membership
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold text-cyan-200/76">
            Choose your plan
          </span>
        </span>
        <span className="relative z-10 rounded-full border border-cyan-300/24 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-200">
          {expanded ? "Hide Plans ↑" : "View Plans ↓"}
        </span>
        <svg
          viewBox="0 0 64 64"
          className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rotate-[-12deg] text-amber-300/10"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 45h44l-4 10H14l-4-10Zm4-26 11 10 7-17 7 17 11-10 4 22H10l4-22Z" />
        </svg>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-white/10 p-1">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                Choose Your Plan
              </p>
              <p className="mt-0.5 text-[8.5px] font-semibold text-white/58">
                More clarity. Less risk. Better results.
              </p>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {pricingPlans.map((plan) => {
                const styles = pricingAccentStyles[plan.accent];
                const sportForPlan = plan.code === "unlimited" ? undefined : selectedSport;

                return (
                  <article
                    key={plan.code}
                    className={`relative flex min-h-[270px] min-w-0 flex-col rounded-[15px] border px-1.5 pb-1.5 pt-3.5 ${styles.shell}`}
                  >
                    {plan.badge ? (
                      <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-300 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.06em] text-black">
                        {plan.badge}
                      </span>
                    ) : null}

                    <div className="flex justify-center">
                      <span className={`grid h-9 w-9 place-items-center rounded-full border shadow-[0_0_12px_currentColor] ${styles.icon}`}>
                        <PricingIcon
                          type={plan.code === "premium" ? "crown" : plan.code === "unlimited" ? "diamond" : "star"}
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
                      {plan.featureSubtitle ? (
                        <p className={`mt-0.5 text-[8px] font-black leading-tight ${styles.text}`}>{plan.featureSubtitle}</p>
                      ) : null}
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
                        onClick={() => onPlanSubscribe?.(plan.code, sportForPlan)}
                        className={`mt-1.5 h-[29px] w-full rounded-[9px] border px-0.5 text-[8px] font-black uppercase tracking-[0.035em] ${styles.button}`}
                      >
                        {plan.cta}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {sportsToShow.length > 1 ? (
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sportsToShow.map((sport) => (
                  <button
                    key={`pricing-sport-${sport}`}
                    type="button"
                    onClick={() => onSelectedSportChange?.(sport)}
                    aria-pressed={selectedSport === sport}
                    className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.06em] ${
                      selectedSport === sport
                        ? "border-cyan-300 bg-cyan-300 text-black"
                        : "border-white/10 bg-white/[0.04] text-white/55"
                    }`}
                  >
                    {sport}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-1.5 rounded-[14px] border border-white/10 bg-black/20 p-1.5">
              <div className="mb-1.5 flex items-center justify-center gap-1.5">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/86">Premium Add-ons</p>
                <span className="text-[6.5px] font-black uppercase tracking-[0.06em] text-white/40">Not included</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => onTopSignalAction?.(selectedSport)}
                  className="min-h-[112px] rounded-[14px] border border-purple-300/35 bg-purple-400/[0.055] p-2 text-center shadow-[0_0_14px_rgba(192,132,252,0.10)]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-purple-300/40 bg-purple-300/10 text-purple-200">
                      <PricingIcon type="star" className="h-5 w-5" />
                    </span>
                    <div className="text-left">
                      <p className="text-[9.5px] font-black uppercase tracking-[0.06em] text-purple-300">Top Signal</p>
                      <p className="text-[15px] font-black text-white">$24.99 <span className="text-[8px] text-white/50">/ day</span></p>
                    </div>
                  </div>
                  <p className="mt-2 text-[8px] font-semibold leading-tight text-white/68">The #1 strongest signal of the day for a specific sport.</p>
                  <span className="mt-2 inline-flex w-full justify-center rounded-[9px] border border-purple-300/45 px-2 py-1 text-[8px] font-black uppercase text-purple-200">Unlock</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileSectionTitle({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center text-cyan-300">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-black uppercase tracking-[0.075em] text-white">{title}</h2>
          <p className="truncate text-[10px] font-semibold text-white/48">{subtitle}</p>
        </div>
      </div>
      {action ? (
        <button type="button" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-cyan-300">
          {action}
          <span className="text-lg font-light">›</span>
        </button>
      ) : null}
    </div>
  );
}

function ProfileMiniIcon({ type }: { type: "pulse" | "target" | "bars" | "shield" | "star" | "five" | "crown" | "ball" | "diamond" | "clock" | "box" }) {
  if (type === "pulse") {
    return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none"><path d="M3 13h4l2-6 4 12 2-6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === "target") {
    return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M16 8l4-4M17 4h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (type === "bars") {
    return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none"><path d="M5 19V9M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
  }
  if (type === "shield") {
    return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none"><path d="M12 3 19 6v5c0 4.4-2.7 7.8-7 10-4.3-2.2-7-5.6-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" /><path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === "star") {
    return <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
  }
  if (type === "five") return <span className="text-[26px] font-black leading-none">5</span>;
  if (type === "crown") {
    return <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none"><path d="m5 17 1-9 4 4 2-6 2 6 4-4 1 9H5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M6 20h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (type === "ball") {
    return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="M9 5.5c2 3.4 2 9.6 0 13M15 5.5c-2 3.4-2 9.6 0 13" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  if (type === "diamond") {
    return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none"><path d="M12 3 21 9l-9 12L3 9l9-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M3 9h18M8 9l4 12 4-12" stroke="currentColor" strokeWidth="1.2" /></svg>;
  }
  if (type === "box") {
    return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none"><path d="m4 7.5 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M4 7.5v9l8 4 8-4v-9M12 11.5v9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function profileTone(code: string) {
  if (code === "top_signal_by_sport" || code === "top_signal_mlb") return { accent: "border-l-violet-400", text: "text-violet-300", bg: "bg-violet-500/12", icon: "star" as const };
  if (code === "premium_sport_top5" || code === "top5_mlb") return { accent: "border-l-cyan-400", text: "text-cyan-300", bg: "bg-cyan-400/12", icon: "five" as const };
  if (code === "exclusive_detected_top3" || code === "exclusive_pack") return { accent: "border-l-emerald-400", text: "text-emerald-300", bg: "bg-emerald-400/12", icon: "crown" as const };
  if (code === "atlas_unlimited_all_sports") return { accent: "border-l-purple-400", text: "text-purple-300", bg: "bg-purple-500/12", icon: "diamond" as const };
  if (code === "signals_detected") return { accent: "border-l-cyan-400", text: "text-cyan-300", bg: "bg-cyan-400/12", icon: "target" as const };
  return { accent: "border-l-amber-400", text: "text-amber-300", bg: "bg-amber-400/12", icon: "ball" as const };
}

function statusTone(status: string) {
  if (status === "READY" || status === "CONFIRMED" || status === "ACTIVE") return "bg-emerald-400/16 text-emerald-300";
  if (status === "DETECTED" || status === "UNDER REVIEW" || status === "EXPIRES SOON") return "bg-yellow-400/15 text-yellow-300";
  if (status === "DOWNGRADED" || status === "WITHDRAWN" || status === "CANCELLED") return "bg-red-500/15 text-red-300";
  return "bg-white/8 text-white/52";
}

function TeamSignalLogo({ team }: { team: string }) {
  const brand = teamBranding[team];
  if (brand?.logo) {
    return <img src={brand.logo} alt="" className="h-8 w-8 object-contain" />;
  }
  return <span className="text-[12px] font-black text-white/70">{team.slice(0, 2).toUpperCase()}</span>;
}

function controlSportFromSelectedSport(sport: SelectedSport) {
  if (sport === "all") return "ALL";
  return selectedSportToSportCode[sport];
}

function MyAtlasScreen({
  onNavigate,
}: {
  onNavigate?: (section: SignalsHomeNavSection) => void;
}) {
  const [data, setData] = useState<AtlasControlCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engineDetailsOpen, setEngineDetailsOpen] = useState(false);
  const [leadersExpanded, setLeadersExpanded] = useState(false);
  const [selectedSport, setSelectedSport] = useState<SelectedSport>("all");
  const [controlMode, setControlMode] = useState<AtlasControlMode>("live");
  const [controlTab, setControlTab] = useState<AtlasControlTab>("overview");
  const [activityFilter, setActivityFilter] = useState<AtlasActivityFilter>("ALL");
  const filteredData = filterAtlasControlCenterData(data, controlSportFromSelectedSport(selectedSport));

  async function loadControlCenter(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    try {
      const response = await fetch("/api/admin/atlas-control-center", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setData(null);
        setError(response.status === 401 || response.status === 403 ? "Admin access required." : payload?.error ?? "Unable to load My Atlas.");
        return;
      }

      setData(payload as AtlasControlCenterData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load My Atlas.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadControlCenter();
  }, []);

  useEffect(() => {
    if (controlMode !== "live") return;
    const interval = window.setInterval(() => {
      void loadControlCenter({ silent: true });
    }, 45000);
    return () => window.clearInterval(interval);
  }, [controlMode]);

  return (
    <main className="min-h-screen bg-[#020814] text-white">
      <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(34,211,238,0.14),transparent_34%),#020814] px-3.5 pb-[88px] pt-3">
        <header className="relative mb-2.5 overflow-hidden rounded-[22px] border border-cyan-300/20 bg-[#06101d]/78 px-4 py-3.5 shadow-[0_0_24px_rgba(34,211,238,0.07)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_40%)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300/80">Atlas Account</p>
              <h1 className="mt-1 text-[28px] font-black uppercase leading-none tracking-[-0.035em]">My Atlas</h1>
              <p className="mt-1 max-w-[320px] text-[11px] font-medium leading-snug text-white/58">Atlas Operational Overview</p>
            </div>
            <button
              type="button"
              onClick={() => void loadControlCenter()}
              disabled={loading}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] border border-cyan-300/35 bg-cyan-400/[0.12] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.12)] disabled:opacity-60"
              aria-label="Refresh My Atlas"
              title="Refresh"
            >
              <span className="text-[15px] leading-none">↻</span>
              Refresh
            </button>
          </div>
        </header>

        {error === "Admin access required." ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[14px] font-black text-white">Admin access required.</p>
            <p className="mt-1 text-[12px] font-semibold leading-5 text-white/55">My Atlas is ready for personal account blocks, but the operational Overview is only available to an administrator.</p>
            <button type="button" onClick={() => onNavigate?.("signals")} className="mt-3 rounded-full bg-cyan-300 px-4 py-2 text-[11px] font-black text-black">
              Go Home
            </button>
          </div>
        ) : (
          <>
            <div className="relative mb-2 h-[76px] overflow-visible">
              <FrameSportSelectorRow selectedSport={selectedSport} onSelectSport={setSelectedSport} />
            </div>
            <AtlasControlCenterPanel
              data={filteredData}
              loading={loading}
              error={error}
              mode={controlMode}
              tab={controlTab}
              activityFilter={activityFilter}
              engineDetailsOpen={engineDetailsOpen}
              leadersExpanded={leadersExpanded}
              selectedSport="ALL"
              showHeader={false}
              showSportFilter={false}
              onTab={setControlTab}
              onModeChange={setControlMode}
              onActivityFilter={setActivityFilter}
              onToggleEngineDetails={() => setEngineDetailsOpen((open) => !open)}
              onToggleLeaders={() => setLeadersExpanded((open) => !open)}
              onSportChange={() => undefined}
              onRefresh={() => void loadControlCenter()}
            />
          </>
        )}
      </div>
      <AtlasBottomNavigation activeSection="alerts" onNavigate={onNavigate} placement="fixed" />
    </main>
  );
}

export function SignalsHomePage({
  topPlay,
  topSignals,
  signalRows = [],
  liveRows = [],
  liveLoading = false,
  liveErrorMessage,
  signalGroupCount,
  activeSection = "signals",
  demoModeEnabled = false,
  demoSnapshotDate = null,
  onNavigate,
  onSportProductAction,
  onTopPlayAction,
  onTopPlayNotify,
  onSportNotify,
  onLiveRowOpen,
  activeDate = getTodayKey(),
  onDateChange,
  activeSubscriptionSports = ["MLB"],
  selectedSubscriptionSport = activeSubscriptionSports[0] ?? "MLB",
  onSelectedSubscriptionSportChange,
  onPlanSubscribe,
  onRetry,
  journeyMessage,
  onDismissJourneyMessage,
  loading = false,
  errorMessage,
}: SignalsHomePageProps) {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [howItWorksInitialSection, setHowItWorksInitialSection] = useState<"top-signal" | undefined>();
  const [topPlayDetailOpen, setTopPlayDetailOpen] = useState(false);
  const [selectedSportSignal, setSelectedSportSignal] = useState<SportCode | null>(null);
  const [selectedSignalRow, setSelectedSignalRow] = useState<SignalDetectedRow | null>(null);
  const [selectedSport, setSelectedSport] = useState<SelectedSport>("all");
  const [contentMode, setContentMode] = useState<SignalsContentMode>("signals");
  const [revealTarget, setRevealTarget] = useState<"top_play" | SportCode | null>(null);
  const [signalExplorerOpen, setSignalExplorerOpen] = useState(false);
  const [notifyStates, setNotifyStates] = useState<Record<string, "idle" | "reserved" | "prepared" | "error">>({});

  const selectedSportMode = useMemo(() => {
    const now = new Date();
    const todayKey = getTodayKey();
    const isTodayBoard = activeDate === todayKey;
    const isPastBoard = activeDate < todayKey;
    const allSignalRows = sortSignalsByStartTime(getSignalsBySport(signalRows, selectedSport));
    const upcomingSignalRows = getUpcomingSignalsBySport(signalRows, selectedSport, now);
    const filteredSignalRows = isTodayBoard
      ? upcomingSignalRows.length
        ? upcomingSignalRows
        : allSignalRows
      : allSignalRows;

    return {
      sport: selectedSport,
      sportLabel: selectedSportLabels[selectedSport],
      sportSignalCount: filteredSignalRows.length,
      sportTopSignalEndpoint: selectedSportTopSignalEndpoints[selectedSport],
      filteredSignalRows,
      allSignalRows,
      upcomingSignalRows,
      completedMode: isTodayBoard && upcomingSignalRows.length === 0 && allSignalRows.length > 0,
      nextSignal: getNextSignalBySport(signalRows, selectedSport, now),
      emptyState: {
        title: isPastBoard ? "No Results Available" : "No Games Available",
        description: isPastBoard
          ? "No completed signal board was found for this date."
          : "Check back later for new scheduled games.",
      },
    };
  }, [activeDate, selectedSport, signalRows]);

  const activeSignalRows = selectedSportMode.filteredSignalRows;
  const uniqueSignalSportsCount = new Set(signalRows.map((row) => row.sport)).size;
  const upcomingSignalCount = selectedSportMode.upcomingSignalRows.length;
  const trackedSignalCount = selectedSportMode.allSignalRows.length;
  const topPlayView = buildTopPlayViewModel(topPlay);
  const sportSignalViews = sports.map((sport) =>
    buildSportSignalViewModel(sport, topSignals?.[sport]),
  );
  const orderedSportSignalViews = useMemo(
    () => orderSportSignalViews(sportSignalViews),
    [sportSignalViews],
  );
  const selectedSportCode =
    selectedSport === "all" ? null : selectedSportToSportCode[selectedSport];
  const selectedSportSignalView = selectedSportCode
    ? sportSignalViews.find((signal) => signal.sport === selectedSportCode)
    : null;
  const selectedSportPrecisionData = selectedSportCode ? topSignals?.[selectedSportCode] : null;
  const selectedSportHasPrecisionData = Boolean(selectedSportPrecisionData);
  const signalsDetectedCount =
    selectedSportMode.sportSignalCount;
  const topPlayReleased = hasRevealAccess(topPlay) && topPlay?.pick ? 1 : 0;
  const activityMetrics: ActivityMetric[] = [
    { label: "Signals Detected", value: signalsDetectedCount, tone: "green" },
    {
      label: "In Review",
      value: sportSignalViews.filter((signal) =>
        ["Scanning Market", "Analyzing Market"].includes(signal.status),
      ).length,
      tone: "cyan",
    },
    {
      label: "Strong Candidates",
      value: sportSignalViews.filter((signal) => signal.status === "Strong Candidate").length,
      tone: "blue",
    },
    {
      label: "Final Review",
      value: sportSignalViews.filter((signal) => signal.status === "Final Review").length,
      tone: "purple",
    },
    { label: "Top Signal", value: topPlayReleased, tone: "gold" },
  ];

  async function reserveNotification(
    key: string,
    handler?: () => Promise<PrecisionNotifyResult>,
  ) {
    if (notifyStates[key] === "reserved" || notifyStates[key] === "prepared") {
      return { status: notifyStates[key] } as PrecisionNotifyResult;
    }

    try {
      const result = await handler?.();

      if (!result || result.status === "error" || result.status === "login") {
        setNotifyStates((current) => ({
          ...current,
          [key]: result?.status === "login" ? "idle" : "error",
        }));
        return result ?? { status: "error", message: "Could not reserve notification." };
      }

      setNotifyStates((current) => ({ ...current, [key]: result.status }));
      return result;
    } catch {
      setNotifyStates((current) => ({ ...current, [key]: "error" }));
      return { status: "error", message: "Could not reserve notification." } as PrecisionNotifyResult;
    }
  }

  async function handleTopPlayAction() {
    if (topPlayView.actionTone === "view") {
      setRevealTarget("top_play");
      return;
    }

    const result = await onTopPlayAction?.();
    if (result?.status === "view_pick") setRevealTarget("top_play");
  }

  async function handleSportAction(sport: SportCode) {
    const signal = sportSignalViews.find((item) => item.sport === sport);

    if (signal?.actionTone === "view") {
      setRevealTarget(sport);
      return;
    }

    const result = await onSportProductAction?.(sport);
    if (result?.status === "view_pick") setRevealTarget(sport);
  }

  function handleSelectedSportTopSignalAction() {
    if (!selectedSportCode || !selectedSportSignalView) return;

    setSelectedSportSignal(selectedSportCode);
  }

  function openHowItWorks(initialSection?: "top-signal") {
    setHowItWorksInitialSection(initialSection);
    setHowItWorksOpen(true);
  }

  if (activeSection === "alerts") {
    return <MyAtlasScreen onNavigate={onNavigate} />;
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto min-h-screen w-full max-w-md bg-[#030814]">
        <section className="relative mx-auto h-dvh min-h-screen w-full overflow-hidden bg-[#030814] text-white">
            <img
              src="/mockups/signals-frame-v2.jpg"
              alt=""
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[calc(100%+32px)] w-full -translate-y-8 select-none object-cover object-top"
              draggable={false}
            />

            <SignalsFrameHotspots
              onSelectSport={setSelectedSport}
              onHowItWorks={() => openHowItWorks()}
              onNavigate={onNavigate}
            />
            <FrameTopActions
              activeDate={activeDate}
              onDateChange={onDateChange}
              onHowItWorks={() => openHowItWorks()}
              onNavigate={onNavigate}
            />

            <FrameSportSelectorRow selectedSport={selectedSport} onSelectSport={setSelectedSport} />

            <div className="pointer-events-auto absolute left-[3.3%] right-[3.3%] top-[25.1%] z-50">
              <SignalsModeSwitch mode={contentMode} onChange={setContentMode} />
            </div>

            <div className="pointer-events-auto absolute inset-x-0 bottom-[82px] top-[29.85%] z-20 overflow-y-auto overscroll-contain px-3 pb-2 scroll-smooth [scrollbar-width:none] [touch-action:pan-y] [&::-webkit-scrollbar]:hidden">
              {journeyMessage ? (
                <div
                  className={`mb-2 rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-md ${
                    journeyMessage.tone === "error"
                      ? "border-red-400/25 bg-red-950/80 text-red-50"
                      : journeyMessage.tone === "success"
                        ? "border-lime-300/25 bg-lime-950/70 text-lime-50"
                        : "border-cyan-300/25 bg-cyan-950/75 text-cyan-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{journeyMessage.title}</p>
                      {journeyMessage.body ? <p className="mt-1 text-white/70">{journeyMessage.body}</p> : null}
                    </div>
                    {onDismissJourneyMessage ? (
                      <button
                        type="button"
                        onClick={onDismissJourneyMessage}
                        className="text-lg leading-none text-white/60"
                        aria-label="Dismiss message"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {demoModeEnabled ? (
                <div className="mb-2 rounded-2xl border border-cyan-300/18 bg-cyan-300/[0.075] px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
                  <div className="flex items-start gap-2">
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.10] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-200">
                      Last Available
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-white/80">No live games are available today.</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-white/52">
                        Showing the most recent Atlas snapshot{demoSnapshotDate ? ` from ${formatDemoSnapshotDate(demoSnapshotDate)}` : ""} for demonstration purposes.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {contentMode === "signals" ? (
                selectedSport === "all" ? (
                  <div className="space-y-2 pt-1">
                    <PricingPacksSection
                      activeSports={activeSubscriptionSports}
                      selectedSport={selectedSubscriptionSport}
                      onSelectedSportChange={onSelectedSubscriptionSportChange}
                      onPlanSubscribe={onPlanSubscribe}
                      onTopSignalAction={(sport) => {
                        void onSportProductAction?.(sport);
                      }}
                      onTopPlayAction={() => {
                        void onTopPlayAction?.();
                      }}
                    />

                    <FrameSignalDetectedFeed
                      rows={activeSignalRows}
                      count={signalsDetectedCount}
                      loading={loading}
                      errorMessage={errorMessage}
                      onRetry={onRetry}
                      onRowOpen={(row) => setSelectedSignalRow(row)}
                      onViewAll={() => setSignalExplorerOpen(true)}
                      completedMode={selectedSportMode.completedMode}
                      sportsActiveCount={uniqueSignalSportsCount}
                      gamesTrackedCount={trackedSignalCount}
                      upcomingGamesCount={upcomingSignalCount}
                    />
                    <FrameTodayActivityCard metrics={activityMetrics} />
                  </div>
                ) : (
                  <div className="space-y-2 pt-2">
                    {errorMessage && !loading ? (
                      <div className="rounded-2xl border border-red-400/25 bg-red-950/80 px-4 py-3 text-xs text-red-50 shadow-2xl backdrop-blur-md">
                        <p className="font-black">Unable to load market data.</p>
                        <p className="mt-1 text-white/70">Please try again.</p>
                        {onRetry ? (
                          <button
                            type="button"
                            onClick={onRetry}
                            className="mt-2 rounded-full border border-red-200/25 px-3 py-1 text-[11px] font-black"
                          >
                            Retry
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {loading ? (
                      <OpportunitySkeleton />
                    ) : (
                      <SelectedSportTopSignalCard
                        sportLabel={selectedSportMode.sportLabel}
                        progressPercent={selectedSportSignalView?.progressPercent ?? 87}
                        actionLabel={getSelectedSportTopSignalActionLabel({
                          signal: selectedSportSignalView,
                          hasPrecisionData: selectedSportHasPrecisionData,
                          hasSportRows: selectedSportMode.sportSignalCount > 0,
                          loading,
                        })}
                        disabled={isSelectedSportTopSignalActionDisabled({
                          signal: selectedSportSignalView,
                          hasPrecisionData: selectedSportHasPrecisionData,
                          hasSportRows: selectedSportMode.sportSignalCount > 0,
                          loading,
                        })}
                        onAction={() => {
                          void handleSelectedSportTopSignalAction();
                        }}
                      />
                    )}

                    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(1,18,34,0.94),rgba(3,8,20,0.96))] shadow-[0_0_22px_rgba(0,229,255,0.08)]">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <h2 className="shrink-0 text-[13px] font-black uppercase tracking-[0.14em] text-cyan-300">
                            Signal Detected
                          </h2>
                          <span className="truncate rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-300">
                            {selectedSportMode.sportLabel} • {selectedSportMode.sportSignalCount} Signals
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSignalExplorerOpen(true)}
                          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-white/78"
                          aria-label={`View all ${selectedSportMode.sportLabel} Signal Detected rows`}
                        >
                          View All
                          <span className="text-xl font-light">›</span>
                        </button>
                      </div>

                      <div>
                        {loading ? (
                          Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={`selected-sport-loading-${index}`}
                              className="h-[66px] animate-pulse border-b border-white/10 bg-white/[0.045] last:border-b-0"
                            />
                          ))
                        ) : activeSignalRows.length ? (
                          activeSignalRows.map((row) => (
                            <SelectedSportSignalRow
                              key={row.id}
                              row={row}
                              sport={selectedSport}
                              onOpen={() => setSelectedSignalRow(row)}
                            />
                          ))
                        ) : (
                          <SelectedSportEmptyState
                            title={selectedSportMode.emptyState.title}
                            description={selectedSportMode.emptyState.description}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedSport("all")}
                          className="flex h-11 w-full items-center justify-center border-t border-white/10 bg-white/[0.025] px-4 text-[13px] font-black text-white"
                        >
                          View All Available Sports
                          <span className="ml-auto text-xl font-light">›</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <LiveContent
                  rows={
                    selectedSportCode
                      ? liveRows.filter((row) => row.sport === selectedSportCode)
                      : liveRows
                  }
                  loading={liveLoading}
                  errorMessage={liveErrorMessage}
                  onRetry={onRetry}
                  onRowOpen={onLiveRowOpen}
                />
              )}
            </div>

            <AtlasBottomNavigation activeSection={activeSection} onNavigate={onNavigate} placement="fixed" />
          </section>
      </div>

      <SignalExplorerSheet
        open={signalExplorerOpen}
        rows={signalRows}
        loading={loading}
        errorMessage={errorMessage}
        onRetry={onRetry}
        onClose={() => setSignalExplorerOpen(false)}
        onRowOpen={setSelectedSignalRow}
      />

      <HowItWorksSheet
        open={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        initialSection={howItWorksInitialSection}
      />

      <TopPlayDetailSheet
        open={topPlayDetailOpen}
        data={topPlay}
        onClose={() => setTopPlayDetailOpen(false)}
        onPrimaryAction={onTopPlayAction}
        onReveal={() => setRevealTarget("top_play")}
        notifyState={notifyStates.top_play ?? "idle"}
        onNotify={() => reserveNotification("top_play", onTopPlayNotify)}
      />

      <SportSignalDetailSheet
        open={Boolean(selectedSportSignal)}
        sport={selectedSportSignal}
        data={selectedSportSignal ? topSignals?.[selectedSportSignal] : null}
        onClose={() => setSelectedSportSignal(null)}
        onPrimaryAction={onSportProductAction}
        onReveal={(sport) => setRevealTarget(sport)}
        notifyState={
          selectedSportSignal
            ? notifyStates[`top_signal_${selectedSportSignal}`] ?? "idle"
            : "idle"
        }
        onNotify={(sport) =>
          reserveNotification(`top_signal_${sport}`, () => onSportNotify?.(sport) ?? Promise.resolve({ status: "error" }))
        }
      />

      <SignalDetectedDetailSheet
        open={Boolean(selectedSignalRow)}
        row={selectedSignalRow}
        onClose={() => setSelectedSignalRow(null)}
        onLearnTopSignals={() => {
          setSelectedSignalRow(null);
          openHowItWorks("top-signal");
        }}
      />

      <PrecisionRevealSheet
        open={Boolean(revealTarget)}
        productType={revealTarget === "top_play" ? "top_play" : "top_signal"}
        sport={revealTarget === "top_play" ? undefined : revealTarget}
        data={
          revealTarget === "top_play"
            ? topPlay
            : revealTarget
              ? topSignals?.[revealTarget]
              : null
        }
        onClose={() => setRevealTarget(null)}
        onRefresh={onRetry}
      />
    </main>
  );
}
