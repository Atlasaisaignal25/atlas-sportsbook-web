"use client";

import { Suspense, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import {
  SignalsHomePage,
  type PrecisionNotifyResult,
  type PrecisionUnlockResult,
  type SignalsLiveRow,
} from "@/app/components/signals/SignalsHomePage";
import { HowItWorksSheet } from "@/app/components/signals/HowItWorksSheet";




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
  rank?: number;
  awayTeam?: string;
  homeTeam?: string;
  pick: string;
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

type UserPlan = "free" | "exclusive" | "premium" | "elite" | "admin";
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
const checkoutSports = ["MLB", "NBA", "NHL", "SOCCER", "NFL"] as const satisfies readonly CheckoutSport[];
const precisionDisplaySports = ["MLB", "NBA", "NFL", "NHL", "SOCCER"] as const satisfies readonly CheckoutSport[];
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
type AppSection = "signals" | "scores" | "challenges" | "news" | "alerts" | "more";
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

type ChallengePick = {
  signalId: string;
  sport: SportTab;
  gameId?: string | null;
  awayTeam: string;
  homeTeam: string;
  pickLabel: string;
  market?: string | null;
  odds?: number | null;
  startTime?: string | null;
};

type ChallengeRun = {
  id: string;
  challenge_type: "daily_streak" | "triple_play" | "mega_5";
  status: string;
  started_at: string;
  ends_at: string;
  reward_granted?: boolean;
};

type ChallengeAttempt = {
  id: string;
  run_id: string;
  challenge_type: "daily_streak" | "triple_play" | "mega_5";
  attempt_date: string;
  status: string;
  challenge_attempt_picks?: Array<{ pick_label: string; sport: SportTab }>;
};

type ChallengeSnapshot = {
  authenticated: boolean;
  guest?: boolean;
  runs: ChallengeRun[];
  attempts: ChallengeAttempt[];
  rewards: any[];
  availablePicks: ChallengePick[];
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
    value === "admin"
  );
}

function isCheckoutProduct(value: unknown): value is CheckoutProduct {
  return (
    value === "exclusive" ||
    value === "premium" ||
    value === "elite" ||
    value === "top_signal_mlb" ||
    value === "top_signal_nba" ||
    value === "top_signal_nhl" ||
    value === "top_signal_soccer" ||
    value === "top_signal_nfl" ||
    value === "top_play"
  );
}

function isSubscriptionCheckoutProduct(value: CheckoutProduct): value is "exclusive" | "premium" | "elite" {
  return value === "exclusive" || value === "premium" || value === "elite";
}

function topSignalProductForSport(sport: CheckoutSport): CheckoutProduct {
  return `top_signal_${sport.toLowerCase()}` as CheckoutProduct;
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
    ? getMlbInningText(game)
    : "";
  const centerValue = hasScore
    ? `${awayScore}-${homeScore}`
    : live
    ? getMlbInningText(game)
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

  if (userAccess.plan === "elite") {
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
  if (userAccess.plan === "elite" || userAccess.plan === "admin") return true;
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
    userAccess.plan === "elite" ||
    userAccess.plan === "admin"
  );
}

function canViewTop5History(userAccess: UserAccess) {
  return (
    userAccess.plan === "exclusive" ||
    userAccess.plan === "premium" ||
    userAccess.plan === "elite" ||
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

  if (userAccess.plan === "elite") {
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
    userAccess.plan === "elite"
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
  plan: "exclusive" | "premium" | "elite";
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
    description: "Best for users focused on one sport.",
    included: [
      "Choose Your Sport",
      "Top 3 Signals",
      "Not Ranked",
      "Sorted by start time",
    ],
    locked: ["Top Signal (locked)", "Top Play (locked)"],
    cta: "Choose Exclusive",
  },
  {
    plan: "premium",
    name: "PREMIUM",
    price: "$59.99",
    icon: "◎",
    tone: "blue",
    badge: "Recommended",
    description: "Best for users who want Atlas AI to prioritize the strongest plays.",
    included: [
      "Choose Your Sport",
      "Ranked Top 3 Signals",
      "Atlas value priority",
    ],
    locked: ["Top Signal (locked)", "Top Play (locked)"],
    cta: "Choose Premium",
  },
  {
    plan: "elite",
    name: "ELITE",
    price: "$99.99",
    icon: "◆",
    tone: "purple",
    description: "Best for users who want full coverage across all available sports.",
    included: [
      "All Active Sports",
      "Ranked Top 3 for Every Sport",
      "Each sport ranked separately",
    ],
    locked: ["Top Signal (locked)", "Top Play (locked)"],
    cta: "Choose Elite",
  },
];

const challengeCards = [
  {
    type: "daily_streak" as const,
    name: "Daily Streak",
    difficulty: "Starter",
    requiredPicks: 1,
    targetWins: 7,
    prize: "Premium Pack 30 days for 1 sport",
    description: "Select 1 Signal Detected pick daily and hit 7 straight days.",
  },
  {
    type: "triple_play" as const,
    name: "Triple Play",
    difficulty: "Advanced",
    requiredPicks: 3,
    targetWins: 3,
    prize: "Premium Pack 30 days for 1 sport",
    description: "Build a 3-pick parlay from Signal Detected and win 3 attempts.",
  },
  {
    type: "mega_5" as const,
    name: "Mega 5",
    difficulty: "Elite",
    requiredPicks: 5,
    targetWins: 2,
    prize: "Premium Pack 30 days for 1 sport",
    description: "Build a 5-pick parlay from Signal Detected and win 2 attempts.",
  },
];

function getChallengeProgress(
  challengeType: ChallengeRun["challenge_type"],
  attempts: ChallengeAttempt[]
) {
  const rows = attempts
    .filter((attempt) => attempt.challenge_type === challengeType)
    .sort((a, b) => a.attempt_date.localeCompare(b.attempt_date))
    .slice(0, 7);

  return Array.from({ length: 7 }, (_, index) => {
    const attempt = rows[index];
    if (!attempt) return "-";
    if (attempt.status === "won") return "✓";
    if (attempt.status === "lost") return "×";
    if (attempt.status === "push" || attempt.status === "void") return "•";
    return "…";
  });
}

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

function BottomNavIcon({ itemKey }: { itemKey: AppSection }) {
  if (itemKey === "challenges") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="m6.5 12.2 3.2 3.2 7.8-8.1"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (itemKey === "scores") {
    return <span className="text-[10px] font-black leading-none">0:0</span>;
  }

  if (itemKey === "news") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M5 5.5h10.5A2.5 2.5 0 0 1 18 8v10.5H7.5A2.5 2.5 0 0 1 5 16V5.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8 9h6M8 12h3M18 9h1.2A1.8 1.8 0 0 1 21 10.8V16a2.5 2.5 0 0 1-2.5 2.5H18"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (itemKey === "signals") {
    return (
      <img
        src="/signals-nav-logo.png"
        alt=""
        className="h-full w-full object-cover object-center"
        aria-hidden="true"
      />
    );
  }

  if (itemKey === "alerts") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M18 9.6a6 6 0 0 0-12 0c0 7-2 7.4-2 8.4h16c0-1-2-.4-2-8.4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.8 20a2.4 2.4 0 0 0 4.4 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M5 12h14M5 17h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
          ["◉", signalGroupCount, "Signals Detected", "text-lime-300"],
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
  result,
  isLast,
  onOpen,
}: {
  game: LiveScore;
  sport: SportTab;
  pickLabel: string;
  result: string | null | undefined;
  isLast: boolean;
  onOpen: () => void;
}) {
  const resultLabel = getSignalResultBadge(result);

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
          {pickLabel}
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
              : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
          }`}
        >
          {resultLabel}
        </span>
        <p className="mt-1 whitespace-nowrap text-[10px] font-medium text-white/45">
          {formatTime(game.commence_time)}
        </p>
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

  void handleSubscribe(plan, plan === "elite" ? undefined : selectedPackSport);
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
const [appSection, setAppSection] = useState<AppSection>("signals");
const [pulseSportFilter, setPulseSportFilter] = useState<"ALL" | PulseSport>("ALL");
const [pulseImpactFilter, setPulseImpactFilter] = useState<"ALL" | PulseImpact>("ALL");
const [pulseMlbItems, setPulseMlbItems] = useState<AtlasEvent[]>(() =>
  createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport === "MLB"))
);
const [pulseLoading, setPulseLoading] = useState(false);
const [pulseSourcesSheet, setPulseSourcesSheet] = useState<{
  title: string;
  sources: AtlasSource[];
} | null>(null);
const [followedSports, setFollowedSports] = useState<SportTab[]>([]);
const [followedTeams, setFollowedTeams] = useState<string[]>([]);
const [challengeSnapshot, setChallengeSnapshot] = useState<ChallengeSnapshot>({
  authenticated: false,
  guest: false,
  runs: [],
  attempts: [],
  rewards: [],
  availablePicks: [],
});
const [challengeLoading, setChallengeLoading] = useState(false);
const [challengeError, setChallengeError] = useState<string | null>(null);
const [selectedChallengePicks, setSelectedChallengePicks] = useState<
  Record<string, string[]>
>({});
const [challengeBusy, setChallengeBusy] = useState<string | null>(null);
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

async function loadChallenges() {
  setChallengeLoading(true);
  setChallengeError(null);

  try {
    const res = await fetch("/api/challenges", {
      cache: "no-store",
      headers: getChallengeHeaders(),
    });
    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error ?? "Unable to load challenges.");
    }

    setChallengeSnapshot({
      authenticated: Boolean(data.authenticated),
      guest: Boolean(data.guest),
      runs: Array.isArray(data.runs) ? data.runs : [],
      attempts: Array.isArray(data.attempts) ? data.attempts : [],
      rewards: Array.isArray(data.rewards) ? data.rewards : [],
      availablePicks: Array.isArray(data.availablePicks) ? data.availablePicks : [],
    });
  } catch (error) {
    setChallengeError(error instanceof Error ? error.message : "Unable to load challenges.");
  } finally {
    setChallengeLoading(false);
  }
}

useEffect(() => {
  if (appSection === "challenges") {
    loadChallenges();
  }
}, [appSection, authSession.authenticated]);

function getChallengeGuestId() {
  if (typeof window === "undefined") return null;

  const storageKey = "atlas_challenge_guest_id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const randomId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const guestId = `guest_${randomId}`;
  window.localStorage.setItem(storageKey, guestId);
  return guestId;
}

function getChallengeHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const guestId = getChallengeGuestId();
  if (guestId) headers.set("x-atlas-guest-id", guestId);
  return headers;
}

function toggleChallengePick(challengeType: ChallengeRun["challenge_type"], signalId: string) {
  const config = challengeCards.find((challenge) => challenge.type === challengeType);
  const maxPicks = config?.requiredPicks ?? 1;

  setSelectedChallengePicks((current) => {
    const selected = current[challengeType] ?? [];

    if (selected.includes(signalId)) {
      return {
        ...current,
        [challengeType]: selected.filter((item) => item !== signalId),
      };
    }

    if (selected.length >= maxPicks) return current;

    return {
      ...current,
      [challengeType]: [...selected, signalId],
    };
  });
}

async function handleStartChallenge(challengeType: ChallengeRun["challenge_type"]) {
  setChallengeBusy(challengeType);
  setChallengeError(null);

  try {
    const res = await fetch("/api/challenges/start", {
      method: "POST",
      headers: getChallengeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ challengeType }),
    });
    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error ?? "Unable to start challenge.");
    }

    await loadChallenges();
  } catch (error) {
    setChallengeError(error instanceof Error ? error.message : "Unable to start challenge.");
  } finally {
    setChallengeBusy(null);
  }
}

async function handleSubmitChallengeAttempt(challengeType: ChallengeRun["challenge_type"]) {
  const signalIds = selectedChallengePicks[challengeType] ?? [];
  setChallengeBusy(challengeType);
  setChallengeError(null);

  try {
    const res = await fetch("/api/challenges/attempt", {
      method: "POST",
      headers: getChallengeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ challengeType, signalIds }),
    });
    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error ?? "Unable to submit challenge attempt.");
    }

    setSelectedChallengePicks((current) => ({ ...current, [challengeType]: [] }));
    await loadChallenges();
  } catch (error) {
    setChallengeError(
      error instanceof Error ? error.message : "Unable to submit challenge attempt."
    );
  } finally {
    setChallengeBusy(null);
  }
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
    sectionFromUrl === "challenges" ||
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
  if (appSection !== "news") return;

  const controller = new AbortController();

  async function loadMarketImpactNews() {
    setPulseLoading(true);

    try {
      const response = await fetch("/api/market-impact/news?sport=MLB&limit=20", {
        signal: controller.signal,
      });
      const data = (await response.json()) as { items?: AtlasEvent[] };

      if (Array.isArray(data.items) && data.items.length > 0) {
        setPulseMlbItems(data.items);
      } else {
        setPulseMlbItems(createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport === "MLB")));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setPulseMlbItems(createAtlasEventsFromPulseItems(atlasPulseMock.filter((item) => item.sport === "MLB")));
      }
    } finally {
      if (!controller.signal.aborted) {
        setPulseLoading(false);
      }
    }
  }

  loadMarketImpactNews();

  return () => controller.abort();
}, [appSection]);

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
    if (viewMode !== "live" && appSection !== "scores") return;

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
}, [selectedSport, activeDay]);

useEffect(() => {
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
}, [selectedSport, activeDay]);

useEffect(() => {
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
}, [selectedSport, activeDay]);

useEffect(() => {
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
}, [selectedSport, viewMode, activeDay]);

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
    userAccess.plan === "elite" || userAccess.plan === "admin"
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

  if (followedGames.length > 0) {
    alerts.push({
      id: `${selectedSport}-followed-games`,
      tone: "white",
      label: "Challenges",
      title: "Challenge board has active games",
      body: `${followedGames.length} games match your followed sports or teams.`,
      action: () => setAppSection("challenges"),
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
    : appSection === "challenges"
    ? "Challenges"
    : appSection === "news"
    ? "Market Impact"
    : appSection === "alerts"
    ? "Alerts"
    : "More";

const sectionEyebrow =
  appSection === "signals"
    ? "Atlas Signals"
    : appSection === "scores"
    ? "Live Center"
    : appSection === "challenges"
    ? "Weekly Board"
    : appSection === "news"
    ? "Atlas Pulse"
    : appSection === "alerts"
    ? "Intelligence"
    : "Account";

const pulseSportFilters: Array<{ label: string; value: "ALL" | PulseSport }> = [
  { label: "All", value: "ALL" },
  { label: "MLB", value: "MLB" },
  { label: "NFL", value: "NFL" },
  { label: "NBA", value: "NBA" },
  { label: "NHL", value: "NHL" },
  { label: "Soccer", value: "SOCCER" },
  { label: "Tennis", value: "TENNIS" },
  { label: "UFC", value: "UFC" },
  { label: "NCAA", value: "NCAA" },
];

const pulseImpactFilters: Array<{ label: string; value: "ALL" | PulseImpact }> = [
  { label: "All Impact", value: "ALL" },
  { label: "High", value: "HIGH" },
  { label: "Medium", value: "MEDIUM" },
  { label: "Low", value: "LOW" },
];

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
  const sportMatches = pulseSportFilter === "ALL" || item.sport === pulseSportFilter;
  const impactMatches = pulseImpactFilter === "ALL" || item.impact === pulseImpactFilter;

  return sportMatches && impactMatches;
});

function getPulseImpactClasses(impact: PulseImpact) {
  if (impact === "HIGH") {
    return {
      card: "border-orange-300/35 bg-orange-500/[0.055] shadow-[0_0_18px_rgba(251,113,133,0.10)]",
      badge: "border-orange-300/45 bg-orange-400/12 text-orange-200",
      dot: "bg-orange-300",
    };
  }

  if (impact === "MEDIUM") {
    return {
      card: "border-amber-300/32 bg-amber-400/[0.045] shadow-[0_0_18px_rgba(251,191,36,0.08)]",
      badge: "border-amber-300/45 bg-amber-300/12 text-amber-200",
      dot: "bg-amber-300",
    };
  }

  return {
    card: "border-emerald-300/28 bg-emerald-400/[0.04] shadow-[0_0_18px_rgba(52,211,153,0.07)]",
    badge: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
    dot: "bg-emerald-300",
  };
}

function getAtlasImpactScoreClasses(score?: number) {
  const value = score ?? 0;

  if (value >= 90) {
    return "border-red-300/50 bg-red-400/10 text-red-200";
  }

  if (value >= 75) {
    return "border-amber-300/50 bg-amber-300/10 text-amber-200";
  }

  return "border-cyan-300/45 bg-cyan-300/10 text-cyan-200";
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

function TerminalTeamMark({ teamName, sport }: { teamName: string; sport: SportTab }) {
  const logo = getLogo(teamName, sport);
  const [logoFailed, setLogoFailed] = useState(false);
  const normalizedTeamName = teamName.toLowerCase();
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

  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-white/8 p-0.5 text-[8px] font-black text-white/70">
      {shouldUseLogo && logo ? (
        <img
          src={logo}
          alt={teamName}
          className="h-full w-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        getDisplayAbbr(teamName)
      )}
    </span>
  );
}

const homeMembershipPlans = [
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
    plan: "elite" as const,
    title: "Elite",
    price: "$99.99",
    subtitle: "All Active Sports",
    featureTitle: "Ranked Top 3",
    featureSubtitle: "For Every Sport",
    features: ["All Active Sports", "Ranked Top 3 Per Sport", "Best to Worst", "Auto-Includes New Sports", "Signal History", "Closing Status"],
    cta: "Get Elite",
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
                  type={plan.plan === "premium" ? "crown" : plan.plan === "elite" ? "diamond" : "star"}
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

  if (showSplash) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <AtlasSplashScreen entered={splashEntered} />
      </main>
    );
  }

  if (!authLoaded) {
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

  if (!authSession.authenticated && !guestBoardMode) {
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

  if (appSection === "signals" && viewMode === "live" && !shouldShowSubscriptionPlans) {
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

          return [
            {
              id: `${game.id}-${group.sport}`,
              sport: group.sport as "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER",
              matchup: `${getLiveDisplayName(game.away_team)} vs ${getLiveDisplayName(game.home_team)}`,
              pick: formatDisplayedPick(livePickData.pick, group.sport),
              status: String(livePickData.status ?? "Pending"),
              time: formatTime(game.commence_time).toUpperCase(),
              startTime: game.commence_time,
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
          ? getMlbInningText(game)
          : "";
        const centerValue = hasScore
          ? `${awayScore}-${homeScore}`
          : live
          ? getMlbInningText(game)
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

    return (
      <SignalsHomePage
        topPlay={precisionTopPlay}
        topSignals={precisionTopSignals}
        signalRows={signalHomeRows}
        liveRows={signalsLiveRows}
        liveLoading={liveLoading}
        liveErrorMessage={null}
        signalGroupCount={signalHomeRows.length}
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
        plan: "elite" as const,
        title: "Elite",
        price: "$99.99",
        subtitle: "All Active Sports",
        featureTitle: "Ranked Top 3",
        featureSubtitle: "For Every Sport",
        features: ["All Active Sports", "Ranked Top 3 Per Sport", "Best to Worst", "Auto-Includes New Sports", "Signal History", "Closing Status"],
        cta: "Get Elite",
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
            <div className="space-y-4 px-4 pb-8 pt-[19vh]">
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
                            type={plan.plan === "premium" ? "crown" : plan.plan === "elite" ? "diamond" : "star"}
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
        </div>
      </main>
    );
  }

  return (
  <main className="min-h-screen bg-[#050816] text-white">
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className={`sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 px-4 backdrop-blur ${
        appSection === "signals" ? "pb-2 pt-4" : appSection === "news" ? "pb-2 pt-4" : "pb-3 pt-5"
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
  <img
    src="/icon.png"
    alt="Atlas Signals"
    className="h-8 w-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]"
  />

  <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-400/90">
    {sectionEyebrow}
  </p>
</div>
</div>
            <h1 className={`mt-1 font-bold leading-none tracking-tight ${
              appSection === "signals" ? "text-[36px]" : appSection === "news" ? "text-[30px]" : "text-[40px]"
            }`}>
              {sectionTitle}
            </h1>
            {appSection === "signals" ? (
              <p className="mt-1.5 text-[13px] font-semibold text-white/62">
                Premium Intelligence. Real Time Edge.
              </p>
            ) : appSection === "news" ? (
              <p className="mt-1 text-[12px] font-semibold text-white/58">
                Real-time events moving betting markets.
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
              {appSection === "news" ? "Impact" : selectedSport}
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

        {appSection !== "signals" && appSection !== "news" ? (
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

      <section className={`flex-1 space-y-3 px-4 ${appSection === "signals" ? "py-2" : "py-3"}`}>
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
    : "Signal Detected"}
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
                Choose one sport for Exclusive or Premium, or go Elite for every active sport. Top Signal and Top Play stay separate.
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
                    product: "top_play" as const,
                    name: "TOP PLAY",
                    price: "$149.99",
                    period: "daily",
                    tone: "gold",
                    summary: "Unlock today's absolute #1 Atlas pick across every available sport. One-day access only.",
                    premium: true,
                    features: [
                      "Best overall pick",
                      "Daily unlock",
                      "No Top 5",
                      "No subscription",
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
                    summary: "Choose one sport. Top 3 Signals, not ranked.",
                    features: [
                      "Choose Your Sport",
                      "Top 3 Signals",
                      "Not Ranked",
                      "Sorted by start time",
                    ],
                    excludes: ["Top Signal", "Top Play"],
                    cta: "Choose",
                  },
                  {
                    product: "premium" as const,
                    plan: "premium" as const,
                    name: "PREMIUM",
                    price: "$59.99",
                    period: "month",
                    tone: "silver",
                    summary: "Choose one sport. Ranked Top 3 Signals.",
                    recommended: true,
                    features: [
                      "Choose Your Sport",
                      "Ranked Top 3 Signals",
                      "Atlas value priority",
                      "Recommended",
                    ],
                    excludes: ["Top Signal", "Top Play"],
                    cta: "Choose",
                  },
                  {
                    product: "elite" as const,
                    plan: "elite" as const,
                    name: "ELITE",
                    price: "$99.99",
                    period: "month",
                    tone: "cyan",
                    summary: "All active sports. Ranked Top 3 for every sport.",
                    features: [
                      "All Active Sports",
                      "Ranked Top 3 per sport",
                      "Dynamic sports coverage",
                    ],
                    excludes: ["Top Signal", "Top Play"],
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
                        {option.premium ? "1" : "*"}
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
    No subscription picks available for {userAccess.plan === "elite" ? "active sports" : selectedSport}.
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
        {userAccess.plan === "elite" || userAccess.plan === "admin" ? (
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
          : "Signal Detected";

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
            <section className="space-y-1.5">
              <div
                className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Sport filters"
              >
                {pulseSportFilters.map((filter) => (
                  <button
                    key={`pulse-sport-${filter.value}`}
                    type="button"
                    aria-pressed={pulseSportFilter === filter.value}
                    onClick={() => setPulseSportFilter(filter.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                      pulseSportFilter === filter.value
                        ? "border-cyan-300 bg-cyan-300 text-black"
                        : "border-white/10 bg-white/[0.04] text-white/58"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div
                className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Impact filters"
              >
                {pulseImpactFilters.map((filter) => (
                  <button
                    key={`pulse-impact-${filter.value}`}
                    type="button"
                    aria-pressed={pulseImpactFilter === filter.value}
                    onClick={() => setPulseImpactFilter(filter.value)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9.5px] font-black uppercase tracking-[0.04em] outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                      pulseImpactFilter === filter.value
                        ? "border-cyan-300/70 bg-cyan-300/14 text-cyan-200"
                        : "border-white/10 bg-white/[0.035] text-white/52"
                    }`}
                  >
                    {filter.value !== "ALL" ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          filter.value === "HIGH"
                            ? "bg-red-400"
                            : filter.value === "MEDIUM"
                            ? "bg-amber-300"
                            : "bg-emerald-300"
                        }`}
                      />
                    ) : null}
                    {filter.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Open impact filters"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-[9.5px] font-black uppercase tracking-[0.04em] text-white/52 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                  <span aria-hidden="true">⌕</span>
                  Filters
                </button>
              </div>
            </section>

            {pulseLoading ? (
              <section className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`pulse-loading-${index}`}
                    className="h-[178px] animate-pulse rounded-[20px] border border-white/10 bg-white/[0.035]"
                  />
                ))}
              </section>
            ) : filteredPulseItems.length === 0 ? (
              <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center">
                <p className="text-[15px] font-black text-white">No market-impact updates right now.</p>
                <p className="mt-1 text-[12px] font-semibold text-white/52">Atlas is still scanning.</p>
              </section>
            ) : (
              <section className="space-y-2.5">
                {filteredPulseItems.map((item) => {
                  const impactStyles = getPulseImpactClasses(item.impact);
                  const sourceCount = item.sourceCount ?? item.sources?.length ?? 1;
                  const sources = item.sources ?? [];
                  const isOddsOnlyEvent =
                    sources.length > 0 && sources.every((source) => source.provider === "OddsAPI");
                  const displaySourceCount = isOddsOnlyEvent ? 1 : sourceCount;
                  const sourceLabel = isOddsOnlyEvent ? "Atlas Market Scan" : item.source;
                  const score = item.atlasImpactScore ?? 0;
                  const scoreClasses = getAtlasImpactScoreClasses(score);
                  const scoreProgress = Math.max(0, Math.min(100, score));
                  const eventTypeLabel = item.marketMovement
                    ? "MARKET MOVEMENT"
                    : item.category.replaceAll("_", " ");
                  const subject = getTerminalEventSubject(item);
                  const eventDetail = getTerminalEventDetail(item);
                  const statusBadge = getTerminalStatusBadge(item);
                  const gameContext = getTerminalGameContext(item);
                  const atlasSummary = getTerminalAtlasSummary(item);
                  const badgeSport = getTeamBadgeSport(item.sport);
                  const markets = [
                    item.primaryMarket,
                    ...(item.otherMarkets ?? item.markets).filter((market) => market !== item.primaryMarket),
                  ].slice(0, 4);
                  const sourceDisplay = isOddsOnlyEvent
                    ? "Atlas Market Scan"
                    : displaySourceCount > 1
                    ? sources
                        .slice(0, 2)
                        .map((source) => source.name)
                        .filter(Boolean)
                        .join(" + ") || `${displaySourceCount} Sources`
                    : sourceLabel;

                  return (
                    <article
                      key={item.id}
                      className={`rounded-[16px] border px-3 py-2 ${impactStyles.card}`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          {item.marketMovement ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.07em] text-cyan-200">
                                {item.sport}
                              </span>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.07em] ${impactStyles.badge}`}>
                                {item.impact}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.045] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.07em] text-white/48">
                                {eventTypeLabel}
                              </span>
                            </div>
                          ) : null}
                          <div className={item.marketMovement ? "mt-1.5 flex items-baseline gap-2" : "flex items-baseline gap-2"}>
                            <h3 className="min-w-0 truncate text-[15px] font-black leading-tight text-white">
                              {subject}
                            </h3>
                            {statusBadge ? (
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-white/62">
                                {statusBadge}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] font-bold leading-4 text-white/66">
                            {eventDetail}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-[0.08em] text-white/38">
                            {item.sport} · {item.impact} · {eventTypeLabel} · Confidence {item.confidence}%
                          </p>
                        </div>
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border p-[2px] text-[12px] font-black ${scoreClasses}`}
                          style={{
                            background: `conic-gradient(currentColor ${scoreProgress * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                          }}
                          aria-label={`Atlas Impact ${score}`}
                        >
                          <span className="grid h-full w-full place-items-center rounded-full bg-[#07111f]">
                            {score}
                          </span>
                        </span>
                      </div>

                      {gameContext.kind === "matchup" ? (
                        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-y border-white/10 py-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <TerminalTeamMark teamName={gameContext.awayTeam} sport={badgeSport} />
                              <p className="truncate text-[11px] font-black text-white">
                                {getDisplayAbbr(gameContext.awayTeam)}
                              </p>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-300">vs</p>
                            {gameContext.timeLabel ? (
                              <p className="mt-0.5 whitespace-nowrap text-[9px] font-bold text-white/44">
                                {gameContext.timeLabel}
                              </p>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-row-reverse items-center gap-1.5">
                              <TerminalTeamMark teamName={gameContext.homeTeam} sport={badgeSport} />
                              <p className="truncate text-right text-[11px] font-black text-white">
                                {getDisplayAbbr(gameContext.homeTeam)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : gameContext.kind === "team" ? (
                        <div className="mt-1.5 flex items-center justify-between gap-2 border-y border-white/10 py-1.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <TerminalTeamMark teamName={gameContext.team} sport={badgeSport} />
                            <p className="truncate text-[11px] font-black text-white">
                              {gameContext.team}
                            </p>
                          </div>
                          {gameContext.timeLabel ? (
                            <p className="shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-white/42">
                              {gameContext.timeLabel}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1.5 rounded-[10px] border border-white/10 bg-black/18 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/42">
                          {gameContext.label}
                        </div>
                      )}

                      {item.marketMovement ? (
                        <div className="mt-1.5 grid grid-cols-[1fr_auto] items-end gap-3">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/38">
                              {item.marketMovement.marketLabel}
                            </p>
                            <p className="mt-0.5 text-[18px] font-black leading-none text-white">
                              {formatMarketMovementValue(
                                item.marketMovement.previousPoint,
                                item.marketMovement.previousPrice,
                              )}{" "}
                              <span className="text-cyan-300">↓</span>{" "}
                              {formatMarketMovementValue(
                                item.marketMovement.currentPoint,
                                item.marketMovement.currentPrice,
                              )}
                            </p>
                          </div>
                          <p className="text-right text-[9px] font-bold uppercase leading-4 tracking-[0.05em] text-white/45">
                            {item.marketMovement.sportsbookCount} Books<br />
                            {Math.round(item.marketMovement.consensusPercent * 100)}% Consensus<br />
                            {item.marketMovement.elapsedMinutes} min
                          </p>
                        </div>
                      ) : item.category === "WEATHER" ? (
                        <div className="mt-1.5 rounded-[10px] border border-white/10 bg-black/18 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/42">
                          Weather details pending
                        </div>
                      ) : null}

                      <div className="mt-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-300">
                          Atlas Summary
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10.5px] font-semibold leading-3 text-white/62">
                          {atlasSummary}
                        </p>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {markets.map((market) => (
                          <span
                            key={`${item.id}-${market}`}
                            className="rounded-full border border-cyan-300/18 bg-black/18 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.04em] text-white/52"
                          >
                            {market}
                          </span>
                        ))}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-white/10 pt-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-white/50">
                            {sourceDisplay}
                          </p>
                        </div>
                        {!isOddsOnlyEvent && sourceCount > 1 && sources.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPulseSourcesSheet({
                                title: item.title,
                                sources,
                              })
                            }
                            className="shrink-0 rounded-full border border-cyan-300/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-200"
                          >
                            Read Sources
                          </button>
                        ) : item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-full border border-cyan-300/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-200"
                          >
                            Read Source
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        ) : appSection === "challenges" ? (
          <div className="space-y-3">
            <section className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">
                Weekly Challenge Board
              </p>
              <h2 className="mt-2 text-[24px] font-black tracking-tight text-white">
                Win rewards with Signal Detected picks
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-white/62">
                Complete 7-day challenges using only public Signal Detected picks.
                Top Signal and Top Play stay locked as premium daily products.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {["7 days", "No Top 5", "Rewards"].map((item) => (
                  <div
                    key={item}
                    className="rounded-[16px] border border-white/10 bg-black/20 px-2 py-2 text-center"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              {!authSession.authenticated ? (
                <div className="mt-4 rounded-[16px] border border-cyan-400/20 bg-cyan-400/[0.08] px-4 py-3 text-center text-[12px] font-bold text-cyan-100/80">
                  Playing as Guest. Your challenge progress stays on this device.
                </div>
              ) : null}
            </section>

            {challengeError ? (
              <div className="rounded-[18px] border border-yellow-400/20 bg-yellow-500/10 p-4 text-[12px] leading-5 text-yellow-100/80">
                {challengeError}
              </div>
            ) : null}

            {challengeLoading ? (
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
                Loading challenges...
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              {challengeCards.map((challenge) => {
                const run = challengeSnapshot.runs.find(
                  (item) =>
                    item.challenge_type === challenge.type && item.status === "active"
                );
                const selected = selectedChallengePicks[challenge.type] ?? [];
                const progress = getChallengeProgress(
                  challenge.type,
                  challengeSnapshot.attempts
                );
                const wins = challengeSnapshot.attempts.filter(
                  (attempt) =>
                    attempt.challenge_type === challenge.type && attempt.status === "won"
                ).length;
                const canSubmit = selected.length === challenge.requiredPicks;

                return (
                  <article
                    key={challenge.type}
                    className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                          {challenge.difficulty}
                        </p>
                        <h3 className="mt-1 text-[20px] font-black text-white">
                          {challenge.name}
                        </h3>
                        <p className="mt-1 text-[12px] leading-5 text-white/55">
                          {challenge.description}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black text-cyan-300">
                        {wins}/{challenge.targetWins}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-7 gap-1.5">
                      {progress.map((item, index) => (
                        <div
                          key={`${challenge.type}-${index}`}
                          className={`grid h-9 place-items-center rounded-[12px] border text-[13px] font-black ${
                            item === "✓"
                              ? "border-green-400/30 bg-green-500/15 text-green-300"
                              : item === "×"
                              ? "border-red-400/30 bg-red-500/15 text-red-300"
                              : item === "…"
                              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                              : "border-white/10 bg-black/20 text-white/35"
                          }`}
                        >
                          {item}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-[18px] border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                          Select from Signal Detected
                        </p>
                        <span className="text-[10px] font-bold text-cyan-300">
                          {selected.length}/{challenge.requiredPicks}
                        </span>
                      </div>

                      <div className="mt-3 max-h-[190px] space-y-2 overflow-y-auto pr-1">
                        {challengeSnapshot.availablePicks.length === 0 ? (
                          <p className="rounded-2xl bg-white/[0.04] px-3 py-3 text-[12px] leading-5 text-white/45">
                            No Signal Detected picks are available for challenges right now.
                          </p>
                        ) : (
                          challengeSnapshot.availablePicks.map((pick) => {
                            const isSelected = selected.includes(pick.signalId);
                            const disabled =
                              !isSelected && selected.length >= challenge.requiredPicks;

                            return (
                              <button
                                key={`${challenge.type}-${pick.signalId}`}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  toggleChallengePick(challenge.type, pick.signalId)
                                }
                                className={`block w-full rounded-[16px] border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                                  isSelected
                                    ? "border-cyan-300/45 bg-cyan-400/10"
                                    : "border-white/10 bg-white/[0.035]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black text-white/55">
                                    {pick.sport}
                                  </span>
                                  <span className="text-[10px] text-white/40">
                                    {pick.startTime ? formatTime(pick.startTime) : "Time TBD"}
                                  </span>
                                </div>
                                <p className="mt-2 truncate text-[13px] font-black text-white">
                                  {pick.awayTeam} vs {pick.homeTeam}
                                </p>
                                <p className="mt-1 truncate text-[12px] font-semibold text-cyan-300">
                                  {pick.pickLabel}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[16px] border border-yellow-400/15 bg-yellow-500/[0.08] px-3 py-2">
                      <p className="text-[11px] font-bold text-yellow-100/85">
                        Prize: {challenge.prize}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-white/45">
                        Rewards never include Top Signal or Top Play.
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartChallenge(challenge.type)}
                        disabled={challengeBusy === challenge.type}
                        className="rounded-[15px] border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-3 text-[12px] font-black text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {run ? "Continue" : "Start Challenge"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmitChallengeAttempt(challenge.type)}
                        disabled={
                          challengeBusy === challenge.type ||
                          !canSubmit
                        }
                        className="rounded-[15px] bg-cyan-400 px-3 py-3 text-[12px] font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Submit Picks
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <section className="rounded-[24px] border border-purple-300/20 bg-purple-500/[0.06] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-200">
                Atlas Champion
              </p>
              <h3 className="mt-2 text-[19px] font-black text-white">
                Complete all 3 challenges in the same 7-day window
              </h3>
              <p className="mt-2 text-[12px] leading-5 text-white/58">
                Reward: Elite Pack free for 30 days across MLB, NBA, NHL, SOCCER
                and NFL. Top Signal and Top Play remain separate.
              </p>
            </section>
          </div>
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

      <nav className="sticky bottom-0 border-t border-white/10 bg-[#050816]/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 py-3 text-[11px]">
          {[
            { key: "challenges" as const, label: "Challenges" },
            { key: "news" as const, label: "Impact" },
            { key: "signals" as const, label: "Home" },
            { key: "alerts" as const, label: "Alerts" },
            { key: "more" as const, label: "More" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              onClick={() => {
                if (item.key === "signals") {
                  navigateAppState({ section: item.key, view: "live" });
                  return;
                }

                navigateAppState({ section: item.key });
              }}
              className={`flex flex-col items-center rounded-2xl px-2 font-semibold transition-all ${
                item.key === "signals" ? "-mt-2 gap-0.5 py-1" : "gap-1 py-2"
              } ${
                appSection === item.key
                  ? "bg-cyan-400/10 text-cyan-300"
                  : "text-white/45"
              }`}
            >
              <span
                className={`flex items-center justify-center overflow-hidden rounded-full text-[10px] font-black ${
                  item.key === "signals"
                    ? `h-12 w-12 border border-cyan-300/30 bg-[#020916] shadow-[0_0_20px_rgba(34,211,238,0.22)] ${
                        appSection === item.key ? "ring-2 ring-cyan-300/40" : ""
                      }`
                    : `h-6 w-6 ${
                        appSection === item.key ? "bg-cyan-400 text-black" : "bg-white/10"
                      }`
                }`}
              >
                <BottomNavIcon itemKey={item.key} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
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
