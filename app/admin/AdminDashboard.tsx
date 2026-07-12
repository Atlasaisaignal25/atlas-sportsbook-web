"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { teamBranding } from "@/app/lib/teamBranding";
import {
  OfficialSportSelectorRow,
  officialSportCodeToSelectedSport,
  officialSelectedSportToSportCode,
  type OfficialSelectedSport,
} from "@/app/components/signals/OfficialSportSelectorRow";

type StatusCounts = {
  won: number;
  lost: number;
  push: number;
  pending: number;
  other: number;
};

type SportHealth = {
  sport: string;
  today: {
    publicSignals: number;
    top5Live: number;
    top5History: number;
    topSignalHistory: number;
  };
  last7Days: {
    top5: StatusCounts;
    topSignal: StatusCounts;
  };
};

type AdminOverview = {
  success: boolean;
  generatedAt: string;
  today: string;
  adminEmail: string;
  environment: Record<string, boolean>;
  crons: Array<{ path: string; schedule: string }>;
  sports: SportHealth[];
  subscriptions: any[];
  purchases: any[];
  challenges: {
    attempts: any[];
    rewards: any[];
  };
  researchDashboard?: {
    updatedAt: string;
    games: ResearchGame[];
    errors: string[];
  };
  operations?: AdminOperations;
  errors: string[];
};

type AdminOperations = {
  generatedAt: string;
  date: string;
  league: string;
  signalsDetected: number;
  validatedPicks: number;
  topSignalPublished: boolean;
  gamesRemaining: number;
  nextGame: { startTime?: string | null; awayTeam?: string | null; homeTeam?: string | null; status?: string | null } | null;
  atlasCore: {
    overall: "HEALTHY" | "PARTIAL" | "WARNING" | "ERROR";
    research: "HEALTHY" | "PARTIAL" | "WARNING" | "ERROR";
    validation: "HEALTHY" | "PARTIAL" | "WARNING" | "ERROR";
    publishing: "HEALTHY" | "PARTIAL" | "WARNING" | "ERROR";
    learning: "HEALTHY" | "PARTIAL" | "WARNING" | "ERROR";
  };
  confirmed: number;
  pending: number;
  downgraded: number;
  removed: number;
  topSignal: any | null;
  topPicks: any[];
  pipeline: Array<{ label: string; detail: string; status: string }>;
  recentActivity: Array<{ time?: string | null; title: string; detail: string; tone: string }>;
  performance: {
    sampleSize: number;
    totalPicks: number;
    totalNoPicks: number;
    wins: number;
    losses: number;
    pushes: number;
    winRate: number | null;
    roi: number | null;
    averageClv: number | null;
    bestMarket: string | null;
    worstMarket: string | null;
    bestEdgeClassification: string | null;
    bestConviction: string | null;
    bestConfidenceBucket: string | null;
    lowSampleSize: boolean;
    calculatedAt: string | null;
  };
  learning: any[];
  database: { health: string; snapshots: number; cron: string; storage: string; warnings: string[] };
  businessSnapshot?: {
    activeSubscribers: number | null;
    topSignalPurchasesToday: number | null;
    dailyPurchasesToday: number | null;
    revenueToday: number | null;
    currency: string;
  };
};

type PerformanceSport = "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER";
type PerformanceView = "overview" | "top-signal-history" | "top5-performance" | "market-performance";
type PerformancePeriod = "this-week" | "last-7-days" | "this-month" | "last-30-days" | "season" | "year" | "all-time";

type PerformanceMetricSet = {
  graded: number;
  won: number;
  lost: number;
  push: number;
  winRate: number | null;
  units: number | null;
  roi: number | null;
  averageClv: number | null;
  averageOdds: number | null;
  lastGraded: string | null;
  sampleStatus: string;
};

type PerformanceCenterData = {
  sport: PerformanceSport;
  period: PerformancePeriod;
  lastUpdated: string;
  tables: { top5History: string | null; topSignalHistory: string | null };
  errors: string[];
  overview: PerformanceMetricSet;
  topSignalHistory: PerformanceMetricSet;
  top5Performance: PerformanceMetricSet & { byRank: Array<PerformanceMetricSet & { rank: number }> };
  marketPerformance: {
    global: Array<PerformanceMetricSet & { market: string }>;
    byProduct: {
      top5: Array<PerformanceMetricSet & { market: string }>;
      topSignal: Array<PerformanceMetricSet & { market: string }>;
    };
    marketsConfigured: string[];
    futureMarkets: string[];
  };
  totals: { top5Graded: number; topSignalGraded: number; globalGraded: number };
};

export type AtlasControlTab = "overview" | "top-signal" | "top5" | "top3" | "signals" | "activity" | "health";
export type AtlasActivityFilter = "ALL" | "TOP SIGNAL" | "TOP 5" | "EXCLUSIVE" | "SIGNALS" | "VALIDATION" | "ERRORS";
type AtlasControlSportFilter = "ALL" | string;
export type AtlasControlMode = "live" | "official";

export type AtlasControlCenterData = {
  summary: any;
  engineHealth: any[];
  topSignal: any | null;
  officialProducts?: {
    topSignal: any | null;
    premiumTop5: any[];
    exclusiveTop3: any[];
    signalsDetected: any[];
    productStatus: any;
  };
  topSignalTimeline: any[];
  top5: any;
  top5Movement: any[];
  signalsDetected: any[];
  signalsDetectedDetail?: any;
  exclusiveTop3: any;
  liveActivity: any[];
  operationsTimeline: any[];
  marketPulse?: any;
  dataSources?: string[];
  errors?: string[];
};

type ResearchGame = {
  id: string;
  header: { awayTeam: string; homeTeam: string; time: string; status: string; league: string };
  decision: any;
  officialPick: any | null;
  projection: any | null;
  market: any | null;
  teamQuality: any;
  pitchers: any;
  offense: any;
  bullpen: any;
  lineups: any;
  weather: any | null;
  park: any | null;
  gameReadiness: any;
  contextCertainty: any;
  engineStatus: Array<{ name: string; status: string; updatedAt?: string }>;
};

const envLabels: Record<string, string> = {
  nextPublicSiteUrl: "Site URL",
  supabaseUrl: "Supabase URL",
  supabaseAnonKey: "Supabase anon",
  supabaseServiceRoleKey: "Supabase service",
  stripeSecretKey: "Stripe secret",
  stripeWebhookSecret: "Stripe webhook",
  sportsDataIoKey: "SportsDataIO",
  oddsApiKey: "Odds API",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  return value.slice(0, 10);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "N/A";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date(value));
  } catch {
    return String(value).slice(0, 16);
  }
}

function fmt(value: unknown, suffix = "") {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return `${Number.isInteger(value) ? value : value.toFixed(2)}${suffix}`;
  return `${value}${suffix}`;
}

function pct(value: unknown) {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value * 100)}%`;
}

function numberPct(value: unknown) {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value)}%`;
}

function scorePct(value: unknown) {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value)}%`;
}

function decisionLabel(value: unknown) {
  const labels: Record<string, string> = {
    HOME_ML: "Home Moneyline",
    AWAY_ML: "Away Moneyline",
    LEAN_HOME: "Lean Home",
    LEAN_AWAY: "Lean Away",
    LEAN_TOTAL_UNDER: "Lean Under",
    LEAN_TOTAL_OVER: "Lean Over",
    NO_PICK: "No Pick",
  };
  return labels[String(value ?? "")] ?? fmt(value);
}

function shortTeam(name: string | undefined) {
  const parts = String(name ?? "").split(" ").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : String(name ?? "Team");
}

function money(value: unknown) {
  if (typeof value !== "number") return "N/A";
  return value > 0 ? `+${value}` : String(value);
}

function signedPct(value: unknown) {
  if (typeof value !== "number") return "N/A";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function pickText(pick: any | null | undefined) {
  if (!pick?.pick) return "No official pick";
  const odds = typeof pick.odds === "number" ? money(pick.odds) : null;
  return odds ? `${pick.pick} ${odds}` : pick.pick;
}

function stars(value: unknown) {
  if (typeof value !== "number") return "☆☆☆☆☆";
  const count = Math.max(1, Math.min(5, Math.round(value / 20)));
  return `${"★".repeat(count)}${"☆".repeat(5 - count)}`;
}

function displayDecision(value: unknown) {
  const labels: Record<string, string> = {
    HOME_ML: "Home Moneyline",
    AWAY_ML: "Away Moneyline",
    LEAN_HOME: "Lean Home",
    LEAN_AWAY: "Lean Away",
    LEAN_TOTAL_UNDER: "Lean Under",
    LEAN_TOTAL_OVER: "Lean Over",
    TOTAL_UNDER: "Total Under",
    TOTAL_OVER: "Total Over",
    NO_PICK: "No Pick",
  };
  return labels[String(value ?? "")] ?? decisionLabel(value);
}

function edgeValue(game: ResearchGame) {
  return typeof game.market?.magnitudeScore === "number" ? game.market.magnitudeScore : null;
}

function pickedTeams(game: ResearchGame) {
  const decision = String(game.decision?.decision ?? "");
  const home = shortTeam(game.header.homeTeam);
  const away = shortTeam(game.header.awayTeam);
  if (decision.includes("AWAY")) return { pick: away, other: home, pickWin: game.projection?.awayWinProbability, otherWin: game.projection?.homeWinProbability, pickMl: game.projection?.fairMoneylineAway, otherMl: game.projection?.fairMoneylineHome };
  return { pick: home, other: away, pickWin: game.projection?.homeWinProbability, otherWin: game.projection?.awayWinProbability, pickMl: game.projection?.fairMoneylineHome, otherMl: game.projection?.fairMoneylineAway };
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function availabilityLabel(value: unknown) {
  const label = String(value ?? "UNAVAILABLE").replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function technicalStatus(value: unknown): "Ready" | "Partial" | "Unavailable" {
  const upper = String(value ?? "").toUpperCase();
  if (!upper || upper.includes("UNAVAILABLE")) return "Unavailable";
  if (upper.includes("PARTIAL") || upper.includes("LOW")) return "Partial";
  return "Ready";
}

function componentStatus(value: unknown): "Positive" | "Neutral" | "Negative" | "Partial" | "Unavailable" {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper.includes("PARTIAL")) return "Partial";
    if (upper.includes("UNAVAILABLE")) return "Unavailable";
    if (upper.includes("LOW")) return "Partial";
    return "Positive";
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  if (value >= 4) return "Positive";
  if (value <= -4) return "Negative";
  return "Neutral";
}

function statusColor(status: string) {
  if (status === "Positive") return "bg-emerald-400 text-emerald-300";
  if (status === "Negative") return "bg-yellow-300 text-yellow-300";
  if (status === "Partial") return "bg-sky-400 text-sky-300";
  if (status === "Unavailable") return "bg-red-400 text-red-300";
  return "bg-slate-400 text-white/55";
}

function signalLabel(status: string) {
  if (status === "Positive") return "Supports Pick";
  if (status === "Negative") return "Against Pick";
  if (status === "Unavailable") return "Unavailable";
  return "Neutral";
}

function planLabel(value: string | null | undefined) {
  return String(value ?? "unknown").replace(/_/g, " ").toUpperCase();
}

function StatCard({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  tone?: "cyan" | "gold" | "green" | "red";
}) {
  const color =
    tone === "gold"
      ? "text-yellow-300"
      : tone === "green"
        ? "text-emerald-300"
        : tone === "red"
          ? "text-rose-300"
          : "text-cyan-300";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function ResultLine({ title, counts }: { title: string; counts: StatusCounts }) {
  const decided = counts.won + counts.lost;
  const rate = decided ? Math.round((counts.won / decided) * 100) : 0;

  return (
    <div className="rounded-xl bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/65">{title}</p>
        <p className="text-sm font-black text-cyan-300">{rate}%</p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em]">
        <span className="rounded-lg bg-emerald-400/10 py-1 text-emerald-300">
          W {counts.won}
        </span>
        <span className="rounded-lg bg-rose-400/10 py-1 text-rose-300">L {counts.lost}</span>
        <span className="rounded-lg bg-yellow-400/10 py-1 text-yellow-300">
          P {counts.push}
        </span>
        <span className="rounded-lg bg-white/10 py-1 text-white/60">N {counts.pending}</span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-0.5 text-sm font-black text-white">{String(value ?? "N/A")}</p>
    </div>
  );
}

function ResearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <h4 className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-cyan-300">{title}</h4>
      {children}
    </section>
  );
}

function SideBySide({ home, away, fields }: { home: any; away: any; fields: Array<[string, string, (value: any) => string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        ["Away", away],
        ["Home", home],
      ].map(([side, data]) => (
        <div key={String(side)} className="rounded-xl bg-black/20 p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/50">{String(side)}</p>
          <div className="grid gap-2">
            {fields.map(([label, key, render]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/50">{label}</span>
                <span className="font-black text-white">{render(data?.[key])}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function atlasBrain(game: ResearchGame) {
  const decision = game.decision?.decision ?? "NO_PICK";
  const side = game.decision?.componentBreakdown?.sideComponents ?? {};
  const total = game.decision?.componentBreakdown?.totalComponents ?? {};
  const reasons: string[] = [];

  if (game.decision?.noPick) {
    return {
      title: "No Pick",
      reasons: game.decision.noPickReasons?.length
        ? game.decision.noPickReasons
        : ["Engines disagree", "Conviction is low", "Consensus is weak"],
    };
  }

  if (Math.abs(side.projectionWinProbability ?? 0) >= 5) reasons.push(`Projection favors ${(side.projectionWinProbability ?? 0) > 0 ? shortTeam(game.header.homeTeam) : shortTeam(game.header.awayTeam)}`);
  if (Math.abs(side.pitcherQuality ?? 0) >= 5) reasons.push(`Starting pitcher advantage for ${(side.pitcherQuality ?? 0) > 0 ? shortTeam(game.header.homeTeam) : shortTeam(game.header.awayTeam)}`);
  if (Math.abs(side.bullpenQuality ?? 0) >= 5) reasons.push(`Bullpen favors ${(side.bullpenQuality ?? 0) > 0 ? shortTeam(game.header.homeTeam) : shortTeam(game.header.awayTeam)}`);
  if (Math.abs(side.offense ?? 0) >= 5) reasons.push(`Offense favors ${(side.offense ?? 0) > 0 ? shortTeam(game.header.homeTeam) : shortTeam(game.header.awayTeam)}`);
  if (Math.abs(side.offense ?? 0) < 5) reasons.push("Offense is neutral");
  if (Math.abs(total.weatherRunEnvironment ?? 0) < 3) reasons.push("Weather neutral");
  if (!reasons.length) reasons.push("No dominant module advantage is present.");

  return { title: decision, reasons };
}

function motorSignals(game: ResearchGame) {
  const side = game.decision?.componentBreakdown?.sideComponents ?? {};
  const total = game.decision?.componentBreakdown?.totalComponents ?? {};
  return [
    { name: "Projection", status: componentStatus(side.projectionWinProbability) },
    { name: "Starting Pitcher", status: componentStatus(side.pitcherQuality) },
    { name: "Offense", status: componentStatus(side.offense) },
    { name: "Bullpen", status: componentStatus(side.bullpenQuality) },
    { name: "Lineups", status: componentStatus(game.lineups?.home?.confirmed || game.lineups?.away?.confirmed ? "AVAILABLE" : game.lineups?.home?.stability) },
    { name: "Weather", status: componentStatus(total.weatherRunEnvironment) },
    { name: "Park", status: componentStatus(total.parkEnvironment) },
    { name: "Market", status: game.market ? "Positive" : "Unavailable" },
    { name: "Decision", status: game.decision?.noPick ? "Neutral" : componentStatus(game.decision?.confidence) },
  ];
}

function MetricGrid({ items }: { items: Array<[string, unknown, ("cyan" | "white" | "green" | "gold" | "red")?]> }) {
  return (
    <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value, tone = "white"]) => {
        const color =
          tone === "cyan"
            ? "text-cyan-300"
            : tone === "green"
              ? "text-emerald-300"
              : tone === "gold"
                ? "text-yellow-300"
                : tone === "red"
                  ? "text-rose-300"
                  : "text-white";
        return (
          <div key={label} className="border-b border-white/10 pb-1.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p>
            <p className={`mt-0.5 text-sm font-black ${color}`}>{fmt(value)}</p>
          </div>
        );
      })}
    </div>
  );
}

function SystemSection({
  index,
  title,
  children,
  version,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
  version?: unknown;
}) {
  return (
    <details open className="rounded-xl border border-white/10 bg-[#071322]/85">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-white/70">{index}.</span>
          <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{title}</h4>
          {version ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black text-white/45">
              {String(version)}
            </span>
          ) : null}
        </div>
        <span className="text-white/55">⌃</span>
      </summary>
      <div className="border-t border-white/10 px-3 py-2.5">{children}</div>
    </details>
  );
}

function TeamTechnicalPanel({
  label,
  team,
  items,
}: {
  label: string;
  team: string;
  items: Array<[string, unknown]>;
}) {
  return (
    <div className="rounded-xl bg-black/20 p-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{label}</p>
      <h5 className="mt-0.5 text-sm font-black text-white">{team}</h5>
      <div className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
        {items.map(([itemLabel, value]) => (
          <div key={itemLabel} className="flex items-center justify-between gap-3 border-b border-white/10 pb-1 text-xs">
            <span className="text-white/45">{itemLabel}</span>
            <span className="font-black text-white">{fmt(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function collectSystemWarnings(game: ResearchGame) {
  const warnings = new Set<string>();
  if (!game.projection || technicalStatus(game.projection.availability) === "Unavailable") warnings.add("Projection unavailable");
  if (!game.weather || technicalStatus(game.weather.availability) === "Unavailable") warnings.add("Weather unavailable");
  if (technicalStatus(game.lineups?.home?.stability) !== "Ready") warnings.add(`${shortTeam(game.header.homeTeam)} lineup ${availabilityLabel(game.lineups?.home?.stability)}`);
  if (technicalStatus(game.lineups?.away?.stability) !== "Ready") warnings.add(`${shortTeam(game.header.awayTeam)} lineup ${availabilityLabel(game.lineups?.away?.stability)}`);
  if (!game.pitchers?.home?.name) warnings.add(`${shortTeam(game.header.homeTeam)} starter unavailable`);
  if (!game.pitchers?.away?.name) warnings.add(`${shortTeam(game.header.awayTeam)} starter unavailable`);
  for (const warning of [
    ...asList(game.gameReadiness?.homeWarnings),
    ...asList(game.gameReadiness?.awayWarnings),
    ...asList(game.contextCertainty?.warnings),
  ]) warnings.add(warning);
  return Array.from(warnings);
}

function collectTimeline(game: ResearchGame) {
  const rows = [
    game.decision?.updatedAt ? { time: game.decision.updatedAt, label: "Decision updated", detail: decisionLabel(game.decision.decision) } : null,
    game.projection?.updatedAt ? { time: game.projection.updatedAt, label: "Projection updated", detail: `Total ${fmt(game.projection.totalRuns)}` } : null,
    game.pitchers?.home?.updatedAt ? { time: game.pitchers.home.updatedAt, label: `${shortTeam(game.header.homeTeam)} starter snapshot`, detail: fmt(game.pitchers.home.name) } : null,
    game.pitchers?.away?.updatedAt ? { time: game.pitchers.away.updatedAt, label: `${shortTeam(game.header.awayTeam)} starter snapshot`, detail: fmt(game.pitchers.away.name) } : null,
    game.lineups?.home?.updatedAt ? { time: game.lineups.home.updatedAt, label: `${shortTeam(game.header.homeTeam)} lineup snapshot`, detail: availabilityLabel(game.lineups.home.stability) } : null,
    game.lineups?.away?.updatedAt ? { time: game.lineups.away.updatedAt, label: `${shortTeam(game.header.awayTeam)} lineup snapshot`, detail: availabilityLabel(game.lineups.away.stability) } : null,
    game.weather?.updatedAt ? { time: game.weather.updatedAt, label: "Weather updated", detail: availabilityLabel(game.weather.availability) } : null,
  ].filter(Boolean) as Array<{ time: string; label: string; detail: string }>;

  const unique = new Map<string, { time: string; label: string; detail: string }>();
  for (const row of rows) unique.set(`${row.time}:${row.label}`, row);
  return Array.from(unique.values()).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function engineContribution(game: ResearchGame) {
  const side = game.decision?.componentBreakdown?.sideComponents ?? {};
  const total = game.decision?.componentBreakdown?.totalComponents ?? {};
  const contributionRows = [
    { name: "Projection", score: side.projectionWinProbability, status: game.projection?.availability, confidence: game.projection?.confidence },
    { name: "Pitcher", score: side.pitcherQuality, status: game.pitchers?.home?.name || game.pitchers?.away?.name ? "AVAILABLE" : "UNAVAILABLE", confidence: game.pitchers?.home?.confidence ?? game.pitchers?.away?.confidence },
    { name: "Offense", score: side.offense, status: game.offense?.home?.availability ?? game.offense?.away?.availability, confidence: game.teamQuality?.home?.confidence ?? game.teamQuality?.away?.confidence },
    { name: "Bullpen", score: side.bullpenQuality, status: game.bullpen?.home?.availability ?? game.bullpen?.away?.availability, confidence: game.bullpen?.home?.confidence ?? game.bullpen?.away?.confidence },
    { name: "Team Quality", score: side.teamQuality, status: game.teamQuality?.home?.availability ?? game.teamQuality?.away?.availability, confidence: game.teamQuality?.home?.confidence ?? game.teamQuality?.away?.confidence },
    { name: "Lineups", score: null, status: game.lineups?.home?.stability ?? game.lineups?.away?.stability, confidence: null },
    { name: "Weather", score: total.weatherRunEnvironment, status: game.weather?.availability, confidence: null },
    { name: "Park", score: total.parkEnvironment, status: game.park?.availability, confidence: null },
    { name: "Market", score: game.market?.magnitudeScore, status: game.market ? "AVAILABLE" : "UNAVAILABLE", confidence: game.market?.consensusPercent },
    { name: "Decision", score: game.decision?.confidence, status: game.decision?.confidenceTier, confidence: game.decision?.confidence },
  ];
  return contributionRows;
}

function SummaryGameCard({
  game,
  onSystem,
}: {
  game: ResearchGame;
  onSystem: (gameId: string) => void;
}) {
  const brain = atlasBrain(game);
  const motors = motorSignals(game);
  const homeName = shortTeam(game.header.homeTeam);
  const awayName = shortTeam(game.header.awayTeam);
  const picked = pickedTeams(game);
  const edge = edgeValue(game);
  const noPick = Boolean(game.decision?.noPick);
  return (
    <details className="rounded-2xl border border-cyan-400/15 bg-[#071120] shadow-[0_0_24px_rgba(0,220,255,0.055)]">
      <summary className="cursor-pointer list-none p-3.5 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <p className="text-xs text-white/55">{game.header.awayTeam}</p>
              <h3 className="text-xl font-black text-white">{awayName}</h3>
            </div>
            <div className="text-left sm:text-center">
              <p className="text-sm font-black text-white/60">@</p>
              <p className="text-xs text-white/45">{formatTime(game.header.time)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-white/55">{game.header.homeTeam}</p>
              <h3 className="text-xl font-black text-white">{homeName}</h3>
            </div>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-black/20 lg:w-[420px]">
            <div className="border-r border-white/10 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Decision</p>
              <p className="mt-1 text-sm font-black text-cyan-300">{displayDecision(game.decision?.decision)}</p>
            </div>
            <div className="border-r border-white/10 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Confidence</p>
              <p className="mt-1 text-lg font-black text-white">{scorePct(game.decision?.confidence)}</p>
            </div>
            <div className="p-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Conviction</p>
              <p className="mt-1 text-sm font-black text-white">{fmt(game.decision?.conviction)}</p>
            </div>
          </div>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-white/10 p-3.5 sm:p-4">
        <section className="rounded-2xl border border-cyan-400/15 bg-black/25 p-3.5">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
                {noPick ? "Research No Pick" : "Research Decision"}
              </p>
              <h4 className="mt-1 text-3xl font-black tracking-tight text-white">
                {displayDecision(game.decision?.decision)}
              </h4>
              <p className="mt-1 text-lg text-yellow-300">{stars(game.decision?.confidence)}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Confidence</p>
                <p className="text-2xl font-black text-white">{scorePct(game.decision?.confidence)}</p>
                <p className="text-[11px] font-bold uppercase text-cyan-300">{fmt(game.decision?.confidenceTier)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Conviction</p>
                <p className="text-2xl font-black text-white">{fmt(game.decision?.convictionScore)}</p>
                <p className="text-[11px] font-bold uppercase text-cyan-300">{fmt(game.decision?.conviction)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Edge</p>
                <p className="text-2xl font-black text-emerald-300">{signedPct(edge)}</p>
                <p className="text-[11px] font-bold uppercase text-white/45">No Pick {noPick ? "Yes" : "No"}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/15 bg-cyan-950/10 p-3.5">
          <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr] sm:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
                Official Published Pick
              </p>
              <h4 className="mt-1 text-2xl font-black text-white">{pickText(game.officialPick)}</h4>
              <p className="mt-1 text-xs font-bold uppercase text-white/45">
                Source: public.atlas_core_mlb_picks
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniMetric label="Rank" value={game.officialPick?.rank ? `#${game.officialPick.rank}` : "N/A"} />
              <MiniMetric label="Status" value={game.officialPick?.status ?? "N/A"} />
              <MiniMetric label="Top Signal" value={game.officialPick?.isTopSignal ? "Yes" : "No"} />
            </div>
          </div>
        </section>

        {edge !== null ? (
          <section className="grid gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-950/10 p-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Atlas</p>
              <p className="text-xl font-black text-white">{pct(picked.pickWin)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Market</p>
              <p className="text-xl font-black text-white">{game.market?.consensusPercent ? numberPct(game.market.consensusPercent) : "N/A"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Edge</p>
              <p className="text-2xl font-black text-emerald-300">{signedPct(edge)}</p>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <h4 className="text-sm font-black text-white">
            Atlas Brain
          </h4>
          <p className="mt-0.5 text-xs font-bold text-cyan-300">
            {game.decision?.noPick ? "Why Atlas passed" : "Why Atlas reached this decision"}
          </p>
          <div className="mt-2 grid gap-1.5">
            {brain.reasons.map((reason: string, index: number) => (
              <p key={`${reason}-${index}`} className="text-sm leading-5 text-white/75">
                <span className={reason.toLowerCase().includes("neutral") ? "text-white/45" : "text-emerald-300"}>
                  {reason.toLowerCase().includes("neutral") ? "−" : "✓"}
                </span>{" "}
                {reason}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <h4 className="text-sm font-black text-white">Quick Projection</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Projected Score</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <p className="text-sm text-white/55">{homeName}<span className="block text-2xl font-black text-white">{fmt(game.projection?.homeRuns)}</span></p>
                <p className="text-sm text-white/55">{awayName}<span className="block text-2xl font-black text-white">{fmt(game.projection?.awayRuns)}</span></p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Projected Total</p>
              <p className="mt-1 text-3xl font-black text-cyan-300">{fmt(game.projection?.totalRuns)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Win Probability</p>
              <p className="mt-1 text-sm text-white/55">{picked.pick} <span className="font-black text-emerald-300">{pct(picked.pickWin)}</span></p>
              <p className="text-sm text-white/55">{picked.other} <span className="font-black text-white">{pct(picked.otherWin)}</span></p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Fair Moneyline</p>
              <p className="mt-1 text-sm text-white/55">{picked.pick} <span className="font-black text-emerald-300">{money(picked.pickMl)}</span></p>
              <p className="text-sm text-white/55">{picked.other} <span className="font-black text-white">{money(picked.otherMl)}</span></p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <h4 className="text-sm font-black text-white">Motor Signals</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {motors.map((motor) => {
              const color = statusColor(motor.status);
              return (
                <div key={motor.name} className="flex items-center gap-2 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${color.split(" ")[0]}`} />
                  <span>
                    <span className="block font-bold text-white/85">{motor.name}</span>
                    <span className={`text-[11px] font-bold ${color.split(" ")[1]}`}>{signalLabel(motor.status)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
          <h4 className="text-sm font-black text-white">Readiness</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Home Game Readiness" value={fmt(game.gameReadiness.home)} />
            <MiniMetric label="Away Game Readiness" value={fmt(game.gameReadiness.away)} />
            <MiniMetric label="Context Certainty" value={fmt(game.contextCertainty.score)} />
          </div>
        </section>

        <button
          type="button"
          onClick={() => onSystem(game.id)}
          className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-3.5 py-3 text-left text-xs font-black uppercase tracking-[0.16em] text-cyan-300"
        >
          View System Details →
        </button>
      </div>
    </details>
  );
}

function ResearchGameCard({ game }: { game: ResearchGame }) {
  const warnings = collectSystemWarnings(game);
  const timeline = collectTimeline(game);
  const contributions = engineContribution(game);
  const homeName = shortTeam(game.header.homeTeam);
  const awayName = shortTeam(game.header.awayTeam);

  return (
    <details className="rounded-2xl border border-cyan-400/15 bg-[#06101d] shadow-[0_0_24px_rgba(0,220,255,0.055)]">
      <summary className="cursor-pointer list-none p-3.5 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
              {game.header.league} System Snapshot
            </p>
            <h3 className="mt-1 text-xl font-black text-white">
              {game.header.awayTeam} @ {game.header.homeTeam}
            </h3>
            <p className="mt-0.5 text-xs text-white/45">
              {formatTime(game.header.time)} · {game.header.status} · Game ID {game.id}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:min-w-[420px]">
            <MiniMetric label="Research Decision" value={decisionLabel(game.decision?.decision)} />
            <MiniMetric label="Confidence" value={scorePct(game.decision?.confidence)} />
            <MiniMetric label="Official Pick" value={pickText(game.officialPick)} />
          </div>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-white/10 p-3.5 sm:p-4 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-2.5">
          <SystemSection index={1} title="Game Header">
            <MetricGrid
              items={[
                ["Away Team", game.header.awayTeam],
                ["Home Team", game.header.homeTeam],
                ["Hora", formatTime(game.header.time)],
                ["Estado", game.header.status],
                ["Game ID", game.id],
                ["Snapshot actualizado", formatTime(game.decision?.updatedAt), "cyan"],
              ]}
            />
          </SystemSection>

          <SystemSection index={2} title="Atlas Decision Engine" version={game.decision?.engineVersion}>
            <MetricGrid
              items={[
                ["Research Decision", game.decision?.decision, "cyan"],
                ["Consensus", game.decision?.consensus],
                ["Consensus Score", game.decision?.consensusScore],
                ["Conviction", game.decision?.conviction],
                ["Conviction Score", game.decision?.convictionScore],
                ["Confidence", scorePct(game.decision?.confidence), "cyan"],
                ["No Pick", game.decision?.noPick ? "Yes" : "No"],
                ["Reason", game.decision?.noPickReasons?.join(", ") || "N/A"],
                ["Updated At", formatTime(game.decision?.updatedAt)],
              ]}
            />
          </SystemSection>

          <SystemSection index={3} title="Official Published Pick" version={game.officialPick?.source}>
            <MetricGrid
              items={[
                ["Pick", pickText(game.officialPick), "cyan"],
                ["Market", game.officialPick?.market],
                ["Direction", game.officialPick?.direction],
                ["Line", game.officialPick?.line ?? "N/A"],
                ["Odds", game.officialPick?.odds ? money(game.officialPick.odds) : "N/A"],
                ["Rank", game.officialPick?.rank ? `#${game.officialPick.rank}` : "N/A"],
                ["Top Signal", game.officialPick?.isTopSignal ? "Yes" : "No"],
                ["Status", game.officialPick?.status],
                ["Edge", game.officialPick?.edge !== null && game.officialPick?.edge !== undefined ? signedPct(game.officialPick.edge * 100) : "N/A", "green"],
                ["Published", formatTime(game.officialPick?.publishedAt)],
              ]}
            />
          </SystemSection>

          <SystemSection index={4} title="Sports Projection" version={game.projection?.modelVersion}>
            <MetricGrid
              items={[
                ["Projected Home Runs", game.projection?.homeRuns],
                ["Projected Away Runs", game.projection?.awayRuns],
                ["Projected Total", game.projection?.totalRuns, "cyan"],
                ["Home Win Probability", pct(game.projection?.homeWinProbability), "green"],
                ["Away Win Probability", pct(game.projection?.awayWinProbability), "green"],
                ["Fair Moneyline Home", money(game.projection?.fairMoneylineHome)],
                ["Fair Moneyline Away", money(game.projection?.fairMoneylineAway)],
                ["Projection Confidence", scorePct(game.projection?.confidence)],
                ["Availability", availabilityLabel(game.projection?.availability)],
                ["Updated At", formatTime(game.projection?.updatedAt)],
              ]}
            />
          </SystemSection>

          {game.market ? (
            <SystemSection index={5} title="Market">
              <MetricGrid
                items={[
                  ["Market Moneyline", "N/A"],
                  ["Market No-Vig Probability", game.market.consensusPercent ? numberPct(game.market.consensusPercent) : "N/A"],
                  ["Atlas Fair Moneyline", `${homeName} ${money(game.projection?.fairMoneylineHome)} · ${awayName} ${money(game.projection?.fairMoneylineAway)}`],
                  ["Edge existente", game.market.magnitudeScore ? numberPct(game.market.magnitudeScore) : "N/A", "cyan"],
                  ["Market Timestamp", formatTime(game.decision?.updatedAt)],
                ]}
              />
            </SystemSection>
          ) : null}

          <SystemSection index={6} title="Team Quality">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={game.header.homeTeam}
                items={[
                  ["Team Quality", game.teamQuality?.home?.score],
                  ["Confidence", game.teamQuality?.home?.confidence],
                  ["Availability", availabilityLabel(game.teamQuality?.home?.availability)],
                  ["Coverage", game.teamQuality?.home?.coverage],
                  ["Version", game.teamQuality?.home?.version],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={game.header.awayTeam}
                items={[
                  ["Team Quality", game.teamQuality?.away?.score],
                  ["Confidence", game.teamQuality?.away?.confidence],
                  ["Availability", availabilityLabel(game.teamQuality?.away?.availability)],
                  ["Coverage", game.teamQuality?.away?.coverage],
                  ["Version", game.teamQuality?.away?.version],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={7} title="Starting Pitchers">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={fmt(game.pitchers?.home?.name)}
                items={[
                  ["Probable / Confirmed", game.pitchers?.home?.status],
                  ["Pitcher Quality", game.pitchers?.home?.quality],
                  ["Pitcher Readiness", game.pitchers?.home?.readiness],
                  ["Confidence", game.pitchers?.home?.confidence],
                  ["Baseline Version", game.pitchers?.home?.baselineVersion],
                  ["Updated At", formatTime(game.pitchers?.home?.updatedAt)],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={fmt(game.pitchers?.away?.name)}
                items={[
                  ["Probable / Confirmed", game.pitchers?.away?.status],
                  ["Pitcher Quality", game.pitchers?.away?.quality],
                  ["Pitcher Readiness", game.pitchers?.away?.readiness],
                  ["Confidence", game.pitchers?.away?.confidence],
                  ["Baseline Version", game.pitchers?.away?.baselineVersion],
                  ["Updated At", formatTime(game.pitchers?.away?.updatedAt)],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={8} title="Offense">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={game.header.homeTeam}
                items={[
                  ["Offensive Score", game.offense?.home?.score],
                  ["Last 7", game.offense?.home?.last7],
                  ["Last 14", game.offense?.home?.last14],
                  ["Last 30", game.offense?.home?.last30],
                  ["Availability", availabilityLabel(game.offense?.home?.availability)],
                  ["Sample Quality", game.offense?.home?.sampleQuality],
                  ["Version", game.offense?.home?.version],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={game.header.awayTeam}
                items={[
                  ["Offensive Score", game.offense?.away?.score],
                  ["Last 7", game.offense?.away?.last7],
                  ["Last 14", game.offense?.away?.last14],
                  ["Last 30", game.offense?.away?.last30],
                  ["Availability", availabilityLabel(game.offense?.away?.availability)],
                  ["Sample Quality", game.offense?.away?.sampleQuality],
                  ["Version", game.offense?.away?.version],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={9} title="Bullpen">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={game.header.homeTeam}
                items={[
                  ["Bullpen Quality", game.bullpen?.home?.quality],
                  ["Bullpen Fatigue", game.bullpen?.home?.fatigue],
                  ["Effective Depth", game.bullpen?.home?.effectiveDepth],
                  ["Confidence", game.bullpen?.home?.confidence],
                  ["Availability", availabilityLabel(game.bullpen?.home?.availability)],
                  ["Version", game.bullpen?.home?.version],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={game.header.awayTeam}
                items={[
                  ["Bullpen Quality", game.bullpen?.away?.quality],
                  ["Bullpen Fatigue", game.bullpen?.away?.fatigue],
                  ["Effective Depth", game.bullpen?.away?.effectiveDepth],
                  ["Confidence", game.bullpen?.away?.confidence],
                  ["Availability", availabilityLabel(game.bullpen?.away?.availability)],
                  ["Version", game.bullpen?.away?.version],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={10} title="Lineups">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={game.header.homeTeam}
                items={[
                  ["Confirmed", game.lineups?.home?.confirmed === null || game.lineups?.home?.confirmed === undefined ? "N/A" : game.lineups.home.confirmed ? "Yes" : "No"],
                  ["Player Count", game.lineups?.home?.playerCount],
                  ["Stability", game.lineups?.home?.stability],
                  ["Lineup Changes", game.lineups?.home?.changes],
                  ["Late Scratches", game.lineups?.home?.lateScratches],
                  ["Updated At", formatTime(game.lineups?.home?.updatedAt)],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={game.header.awayTeam}
                items={[
                  ["Confirmed", game.lineups?.away?.confirmed === null || game.lineups?.away?.confirmed === undefined ? "N/A" : game.lineups.away.confirmed ? "Yes" : "No"],
                  ["Player Count", game.lineups?.away?.playerCount],
                  ["Stability", game.lineups?.away?.stability],
                  ["Lineup Changes", game.lineups?.away?.changes],
                  ["Late Scratches", game.lineups?.away?.lateScratches],
                  ["Updated At", formatTime(game.lineups?.away?.updatedAt)],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={11} title="Weather and Park">
            <MetricGrid
              items={[
                ["Temperature", game.weather?.temperature ? `${game.weather.temperature} F` : "N/A"],
                ["Humidity", game.weather?.humidity ? numberPct(game.weather.humidity) : "N/A"],
                ["Wind", game.weather?.wind],
                ["Precipitation", game.weather?.precipitation ? numberPct(game.weather.precipitation) : "N/A"],
                ["Delay Risk", game.weather?.delayRisk],
                ["Weather Run Environment", game.weather?.runEnvironment, "cyan"],
                ["Roof Status", game.weather?.roofStatus],
                ["Park Environment", game.park?.environment],
                ["Availability", availabilityLabel(game.weather?.availability)],
                ["Updated At", formatTime(game.weather?.updatedAt)],
              ]}
            />
          </SystemSection>

          <SystemSection index={12} title="Game Readiness">
            <div className="grid gap-3 md:grid-cols-2">
              <TeamTechnicalPanel
                label="Home"
                team={game.header.homeTeam}
                items={[
                  ["Score", game.gameReadiness?.home],
                  ["Availability", availabilityLabel(game.gameReadiness?.availability)],
                  ["Confidence", game.gameReadiness?.homeConfidence],
                  ["Reasons", asList(game.gameReadiness?.homeReasons).join(", ") || "N/A"],
                  ["Warnings", asList(game.gameReadiness?.homeWarnings).join(", ") || "N/A"],
                ]}
              />
              <TeamTechnicalPanel
                label="Away"
                team={game.header.awayTeam}
                items={[
                  ["Score", game.gameReadiness?.away],
                  ["Availability", availabilityLabel(game.gameReadiness?.availability)],
                  ["Confidence", game.gameReadiness?.awayConfidence],
                  ["Reasons", asList(game.gameReadiness?.awayReasons).join(", ") || "N/A"],
                  ["Warnings", asList(game.gameReadiness?.awayWarnings).join(", ") || "N/A"],
                ]}
              />
            </div>
          </SystemSection>

          <SystemSection index={13} title="Context Certainty">
            <MetricGrid
              items={[
                ["Score", game.contextCertainty?.score],
                ["Confidence", game.contextCertainty?.confidence],
                ["Availability", availabilityLabel(game.contextCertainty?.availability)],
                ["Missing Modules", asList(game.contextCertainty?.missingModules).join(", ") || "None"],
                ["Warnings", asList(game.contextCertainty?.warnings).join(", ") || "None"],
              ]}
            />
          </SystemSection>
        </div>

        <aside className="grid content-start gap-2.5">
          <SystemSection index={14} title="Engine Contribution">
            <div className="grid gap-3">
              {contributions.map((item) => {
                const numericScore = typeof item.score === "number" ? Math.min(100, Math.max(0, Math.abs(item.score))) : null;
                return (
                  <div key={item.name} className="grid gap-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-white/75">{item.name}</span>
                      <span className="font-black text-cyan-300">
                        {numericScore === null ? technicalStatus(item.status) : fmt(item.score)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: `${numericScore ?? (technicalStatus(item.status) === "Ready" ? 70 : technicalStatus(item.status) === "Partial" ? 42 : 12)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">
                      <span>{technicalStatus(item.status)}</span>
                      <span>{fmt(item.confidence)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SystemSection>

          <SystemSection index={15} title="Engine Status">
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[1fr_0.8fr_0.9fr] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/40">
                <span>Engine</span>
                <span>Status</span>
                <span>Last Update</span>
              </div>
              {game.engineStatus.map((engine) => (
                <div key={engine.name} className="grid grid-cols-[1fr_0.8fr_0.9fr] gap-2 border-b border-white/5 px-3 py-2 text-xs last:border-b-0">
                  <span className="font-bold text-white/75">{engine.name}</span>
                  <span className="font-black text-cyan-300">{technicalStatus(engine.status)}</span>
                  <span className="text-white/45">{formatTime(engine.updatedAt)}</span>
                </div>
              ))}
            </div>
          </SystemSection>

          {warnings.length ? (
            <SystemSection index={16} title="Warnings">
              <div className="grid gap-2">
                {warnings.map((warning) => (
                  <p key={warning} className="rounded-xl bg-yellow-400/10 px-3 py-2 text-xs font-bold text-yellow-100">
                    {warning}
                  </p>
                ))}
              </div>
            </SystemSection>
          ) : null}

          {timeline.length >= 2 ? (
            <SystemSection index={17} title="Timeline">
              <div className="grid gap-3">
                {timeline.slice(0, 8).map((item) => (
                  <div key={`${item.time}-${item.label}`} className="border-l border-cyan-300/30 pl-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-300">{formatTime(item.time)}</p>
                    <p className="text-sm font-black text-white">{item.label}</p>
                    <p className="text-xs text-white/45">{item.detail}</p>
                  </div>
                ))}
              </div>
            </SystemSection>
          ) : null}
        </aside>
      </div>
    </details>
  );
}

type AdminSection = "control" | "operations" | "research" | "performance" | "more";

function AtlasAdminLogo() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <img src="/icon.png" alt="" className="h-6 w-6 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.30)]" />
      <div className="leading-none">
        <p className="text-[21px] font-black uppercase tracking-[0.24em] text-white">Atlas</p>
        <p className="-mt-0.5 text-center text-[8px] font-black uppercase tracking-[0.26em] text-white/72">Admin</p>
      </div>
    </div>
  );
}

function formatAdminTime(value?: string | null) {
  if (!value) return "N/A";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date(value));
  } catch {
    return String(value).slice(11, 16);
  }
}

function formatAdminDate(value?: string | null) {
  if (!value) return "Date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function adminNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatAdminOdds(value: unknown) {
  const odds = adminNumber(value);
  if (odds === null) return "";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatAdminEdge(value: unknown) {
  const edge = adminNumber(value);
  if (edge === null) return "N/A";
  return `${(edge * 100).toFixed(2)}%`;
}

function adminMarketLabel(value: unknown) {
  const market = String(value ?? "").toLowerCase();
  if (market === "h2h") return "ML";
  if (market === "spreads") return "SPREADS";
  if (market === "totals") return "TOTALS";
  return String(value ?? "N/A").toUpperCase();
}

function normalizeAdminTeam(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const adminTeamBrandingLookup = Object.entries(teamBranding).reduce(
  (lookup, [name, brand]) => {
    lookup[normalizeAdminTeam(name)] = { name, ...brand };
    lookup[normalizeAdminTeam(brand.shortName)] = { name, ...brand };
    lookup[normalizeAdminTeam(brand.abbr)] = { name, ...brand };
    return lookup;
  },
  {} as Record<string, { name: string; shortName: string; abbr: string; logo: string }>
);

function adminPickTeamName(pick: any) {
  const rawPick = String(pick?.pick ?? "");
  const candidates = [rawPick, pick?.home_team, pick?.away_team].filter(Boolean);
  for (const entry of candidates) {
    const normalized = normalizeAdminTeam(entry);
    const direct = adminTeamBrandingLookup[normalized];
    if (direct) return direct.name;
    const contained = Object.values(adminTeamBrandingLookup).find((brand) => normalized.includes(normalizeAdminTeam(brand.name)) || normalized.includes(normalizeAdminTeam(brand.shortName)));
    if (contained) return contained.name;
  }
  return rawPick.replace(/\s\([^)]+\)|\sML$/g, "") || shortTeam(pick?.home_team);
}

function adminTeamBrand(teamName: unknown) {
  return adminTeamBrandingLookup[normalizeAdminTeam(teamName)];
}

function AdminTeamLogo({ team, className = "" }: { team: unknown; className?: string }) {
  const brand = adminTeamBrand(team);
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(brand?.logo && !failed);
  return (
    <span className={`grid place-items-center rounded-xl border border-white/10 bg-white/[0.035] ${className}`}>
      {showLogo && brand?.logo ? <img src={brand.logo} alt="" className="h-full w-full object-contain p-1" onError={() => setFailed(true)} /> : <span className="text-[13px] font-black text-sky-300">{shortTeam(String(team ?? "")).slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

function AdminShellCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[12px] border border-slate-600/45 bg-[linear-gradient(145deg,rgba(10,25,44,0.86),rgba(4,10,21,0.94))] ${className}`}>
      {children}
    </section>
  );
}

function OperationMetricCard({ label, value, sub, tone = "cyan" }: { label: string; value: string | number; sub?: string; tone?: "cyan" | "green" | "purple" | "white" }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "purple" ? "text-purple-300" : tone === "white" ? "text-white" : "text-sky-400";
  return (
    <AdminShellCard className="min-h-[64px] px-1 py-2 text-center">
      <p className="text-[8px] font-black uppercase leading-[1.05] text-white/88 sm:text-[10px]">{label}</p>
      <p className={`mt-1 text-[23px] font-black leading-none ${color}`}>{value}</p>
      {sub ? <p className={`mt-1 text-[8px] font-black uppercase ${color}`}>{sub}</p> : null}
    </AdminShellCard>
  );
}

function AdminStatusPill({ status }: { status?: string | null }) {
  const value = String(status ?? "PENDING").toUpperCase();
  const classes =
    value === "CONFIRMED" || value === "VALIDATED"
      ? "border-emerald-400/20 bg-emerald-400/14 text-emerald-300"
      : value === "DOWNGRADED" || value === "REMOVED"
        ? "border-red-400/20 bg-red-400/14 text-red-300"
        : "border-yellow-400/20 bg-yellow-400/12 text-yellow-300";
  return <span className={`rounded-[5px] border px-1.5 py-0.5 text-[8px] font-black uppercase sm:text-[9px] ${classes}`}>{value}</span>;
}

function AdminTopSignalCard({ operations }: { operations?: AdminOperations }) {
  const top = operations?.topSignal;
  const teamName = top ? adminPickTeamName(top) : null;
  return (
    <AdminShellCard className="border-purple-400/55 p-2.5 shadow-[0_0_0_1px_rgba(168,85,247,0.15)]">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[17px] font-black uppercase tracking-[-0.01em] text-white">Top Signal</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">Open Analysis →</button>
      </div>
      {top ? (
        <>
          <div className="grid grid-cols-[48px_1fr_auto] items-center gap-2.5 border-b border-white/10 py-2.5">
            <AdminTeamLogo team={teamName} className="h-11 w-11" />
            <div className="min-w-0">
              <p className="truncate text-[20px] font-black leading-tight text-white">{teamName}</p>
              <p className="mt-0.5 text-[13px] font-black uppercase text-sky-400">{adminMarketLabel(top.market)} {top.line ? `${Number(top.line) > 0 ? "+" : ""}${top.line}` : formatAdminOdds(top.odds)}</p>
            </div>
            <AdminStatusPill status={top.status} />
          </div>
          <div className="grid grid-cols-4 gap-2 border-b border-white/10 py-2">
            <MiniAdminStat label="Confidence" value={numberPct(top.confidence)} />
            <MiniAdminStat label="Edge" value={formatAdminEdge(top.edge)} />
            <MiniAdminStat label="Published" value={formatAdminTime(top.published_at)} />
            <MiniAdminStat label="Market" value={adminMarketLabel(top.market)} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[9px] font-black uppercase text-white/40">Atlas Confidence</span>
            <span className="text-[14px] font-black tracking-[0.08em] text-yellow-300">{adminConfidenceStars(top.confidence)}</span>
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-sm font-bold text-white/50">No Top Signal published yet.</div>
      )}
    </AdminShellCard>
  );
}

function MiniAdminStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-white/38">{label}</p>
      <p className="mt-0.5 text-[14px] font-black text-white">{value}</p>
    </div>
  );
}

function adminConfidenceStars(value: unknown) {
  const confidence = adminNumber(value) ?? 0;
  const count = confidence >= 90 ? 5 : confidence >= 80 ? 4 : confidence >= 70 ? 3 : confidence >= 60 ? 2 : 1;
  return "★★★★★".slice(0, count).padEnd(5, "☆");
}

function adminMarketTag(value: unknown) {
  const label = adminMarketLabel(value);
  if (label === "ML") return { label: "ML", className: "border-cyan-300/20 bg-cyan-300/10 text-cyan-300" };
  if (label === "TOTALS") return { label: "TOTAL", className: "border-yellow-300/20 bg-yellow-300/10 text-yellow-300" };
  return { label: "SPREAD", className: "border-purple-300/20 bg-purple-300/10 text-purple-300" };
}

function AtlasCoreHealth({ operations }: { operations?: AdminOperations }) {
  const core = operations?.atlasCore;
  const tone = (status?: string) =>
    status === "HEALTHY"
      ? "text-emerald-300"
      : status === "ERROR"
        ? "text-red-300"
        : status === "WARNING"
          ? "text-yellow-300"
          : "text-white/55";
  const dot = (status?: string) =>
    status === "HEALTHY"
      ? "bg-emerald-400"
      : status === "ERROR"
        ? "bg-red-400"
        : status === "WARNING"
          ? "bg-yellow-400"
          : "bg-white/35";
  const items = [
    ["Research", core?.research],
    ["Validation", core?.validation],
    ["Publishing", core?.publishing],
    ["Learning", core?.learning],
  ];
  return (
    <AdminShellCard className="flex items-center justify-between gap-2 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-black uppercase text-white">Atlas Core</span>
        <span className={`text-[10px] font-black uppercase ${tone(core?.overall)}`}>{core?.overall ?? "UNAVAILABLE"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {items.map(([label, status]) => (
          <span key={label} className="flex items-center gap-1 text-[8px] font-black uppercase text-white/58 sm:text-[9px]">
            <span className={`h-1.5 w-1.5 rounded-full ${dot(status)}`} />
            {label}
          </span>
        ))}
      </div>
    </AdminShellCard>
  );
}

function AdminTop5Card({ operations }: { operations?: AdminOperations }) {
  const rows = operations?.topPicks ?? [];
  return (
    <AdminShellCard className="p-2.5">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[17px] font-black uppercase tracking-[-0.01em] text-white">Top 5 Picks</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">Open Picks →</button>
      </div>
      <div>
        {rows.slice(0, 5).map((pick, index) => {
          const tag = adminMarketTag(pick.market);
          return (
            <div key={pick.id ?? `${pick.game_id}-${index}`} className="grid grid-cols-[16px_26px_minmax(0,1fr)_38px_40px_58px_40px_38px_10px] items-center gap-1 border-b border-white/8 py-1.5 last:border-b-0 sm:grid-cols-[22px_32px_minmax(0,1fr)_58px_54px_70px_58px_44px_12px] sm:gap-1.5">
              <span className="text-[12px] font-black text-white sm:text-[13px]">{pick.rank ?? index + 1}</span>
              <AdminTeamLogo team={adminPickTeamName(pick)} className="h-[26px] w-[26px] rounded-lg sm:h-8 sm:w-8" />
              <span className="truncate text-[11px] font-semibold text-white sm:text-[14px]">{adminPickTeamName(pick)}</span>
              <span className="text-[10px] font-black text-white sm:text-[12px]">{pick.line ? `${Number(pick.line) > 0 ? "+" : ""}${pick.line}` : adminMarketLabel(pick.market)}</span>
              <span className={`rounded px-1 py-0.5 text-center text-[7px] font-black uppercase sm:text-[8px] ${tag.className}`}>{tag.label}</span>
              <AdminStatusPill status={pick.status} />
              <span className="text-right text-[11px] font-black text-emerald-300 sm:text-[13px]">{formatAdminEdge(pick.edge)}</span>
              <span className="text-right text-[10px] font-black text-white/58">{numberPct(pick.confidence)}</span>
              <span className="text-base text-white/50">›</span>
            </div>
          );
        })}
        {!rows.length ? <p className="py-6 text-center text-sm text-white/45">No validated picks yet.</p> : null}
      </div>
    </AdminShellCard>
  );
}

function PipelineStatus({ operations }: { operations?: AdminOperations }) {
  const steps = operations?.pipeline ?? [];
  const icons = ["⌕", "◎", "▥", "★", "♛", "♜"];
  const details = ["7:00 AM", "Frozen", "Live", "Active", "Published", "Pending"];
  const pipelineStatus = operations?.atlasCore?.overall === "HEALTHY" ? "Running Normally" : operations?.atlasCore?.overall ?? "Unavailable";
  return (
    <AdminShellCard className="p-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-black uppercase text-white">Atlas Pipeline</h2>
          <p className="text-[10px] font-black uppercase text-emerald-300">{pipelineStatus}</p>
        </div>
        <button className="text-[12px] font-black uppercase text-sky-400">Open Pipeline →</button>
      </div>
      <div className="mt-2.5 grid grid-cols-6 items-start gap-0">
        {steps.map((step, index) => {
          const complete = step.status === "complete";
          return (
            <div key={step.label} className="relative text-center">
              {index < steps.length - 1 ? <span className={`absolute left-1/2 right-[-50%] top-[17px] h-0.5 ${complete ? "bg-emerald-400" : "bg-white/14"}`} /> : null}
              <span className={`relative z-10 mx-auto grid h-[34px] w-[34px] place-items-center rounded-full border text-[15px] ${complete ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-400"}`}>{icons[index]}</span>
              <span className={`relative z-10 mx-auto -mt-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-black ${complete ? "bg-emerald-400 text-black" : "bg-slate-500 text-white/60"}`}>✓</span>
              <p className="mt-1 text-[8px] font-black uppercase leading-[1.12] text-white sm:text-[9px]">{step.label}</p>
              <p className="mt-0.5 text-[7px] font-black uppercase leading-none text-white/55 sm:text-[8px]">{details[index] ?? step.detail}</p>
            </div>
          );
        })}
      </div>
    </AdminShellCard>
  );
}

function RecentActivity({ operations }: { operations?: AdminOperations }) {
  const rows = operations?.recentActivity ?? [];
  const tone: Record<string, string> = {
    blue: "bg-sky-400",
    green: "bg-emerald-400",
    purple: "bg-purple-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
  };
  const iconFor = (title: string) => {
    const key = title.toLowerCase();
    if (key.includes("morning")) return "⌕";
    if (key.includes("signal") && key.includes("published")) return "♛";
    if (key.includes("published") || key.includes("updated")) return "★";
    if (key.includes("confirmed")) return "✓";
    if (key.includes("downgraded")) return "!";
    if (key.includes("removed")) return "×";
    if (key.includes("graded")) return "=";
    return "•";
  };
  return (
    <AdminShellCard className="p-2.5">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[16px] font-black uppercase text-white">Recent Activity</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">Open Activity →</button>
      </div>
      <div className="pt-1">
        {rows.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid grid-cols-[54px_20px_1fr_10px] items-center border-b border-white/8 py-1.5 last:border-b-0">
            <span className="text-[11px] font-medium text-white/60">{formatAdminTime(item.time)}</span>
            <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-black ${tone[item.tone] ?? "bg-sky-400"} shadow-[0_0_0_3px_rgba(255,255,255,0.05)]`}>{iconFor(item.title)}</span>
            <span>
              <p className="text-[13px] font-semibold leading-tight text-white">{item.title}</p>
              <p className="text-[11px] leading-tight text-white/45">{item.detail}</p>
            </span>
            <span className="text-base text-white/50">›</span>
          </div>
        ))}
        {!rows.length ? <p className="py-5 text-center text-sm text-white/45">No activity yet.</p> : null}
      </div>
    </AdminShellCard>
  );
}

function TodaysStatus({ operations }: { operations?: AdminOperations }) {
  const rows = [
    ["Games", operations?.signalsDetected ?? 0],
    ["Signals", operations?.signalsDetected ?? 0],
    ["Validated", operations?.validatedPicks ?? 0],
    ["Confirmed", operations?.confirmed ?? 0],
    ["Pending", operations?.pending ?? 0],
    ["Downgraded", operations?.downgraded ?? 0],
    ["Removed", operations?.removed ?? 0],
  ];
  return (
    <AdminShellCard className="p-2.5">
      <h2 className="mb-2 text-[16px] font-black uppercase text-white">Today’s Status</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-white/8 py-1 last:border-b-0">
            <span className="text-[10px] font-black uppercase text-white/45">{label}</span>
            <span className="text-[13px] font-black text-white">{value}</span>
          </div>
        ))}
      </div>
    </AdminShellCard>
  );
}

function BusinessSnapshot({ operations }: { operations?: AdminOperations }) {
  const snapshot = operations?.businessSnapshot;
  const money = typeof snapshot?.revenueToday === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currency?.toUpperCase() || "USD" }).format(snapshot.revenueToday)
    : "Unavailable";
  const rows = [
    ["Active Subscribers", snapshot?.activeSubscribers ?? "Unavailable"],
    ["Top Signal Purchases Today", snapshot?.topSignalPurchasesToday ?? "Unavailable"],
    ["Daily Purchases Today", snapshot?.dailyPurchasesToday ?? "Unavailable"],
    ["Revenue Today", money],
  ];
  return (
    <AdminShellCard className="p-2.5">
      <h2 className="mb-2 text-[16px] font-black uppercase text-white">Business Snapshot</h2>
      <div className="grid gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-white/8 py-1 last:border-b-0">
            <span className="text-[10px] font-black uppercase text-white/45">{label}</span>
            <span className="text-[12px] font-black text-white">{value}</span>
          </div>
        ))}
      </div>
    </AdminShellCard>
  );
}

function controlPct(value: unknown) {
  const parsed = adminNumber(value);
  if (parsed === null) return "N/A";
  const pctValue = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return `${pctValue.toFixed(1)}%`;
}

function controlPctNumber(value: unknown) {
  const parsed = adminNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(100, Math.abs(parsed) <= 1 ? parsed * 100 : parsed));
}

function controlScore(value: unknown) {
  const parsed = adminNumber(value);
  if (parsed === null) return "N/A";
  return parsed.toFixed(1);
}

function controlSigned(value: unknown) {
  const parsed = adminNumber(value);
  if (parsed === null) return "N/A";
  return `${parsed > 0 ? "+" : ""}${parsed}`;
}

function controlDeltaPct(value: unknown) {
  const parsed = adminNumber(value);
  if (parsed === null) return "—";
  return `${parsed > 0 ? "+" : ""}${(parsed * 100).toFixed(1)}%`;
}

function controlTone(value?: string | null) {
  const status = String(value ?? "").toUpperCase();
  if (["HEALTHY", "SUCCESS", "READY", "PUBLISHED", "CONFIRMED", "HIGH", "UP", "CONFIDENCE IMPROVED", "REVIEW PASSED", "CURRENT LEADER"].includes(status)) return "text-emerald-300";
  if (["WARNING", "PARTIAL", "MEDIUM", "DOWN", "STABLE", "PREVIOUS LEADER", "FORMER LEADER"].includes(status)) return "text-yellow-300";
  if (["ERROR", "LOW", "REMOVED", "WITHDRAWN", "DOWNGRADED", "CONFIDENCE REDUCED", "REVIEW FAILED"].includes(status)) return "text-red-300";
  return "text-cyan-300";
}

function ControlMiniMetric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/15 px-2.5 py-2">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/42">{label}</p>
      <p className={`mt-1 truncate text-[15px] font-black ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function ControlSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <AdminShellCard className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-black uppercase tracking-[0.02em] text-white">{title}</h2>
        {action ? <div className="text-[10px] font-black uppercase text-cyan-300">{action}</div> : null}
      </div>
      {children}
    </AdminShellCard>
  );
}

function ControlHealthStrip({ rows }: { rows: any[] }) {
  const visible = rows.slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {visible.map((row) => (
        <AdminShellCard key={row.engine} className="p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-black uppercase text-white/70">{row.engine}</span>
            <span className={`text-[9px] font-black uppercase ${controlTone(row.status)}`}>{row.status}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold text-white/42">Last {row.lastRunEt ?? "N/A"}</p>
        </AdminShellCard>
      ))}
    </div>
  );
}

function ControlEngineStatusBar({ rows, summary }: { rows: any[]; summary?: any }) {
  const items = [
    { key: "Signals", match: "Signals Detected", sub: `${summary?.signalsDetected ?? 0} Frozen` },
    { key: "Exclusive", match: "Exclusive", sub: `${summary?.exclusiveTop3Candidates ?? 0} Ranked` },
    { key: "Premium", match: "Premium", sub: `${summary?.premiumTop5Candidates ?? 0} Ranked` },
    { key: "Top Signal", match: "Top Signal", sub: summary?.topSignalCurrentLeader ? "1 Leader" : "No Leader" },
  ];
  return (
    <AdminShellCard className="scrollbar-hide flex gap-3 overflow-x-auto px-2.5 py-2">
      {items.map((item) => {
        const row = rows.find((entry) => String(entry.engine).includes(item.match));
        const status = row?.status ?? "IDLE";
        const dot = status === "HEALTHY" ? "bg-emerald-400" : status === "ERROR" ? "bg-red-400" : status === "WARNING" ? "bg-yellow-400" : "bg-white/35";
        return (
          <div key={item.key} className="flex min-w-[86px] items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase text-white">{item.key}</p>
              <p className="truncate text-[9px] font-bold text-white/42">{item.sub}</p>
            </div>
          </div>
        );
      })}
    </AdminShellCard>
  );
}

function ControlMatchLogos({ awayTeam, homeTeam, size = "sm" }: { awayTeam?: string | null; homeTeam?: string | null; size?: "sm" | "md" }) {
  const logoClass = size === "md" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <AdminTeamLogo team={awayTeam} className={logoClass} />
      <span className="text-[10px] font-black text-white/35">vs</span>
      <AdminTeamLogo team={homeTeam} className={logoClass} />
    </div>
  );
}

function ControlSignalRow({ row, rank, premium = false }: { row: any; rank?: number | string | null; premium?: boolean }) {
  const displayRank = rank ?? row.currentRank ?? row.rank ?? row.exclusiveTop3Rank ?? null;
  const rankText = row.rankLabel ?? (displayRank ? `#${displayRank}` : null);
  return (
    <div className={`grid grid-cols-[92px_minmax(0,1fr)_52px_44px] items-center gap-2 border-b border-white/8 px-2.5 py-2 last:border-b-0 ${premium ? "border-l-2 border-l-purple-400/50" : ""}`}>
      <div className="flex items-center gap-1">
        {rankText ? <span className="w-8 text-[11px] font-black uppercase text-white">{rankText}</span> : null}
        <ControlMatchLogos awayTeam={row.awayTeam} homeTeam={row.homeTeam} />
      </div>
      <div className="min-w-0">
        <p className="break-words text-[13px] font-black leading-tight text-white">{row.selection}</p>
        <p className="break-words text-[10px] font-bold leading-tight text-white/42">{row.event}</p>
        <p className="mt-0.5 text-[9px] font-black uppercase text-white/35">{row.market} {formatAdminOdds(row.odds)}</p>
      </div>
      <span className="text-right text-[11px] font-black text-emerald-300">{controlPct(row.atlasProbability ?? row.probability)}</span>
      <span className={`text-right text-[10px] font-black ${controlTone(row.trend ?? row.status)}`}>{row.trend ?? row.status ?? "LIVE"}</span>
    </div>
  );
}

function ControlSignalPreview({ title, rows, empty, action, premium = false }: { title: string; rows: any[]; empty: string; action?: React.ReactNode; premium?: boolean }) {
  return (
    <ControlSection title={title} action={action}>
      {rows.length ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {rows.map((row, index) => <ControlSignalRow key={`${row.gameId ?? row.signalIdentity}-${index}`} row={row} rank={row.rank ?? row.currentRank ?? index + 1} premium={premium && index === 0} />)}
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">{empty}</p>
      )}
    </ControlSection>
  );
}

function ControlTopSignalCurrentLeader({ data, title = "Top Signal Current Leader" }: { data: any | null; title?: string }) {
  if (!data) {
    return (
      <ControlSection title={title}>
        <p className="py-5 text-center text-sm font-bold text-white/45">NO_QUALIFIED_SIGNAL</p>
      </ControlSection>
    );
  }
  return (
    <AdminShellCard className="border-purple-400/50 p-2.5 shadow-[0_0_22px_rgba(168,85,247,0.10)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-purple-300">{title}</p>
          <div className="mt-2 flex items-center gap-2">
            <ControlMatchLogos awayTeam={data.awayTeam} homeTeam={data.homeTeam} size="md" />
            <div className="min-w-0">
              <p className="break-words text-[18px] font-black leading-tight text-white">{data.selection}</p>
              <p className="break-words text-[11px] font-bold leading-tight text-white/45">{data.event} · {data.market} {formatAdminOdds(data.odds)}</p>
            </div>
          </div>
        </div>
        <span className={`rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase ${controlTone(data.candidateStatus)}`}>{data.candidateStatus}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <ControlMiniMetric label="Probability" value={controlPct(data.atlasProbability)} tone="text-emerald-300" />
        <ControlMiniMetric label="Edge" value={formatAdminEdge(data.edge)} tone="text-cyan-300" />
        <ControlMiniMetric label="Next Review" value={formatAdminTime(data.nextFinalReview) || data.estimatedPublicationWindow} />
      </div>
    </AdminShellCard>
  );
}

function ProductStatusPanel({ status }: { status?: any }) {
  const publication = status?.publication ?? {};
  const validation = status?.validation ?? {};
  const rows = [
    ["Signals Published", publication.signalsPublished ? "YES" : "NO"],
    ["Top Signal Published", publication.topSignalPublished ? "YES" : "NO"],
    ["Top 5 Published", publication.top5Published ? "YES" : "NO"],
    ["Exclusive Published", publication.exclusivePublished ? "YES" : "NO"],
    ["Validation Completed", validation.completed ?? 0],
    ["Validation Pending", validation.pending ?? 0],
    ["Confirmed", validation.confirmed ?? 0],
    ["Downgraded", validation.downgraded ?? 0],
    ["Withdrawn", validation.withdrawn ?? 0],
  ];
  return (
    <ControlSection title="Product Status">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <ControlMiniMetric
            key={label}
            label={label}
            value={value}
            tone={String(value).toUpperCase() === "YES" || Number(value) > 0 ? "text-emerald-300" : "text-white"}
          />
        ))}
      </div>
    </ControlSection>
  );
}

function LeaderConfidenceIndicator({ data }: { data: any }) {
  const probability = controlPctNumber(data.atlasProbability) ?? 0;
  const edge = Math.min(100, Math.max(0, Math.abs(adminNumber(data.edge) ?? 0) * 1250));
  const score = adminNumber(data.engineScore) ?? null;
  return (
    <div className="mt-2 rounded-lg border border-white/8 bg-black/15 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/62">Leader Confidence</p>
        <p className={`text-[10px] font-black uppercase ${controlTone(data.stability)}`}>{data.stability ?? "IDLE"}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#34d399,#facc15)] shadow-[0_0_14px_rgba(34,211,238,0.35)]"
          style={{ width: `${probability}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-[9px] font-bold text-white/48">
        <span>Prob <b className="text-white">{controlPct(data.atlasProbability)}</b></span>
        <span>Edge <b className="text-white">{formatAdminEdge(data.edge)}</b></span>
        <span>Score <b className="text-white">{score === null ? "N/A" : controlScore(score)}</b></span>
        <span>Edge Strength <b className="text-white">{edge.toFixed(0)}%</b></span>
      </div>
    </div>
  );
}

function ControlLeadersToday({ rows, secondPlace, expanded, onToggle }: { rows: any[]; secondPlace?: any | null; expanded: boolean; onToggle: () => void }) {
  const secondPlaceRow = secondPlace && !rows.some((row) => row.gameId === secondPlace.gameId)
    ? { ...secondPlace, rankLabel: "2nd", trend: secondPlace.status ?? "CANDIDATE" }
    : null;
  const visibleRows = expanded ? rows : rows.slice(0, 3);
  const rowsToShow = secondPlaceRow ? [...visibleRows, secondPlaceRow] : visibleRows;
  const canExpand = rows.length > 3;
  return (
    <ControlSignalPreview
      title="Top Signal Leaders Today"
      rows={rowsToShow}
      empty="No Top Signal leader history yet."
      action={canExpand ? <button type="button" onClick={onToggle}>{expanded ? "View Less ↑" : "View More ↓"}</button> : null}
      premium
    />
  );
}

function ControlOverviewDetails({ data, summary }: { data: AtlasControlCenterData; summary?: any }) {
  return (
    <div className="grid gap-2 pt-2">
      <ControlTopSignalStrength strength={data.topSignal?.strength} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ControlMiniMetric label="Sports" value={(summary?.sportsAvailable ?? []).join(", ") || "N/A"} />
        <ControlMiniMetric label="Games Inspected" value={summary?.gamesInspected ?? 0} />
        <ControlMiniMetric label="Signals Detected" value={summary?.signalsDetected ?? 0} tone="text-cyan-300" />
        <ControlMiniMetric label="Stale Sources" value={summary?.staleSources ?? 0} tone={(summary?.staleSources ?? 0) ? "text-yellow-300" : "text-emerald-300"} />
      </div>
      <ControlSection title="Why Atlas Changed">
        <ControlChangeReasons rows={data.topSignal?.changeReasons ?? []} />
      </ControlSection>
      <ControlMarketPulse pulse={data.marketPulse} />
    </div>
  );
}

function ControlTopSignalHero({ data }: { data: any | null }) {
  if (!data) {
    return (
      <ControlSection title="Top Signal Engine">
        <p className="py-6 text-center text-sm font-bold text-white/45">NO_QUALIFIED_SIGNAL</p>
      </ControlSection>
    );
  }
  return (
    <AdminShellCard className="border-purple-400/45 p-2.5 shadow-[0_0_26px_rgba(168,85,247,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-300">Top Signal Engine</p>
          <h2 className="mt-0.5 text-[20px] font-black leading-tight text-white">{data.currentLeader}</h2>
          <p className="text-xs font-bold text-white/50">{data.event} · {data.market}</p>
        </div>
        <span className={`rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase ${controlTone(data.candidateStatus)}`}>
          {data.candidateStatus}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <ControlMiniMetric label="Atlas Probability" value={controlPct(data.atlasProbability)} tone="text-emerald-300" />
        <ControlMiniMetric label="Edge" value={formatAdminEdge(data.edge)} tone="text-cyan-300" />
        <ControlMiniMetric label="Score" value={controlScore(data.engineScore)} tone="text-white" />
        <ControlMiniMetric label="Odds" value={formatAdminOdds(data.odds) || "N/A"} tone="text-white" />
      </div>
      <LeaderConfidenceIndicator data={data} />
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-xs sm:grid-cols-4">
        <div><span className="text-white/38">Leader Since</span><p className="font-black text-white">{formatAdminTime(data.leaderSince)}</p></div>
        <div><span className="text-white/38">Leader Time</span><p className="font-black text-white">{data.leaderTime ?? "N/A"}</p></div>
        <div><span className="text-white/38">Stability</span><p className={`font-black ${controlTone(data.stability)}`}>{data.stability}</p></div>
        <div><span className="text-white/38">Publish Window</span><p className="font-black text-white">{data.estimatedPublicationWindow}</p></div>
      </div>
      <details className="mt-2 rounded-lg border border-white/8 bg-black/15 p-2 text-xs">
        <summary className="cursor-pointer font-black uppercase text-cyan-300">Open Engine Details →</summary>
        <div className="mt-2 grid gap-2">
          <p className="text-white/60">Consecutive Hours: <span className="font-black text-white">{data.consecutiveHoursAsLeader ?? 0}</span></p>
          <SecondPlaceCandidate candidate={data.secondPlaceCandidate} />
        </div>
      </details>
    </AdminShellCard>
  );
}

function ControlTopSignalStrength({ strength }: { strength?: any }) {
  if (!strength) return null;
  return (
    <ControlSection title="Top Signal Strength">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ControlMiniMetric label="Leader Score" value={controlScore(strength.leaderScore)} />
        <ControlMiniMetric label="Second Score" value={controlScore(strength.secondPlaceScore)} />
        <ControlMiniMetric label="Score Gap" value={controlSigned(strength.scoreGap)} tone="text-cyan-300" />
        <ControlMiniMetric label="Probability Gap" value={controlDeltaPct(strength.probabilityGap)} tone="text-emerald-300" />
        <ControlMiniMetric label="Edge Gap" value={controlDeltaPct(strength.edgeGap)} tone="text-cyan-300" />
        <ControlMiniMetric label="Leader Time" value={strength.leaderDuration ?? "N/A"} />
        <ControlMiniMetric label="Leader Changes" value={strength.leaderChangesToday ?? 0} />
        <ControlMiniMetric label="Stability" value={strength.stability ?? "IDLE"} tone={controlTone(strength.stability)} />
      </div>
      {strength.scoreConsistencyNote ? (
        <p className="mt-2 rounded-lg border border-yellow-300/15 bg-yellow-300/8 p-2 text-[11px] font-bold leading-snug text-yellow-100/75">
          {strength.scoreConsistencyNote}
        </p>
      ) : null}
    </ControlSection>
  );
}

function SecondPlaceCandidate({ candidate }: { candidate: any | null }) {
  if (!candidate) return <p className="text-xs font-bold text-white/45">No qualified second candidate.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <ControlSignalRow row={{ ...candidate, currentRank: 2, trend: candidate.status ?? "CANDIDATE" }} rank={2} premium />
    </div>
  );
}

function ControlRankingList({ rows, empty, compact = false }: { rows: any[]; empty: string; compact?: boolean }) {
  if (!rows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {rows.map((row) => (
        <div key={`${row.gameId}-${row.rank}`} className={`grid grid-cols-[26px_minmax(0,1fr)_44px_54px_48px_42px] items-center gap-2 border-b border-white/8 px-2.5 last:border-b-0 ${compact ? "py-1.5" : "py-2"}`}>
          <span className="text-[13px] font-black text-white">#{row.rank}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-white">{row.selection}</p>
            <p className="truncate text-[10px] font-bold text-white/40">{row.previousRank ? `Prev #${row.previousRank}` : "New"} · {row.event}</p>
          </div>
          <span className="text-[10px] font-black text-white">{row.market}</span>
          <span className="text-right text-[11px] font-black text-emerald-300">{controlPct(row.atlasProbability)}</span>
          <span className={`text-right text-[10px] font-black ${controlTone(row.trend)}`}>{row.trend}</span>
          <span className="text-right text-[10px] font-black text-white/55">{controlDeltaPct(row.probabilityDelta)}</span>
        </div>
      ))}
    </div>
  );
}

function ControlSignalsDetectedList({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No frozen Signals Detected rows yet.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {rows.map((row) => (
        <div key={row.gameId} className="grid grid-cols-[minmax(0,1fr)_52px_56px_58px] items-center gap-2 border-b border-white/8 px-2.5 py-2 last:border-b-0">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-white">{row.selection}</p>
            <p className="truncate text-[10px] font-bold text-white/40">{row.event}</p>
          </div>
          <span className="text-[10px] font-black text-white">{row.market}</span>
          <span className="text-right text-[11px] font-black text-emerald-300">{controlPct(row.atlasProbability)}</span>
          <span className="text-right text-[10px] font-black text-cyan-300">{row.exclusiveTop3Rank ? `#${row.exclusiveTop3Rank} ${row.exclusiveTrend}` : "Frozen Yes"}</span>
        </div>
      ))}
    </div>
  );
}

function activityEngineTone(engine: string, severity?: string) {
  if (String(severity).toUpperCase() === "ERROR") return "border-red-400/50 text-red-300 bg-red-400";
  if (engine.includes("Top Signal")) return "border-purple-400/50 text-purple-300 bg-purple-400";
  if (engine.includes("Premium")) return "border-cyan-400/50 text-cyan-300 bg-cyan-400";
  if (engine.includes("Exclusive")) return "border-sky-400/50 text-sky-300 bg-sky-400";
  if (engine.includes("Signals")) return "border-emerald-400/50 text-emerald-300 bg-emerald-400";
  if (engine.includes("Validation")) return "border-yellow-400/50 text-yellow-300 bg-yellow-400";
  return "border-white/20 text-white/60 bg-white";
}

function ControlTopSignalStoryTimeline({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No Top Signal story yet.</p>;
  return (
    <div className="grid gap-2">
      {rows.slice(-10).reverse().map((row, index) => (
        <div key={`${row.timestamp}-${index}`} className="rounded-xl border border-white/10 bg-black/15 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">{formatAdminTime(row.timestamp)}</p>
              <p className="mt-1 break-words text-[14px] font-black leading-tight text-white">{row.candidate}</p>
              <p className="mt-0.5 break-words text-[10px] font-bold text-white/42">{row.event} · {row.market}</p>
            </div>
            <span className={`shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase ${controlTone(row.status)}`}>
              {row.status}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <ControlMiniMetric label="Probability" value={controlPct(row.probability)} tone="text-emerald-300" />
            <ControlMiniMetric label="Edge" value={formatAdminEdge(row.edge)} tone="text-cyan-300" />
            <ControlMiniMetric label="Score" value={controlScore(row.score)} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/8 pt-2 text-[9px] font-bold text-white/42">
            <span>Prob Δ <b className={controlTone((row.probabilityDelta ?? 0) >= 0 ? "UP" : "DOWN")}>{controlDeltaPct(row.probabilityDelta)}</b></span>
            <span>Edge Δ <b className={controlTone((row.edgeDelta ?? 0) >= 0 ? "UP" : "DOWN")}>{controlDeltaPct(row.edgeDelta)}</b></span>
            <span>Leader Time <b className="text-white">{row.leaderTime ?? "N/A"}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ControlTopSignalSessionTimeline({ sessions, fallbackRows }: { sessions?: any[]; fallbackRows: any[] }) {
  const rows = Array.isArray(sessions) && sessions.length
    ? sessions
    : [{ sessionLabel: "SESSION 1", candidate: "Current Leader", status: "Candidate", rows: fallbackRows }];
  if (!rows.length || !rows.some((session) => (session.rows ?? []).length)) {
    return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No Top Signal sessions yet.</p>;
  }
  return (
    <div className="grid gap-3">
      {rows.slice().reverse().map((session) => (
        <div key={session.sessionId ?? session.sessionLabel} className="rounded-xl border border-white/10 bg-black/15 p-2.5">
          <div className="flex items-start justify-between gap-2 border-b border-white/8 pb-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-300">{session.sessionLabel}</p>
              <p className="mt-1 break-words text-[14px] font-black leading-tight text-white">{session.candidate}</p>
              <p className="mt-0.5 text-[10px] font-bold text-white/42">
                {formatAdminTime(session.startedAt)} → {session.publicationTime ? formatAdminTime(session.publicationTime) : "Waiting Final Review"}
              </p>
            </div>
            <span className={`shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase ${controlTone(session.status)}`}>
              {session.published ? "READY" : session.status}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <ControlMiniMetric label="Probability" value={controlPct(session.probability)} tone="text-emerald-300" />
            <ControlMiniMetric label="Edge" value={formatAdminEdge(session.edge)} tone="text-cyan-300" />
            <ControlMiniMetric label="Score" value={controlScore(session.score)} />
          </div>
          <div className="mt-2">
            <ControlTopSignalStoryTimeline rows={session.rows ?? []} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ControlActivityList({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No live activity yet.</p>;
  return (
    <div className="grid gap-1">
      {rows.slice(0, 18).map((row, index) => (
        <div key={`${row.timestamp}-${index}`} className={`grid grid-cols-[58px_92px_minmax(0,1fr)] items-center gap-2 border-b border-l-2 border-b-white/8 py-1.5 pl-2 last:border-b-0 ${activityEngineTone(row.engine, row.severity).split(" ")[0]}`}>
          <span className="text-[10px] font-bold text-white/45">{formatAdminTime(row.timestamp)}</span>
          <span className={`flex items-center gap-1 text-[9px] font-black uppercase ${activityEngineTone(row.engine, row.severity).split(" ")[1]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${activityEngineTone(row.engine, row.severity).split(" ")[2]}`} />
            {row.engine}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-black text-white">{row.event}</p>
            <p className="truncate text-[10px] text-white/42">{row.affectedSignal} · {row.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ControlHealthTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No engine health available.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {rows.map((row) => (
        <div key={row.engine} className="grid grid-cols-[minmax(0,1fr)_64px_54px_52px_42px] items-center gap-2 border-b border-white/8 px-2.5 py-2 text-xs last:border-b-0">
          <span className="truncate font-black text-white">{row.engine}</span>
          <span className={`text-[10px] font-black uppercase ${controlTone(row.status)}`}>{row.status}</span>
          <span className="text-[10px] font-bold text-white/45">{row.latency}</span>
          <span className="text-[10px] font-bold text-white/45">{row.lastDuration ?? "—"}</span>
          <span className="text-right text-[10px] font-black text-white">{row.rowsProcessed}</span>
        </div>
      ))}
    </div>
  );
}

function ControlOperationsTimeline({ rows }: { rows: any[] }) {
  return (
    <div className="grid gap-1">
      {rows.map((row) => (
        <div key={row.stage} className="grid grid-cols-[76px_minmax(0,1fr)_46px_54px] gap-2 border-b border-white/8 py-2 last:border-b-0">
          <span className="text-[10px] font-black uppercase text-cyan-300">{row.scheduledTime}</span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-black text-white">{row.stage}</p>
            <p className="truncate text-[10px] text-white/40">Last {row.lastExecutionEt ?? "N/A"} · Next {row.nextExecution ?? "N/A"} · {row.result}</p>
          </div>
          <span className="text-right text-[10px] font-black text-white">{row.rowsProcessed}</span>
          <span className={`text-right text-[10px] font-black uppercase ${controlTone(row.health)}`}>{row.health}</span>
        </div>
      ))}
    </div>
  );
}

function ControlMarketPulse({ pulse }: { pulse?: any }) {
  if (!pulse) return null;
  return (
    <ControlSection title="Atlas Market Pulse">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ControlMiniMetric label="Top Signal Stability" value={pulse.topSignalStability ?? "IDLE"} tone={controlTone(pulse.topSignalStability)} />
        <ControlMiniMetric label="Top 5 Volatility" value={pulse.top5Volatility ?? "LOW"} tone={controlTone(pulse.top5Volatility)} />
        <ControlMiniMetric label="Exclusive Volatility" value={pulse.exclusiveTop3Volatility ?? "LOW"} tone={controlTone(pulse.exclusiveTop3Volatility)} />
        <ControlMiniMetric label="Market Movement" value={pulse.marketMovement ?? 0} />
        <ControlMiniMetric label="Improving" value={pulse.signalsImproving ?? 0} tone="text-emerald-300" />
        <ControlMiniMetric label="Weakening" value={pulse.signalsWeakening ?? 0} tone="text-yellow-300" />
        <ControlMiniMetric label="Leader Changes" value={pulse.leaderChanges ?? 0} />
        <ControlMiniMetric label="Qualified" value={pulse.qualifiedCandidates ?? 0} tone="text-cyan-300" />
      </div>
    </ControlSection>
  );
}

function ControlChangeReasons({ rows }: { rows: any[] }) {
  const meaningfulRows = rows.filter((row) => Array.isArray(row.reasons) && row.reasons.length > 0);
  if (!meaningfulRows.length) return <p className="rounded-lg border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No meaningful engine changes detected.</p>;
  return (
    <div className="grid gap-2">
      {meaningfulRows.slice(-8).reverse().map((row, index) => (
        <div key={`${row.timestamp}-${index}`} className="rounded-lg border border-white/8 bg-black/15 p-2">
          <p className="text-[10px] font-black uppercase text-cyan-300">{formatAdminTime(row.timestamp)} · {row.event}</p>
          <p className="mt-1 text-sm font-black text-white">{row.signal}</p>
          <ul className="mt-1 grid gap-1">
            {(row.reasons ?? []).map((reason: string) => <li key={reason} className="text-[11px] font-bold text-white/55">- {reason}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function filterActivity(rows: any[], filter: AtlasActivityFilter) {
  if (filter === "ALL") return rows;
  if (filter === "ERRORS") return rows.filter((row) => String(row.severity).toUpperCase() === "ERROR");
  if (filter === "TOP SIGNAL") return rows.filter((row) => String(row.engine).includes("Top Signal"));
  if (filter === "TOP 5") return rows.filter((row) => String(row.engine).includes("Premium"));
  if (filter === "EXCLUSIVE") return rows.filter((row) => String(row.engine).includes("Exclusive"));
  if (filter === "SIGNALS") return rows.filter((row) => String(row.engine).includes("Signals"));
  if (filter === "VALIDATION") return rows.filter((row) => String(row.engine).includes("Validation"));
  return rows;
}

const atlasControlSportOptions = [
  { id: "MLB", label: "MLB", icon: "⚾" },
  { id: "NBA", label: "NBA", icon: "🏀" },
  { id: "NFL", label: "NFL", icon: "🏈" },
  { id: "NHL", label: "NHL", icon: "🏒" },
  { id: "SOCCER", label: "SOCCER", icon: "⚽" },
];

function normalizeControlSport(value: unknown) {
  const sport = String(value ?? "").trim().toUpperCase();
  if (sport === "SOCCER" || sport === "FOOTBALL_SOCCER") return "SOCCER";
  return sport;
}

function rowMatchesControlSport(row: any, sport: AtlasControlSportFilter) {
  if (sport === "ALL") return true;
  return normalizeControlSport(row?.sport) === sport;
}

function filterControlRows<T extends any[]>(rows: T | undefined, sport: AtlasControlSportFilter): T {
  if (!Array.isArray(rows) || sport === "ALL") return (rows ?? []) as T;
  return rows.filter((row) => rowMatchesControlSport(row, sport)) as T;
}

export function getAtlasControlSports(data: AtlasControlCenterData | null) {
  const dynamicSports = (data?.summary?.sportsAvailable ?? [])
    .map(normalizeControlSport)
    .filter(Boolean);
  return Array.from(new Set(["ALL", ...atlasControlSportOptions.map((item) => item.id), ...dynamicSports]));
}

export function filterAtlasControlCenterData(data: AtlasControlCenterData | null, sport: AtlasControlSportFilter) {
  if (!data || sport === "ALL") return data;
  const topSignalMatches = rowMatchesControlSport(data.topSignal, sport);
  const leadersToday = filterControlRows(data.topSignal?.leadersToday, sport);
  const secondPlaceCandidate = rowMatchesControlSport(data.topSignal?.secondPlaceCandidate, sport)
    ? data.topSignal?.secondPlaceCandidate
    : null;
  const topSignal = topSignalMatches || leadersToday.length || secondPlaceCandidate
    ? {
        ...data.topSignal,
        leadersToday,
        secondPlaceCandidate,
      }
    : null;
  const officialTopSignalMatches = rowMatchesControlSport(data.officialProducts?.topSignal, sport);
  const officialTopSignal = officialTopSignalMatches ? data.officialProducts?.topSignal : null;
  const top5Rows = filterControlRows(data.top5?.currentInternalRanking ?? [], sport);
  const officialTop5Rows = filterControlRows(data.top5?.officialFrozenTop5 ?? [], sport);
  const exclusiveRows = filterControlRows(data.exclusiveTop3?.currentInternalRanking ?? [], sport);
  const officialExclusiveRows = filterControlRows(data.exclusiveTop3?.officialFrozenTop3 ?? [], sport);
  const signalsDetected = filterControlRows(data.signalsDetected ?? [], sport);

  return {
    ...data,
    summary: {
      ...data.summary,
      topSignalCurrentLeader: topSignal?.currentLeader ?? "NO_QUALIFIED_SIGNAL",
      signalsDetected: signalsDetected.length,
      premiumTop5Candidates: top5Rows.length || officialTop5Rows.length,
      exclusiveTop3Candidates: exclusiveRows.length || officialExclusiveRows.length,
    },
    topSignal,
    officialProducts: {
      ...data.officialProducts,
      topSignal: officialTopSignal,
      premiumTop5: officialTop5Rows,
      exclusiveTop3: officialExclusiveRows,
      signalsDetected,
    },
    topSignalTimeline: filterControlRows(data.topSignalTimeline ?? [], sport),
    top5: {
      ...data.top5,
      currentInternalRanking: top5Rows,
      currentRanking: top5Rows,
      officialFrozenTop5: officialTop5Rows,
      frozenRanking: officialTop5Rows,
    },
    top5Movement: filterControlRows(data.top5Movement ?? [], sport),
    signalsDetected,
    signalsDetectedDetail: {
      ...data.signalsDetectedDetail,
      frozenSignals: signalsDetected,
      exclusiveRanking: exclusiveRows,
    },
    exclusiveTop3: {
      ...data.exclusiveTop3,
      currentInternalRanking: exclusiveRows,
      currentRanking: exclusiveRows,
      officialFrozenTop3: officialExclusiveRows,
      frozenRanking: officialExclusiveRows,
      movementHistory: filterControlRows(data.exclusiveTop3?.movementHistory ?? [], sport),
    },
    liveActivity: filterControlRows(data.liveActivity ?? [], sport),
  } as AtlasControlCenterData;
}

export function OverviewSportFilter({
  sports,
  selectedSport,
  onSportChange,
}: {
  sports: string[];
  selectedSport: AtlasControlSportFilter;
  onSportChange: (sport: AtlasControlSportFilter) => void;
}) {
  const normalizedSelected = normalizeControlSport(selectedSport);
  const officialSelected: OfficialSelectedSport =
    normalizedSelected === "ALL"
      ? "all"
      : officialSportCodeToSelectedSport[normalizedSelected as keyof typeof officialSportCodeToSelectedSport] ?? "all";
  return (
    <div className="relative h-[70px] overflow-visible rounded-xl border border-white/10 bg-[#030814]/95 px-3 pt-3 shadow-[0_0_22px_rgba(34,211,238,0.07)]">
      <OfficialSportSelectorRow
        selectedSport={officialSelected}
        onSelectSport={(sport) => {
          if (sport === "all") {
            onSportChange("ALL");
            return;
          }
          const code = officialSelectedSportToSportCode[sport];
          onSportChange(code);
        }}
        framed={false}
      />
    </div>
  );
}

const atlasControlTabs: Array<{ id: AtlasControlTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "top-signal", label: "Top Signal" },
  { id: "top5", label: "Top 5" },
  { id: "top3", label: "Top 3" },
  { id: "signals", label: "Signals Detected" },
];

export function AtlasControlCenterTabBar({
  tab,
  onTab,
}: {
  tab: AtlasControlTab;
  onTab: (tab: AtlasControlTab) => void;
}) {
  return (
    <div className="scrollbar-hide flex overflow-x-auto rounded-xl border border-white/10 bg-[#061223]">
      {atlasControlTabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTab(item.id)}
          className={`min-w-max flex-1 border-r border-white/8 px-3 py-2 text-[10px] font-black uppercase last:border-r-0 ${tab === item.id ? "bg-cyan-400/12 text-cyan-300" : "text-white/55"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AtlasControlCenterOverview({
  data,
  loading,
  error,
  engineDetailsOpen,
  leadersExpanded,
  onToggleEngineDetails,
  onToggleLeaders,
  onRefresh,
  onOpenTop5,
  onOpenTop3,
  onOpenSignals,
  selectedSport,
  onSportChange,
  showChrome = true,
  title = "Signal Engines",
  eyebrow = "Atlas Control Center",
  subtitle = "Live operational view of today’s Signal Engines.",
}: {
  data: AtlasControlCenterData | null;
  loading: boolean;
  error: string | null;
  engineDetailsOpen: boolean;
  leadersExpanded: boolean;
  onToggleEngineDetails: () => void;
  onToggleLeaders: () => void;
  onRefresh: () => void;
  onOpenTop5?: () => void;
  onOpenTop3?: () => void;
  onOpenSignals?: () => void;
  selectedSport?: AtlasControlSportFilter;
  onSportChange?: (sport: AtlasControlSportFilter) => void;
  showChrome?: boolean;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  const summary = data?.summary;
  const sportOptions = getAtlasControlSports(data);
  return (
    <section className="grid gap-2.5">
      {showChrome ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
              <h1 className="text-[24px] font-black uppercase tracking-[-0.03em] text-white">{title}</h1>
              <p className="text-xs font-bold text-white/45">{subtitle}</p>
            </div>
            <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50">
              {loading ? "Loading" : "Refresh"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold text-white/45">
            <span>Last updated: {formatAdminTime(summary?.generatedAt)}</span>
            <span>{formatAdminDate(summary?.slateDate)}</span>
          </div>
          {error ? <p className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-2 text-xs font-bold text-yellow-100">{error}</p> : null}
          {data?.errors?.length ? <p className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-2 text-xs font-bold text-yellow-100">{data.errors.join(" · ")}</p> : null}

          {!data && loading ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">Loading Control Center...</p> : null}
          {!data && !loading ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">No Control Center data available.</p> : null}
        </>
      ) : null}

      {data && selectedSport && onSportChange ? (
        <OverviewSportFilter sports={sportOptions} selectedSport={selectedSport} onSportChange={onSportChange} />
      ) : null}

      {data ? (
        <>
          <ControlEngineStatusBar rows={data.engineHealth} summary={summary} />
          <ControlTopSignalCurrentLeader data={data.topSignal} />
          <ControlLeadersToday
            rows={data.topSignal?.leadersToday ?? []}
            secondPlace={data.topSignal?.secondPlaceCandidate ?? null}
            expanded={leadersExpanded}
            onToggle={onToggleLeaders}
          />
          <AdminShellCard className="p-2.5">
            <button type="button" onClick={onToggleEngineDetails} className="flex w-full items-center justify-between text-[11px] font-black uppercase text-cyan-300">
              <span>{engineDetailsOpen ? "Hide Engine Details ↑" : "Open Engine Details →"}</span>
              <span className="text-white/35">{engineDetailsOpen ? "Expanded" : "Compact"}</span>
            </button>
            {engineDetailsOpen ? <ControlOverviewDetails data={data} summary={summary} /> : null}
          </AdminShellCard>
          <ControlSignalPreview
            title="Premium Top 5"
            rows={(data.top5?.currentInternalRanking ?? []).slice(0, 5)}
            empty="No Premium Top 5 ranking yet."
            action={onOpenTop5 ? <button type="button" onClick={onOpenTop5}>Open Top 5 →</button> : null}
          />
          <ControlSignalPreview
            title="Exclusive Top 3"
            rows={(data.exclusiveTop3?.currentInternalRanking ?? []).slice(0, 3)}
            empty="No Exclusive Top 3 ranking yet."
            action={onOpenTop3 ? <button type="button" onClick={onOpenTop3}>Open Exclusive Top 3 →</button> : null}
          />
          <ControlSignalPreview
            title="Signals Detected"
            rows={(data.signalsDetected ?? []).slice(0, 5)}
            empty="No frozen Signals Detected rows yet."
            action={onOpenSignals ? <button type="button" onClick={onOpenSignals}>View All Signals →</button> : null}
          />
        </>
      ) : null}
    </section>
  );
}

export function AtlasControlCenterPanel({
  data,
  loading,
  error,
  mode,
  tab,
  activityFilter,
  engineDetailsOpen,
  leadersExpanded,
  selectedSport,
  showHeader = true,
  showSportFilter = true,
  onTab,
  onActivityFilter,
  onToggleEngineDetails,
  onToggleLeaders,
  onSportChange,
  onRefresh,
  onModeChange,
}: {
  data: AtlasControlCenterData | null;
  loading: boolean;
  error: string | null;
  mode: AtlasControlMode;
  tab: AtlasControlTab;
  activityFilter: AtlasActivityFilter;
  engineDetailsOpen: boolean;
  leadersExpanded: boolean;
  selectedSport: AtlasControlSportFilter;
  showHeader?: boolean;
  showSportFilter?: boolean;
  onTab: (tab: AtlasControlTab) => void;
  onActivityFilter: (filter: AtlasActivityFilter) => void;
  onToggleEngineDetails: () => void;
  onToggleLeaders: () => void;
  onSportChange: (sport: AtlasControlSportFilter) => void;
  onRefresh: () => void;
  onModeChange: (mode: AtlasControlMode) => void;
}) {
  const activityFilters: AtlasActivityFilter[] = ["ALL", "TOP SIGNAL", "TOP 5", "EXCLUSIVE", "SIGNALS", "VALIDATION", "ERRORS"];
  const filteredData = filterAtlasControlCenterData(data, selectedSport);
  const summary = filteredData?.summary;
  const filteredActivity = filterActivity(filteredData?.liveActivity ?? [], activityFilter);
  const sportOptions = getAtlasControlSports(data);
  return (
    <section className="grid gap-2.5">
      {showHeader ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Atlas Control Center</p>
              <h1 className="text-[24px] font-black uppercase tracking-[-0.03em] text-white">Signal Engines</h1>
              <p className="text-xs font-bold text-white/45">Live operational view of today’s Signal Engines.</p>
            </div>
            <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50">
              {loading ? "Loading" : "Refresh"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold text-white/45">
            <span>Last updated: {formatAdminTime(summary?.generatedAt)}</span>
            <span>{formatAdminDate(summary?.slateDate)}</span>
          </div>
        </>
      ) : null}
      {error ? <p className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-2 text-xs font-bold text-yellow-100">{error}</p> : null}
      {data?.errors?.length ? <p className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-2 text-xs font-bold text-yellow-100">{data.errors.join(" · ")}</p> : null}

      {data && showSportFilter ? <OverviewSportFilter sports={sportOptions} selectedSport={selectedSport} onSportChange={onSportChange} /> : null}

      {data ? (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-[#061223]">
          {([
            ["live", "Live Engine"],
            ["official", "Official Products"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={`px-3 py-2.5 text-[11px] font-black uppercase ${mode === id ? "bg-cyan-400/12 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)]" : "text-white/55"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <AtlasControlCenterTabBar tab={tab} onTab={onTab} />

      {!data && loading ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">Loading Control Center...</p> : null}
      {!data && !loading ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">No Control Center data available.</p> : null}

      {filteredData ? (
        <>
          {tab === "overview" ? (
            mode === "live" ? (
              <AtlasControlCenterOverview
                data={filteredData}
                loading={loading}
                error={error}
                engineDetailsOpen={engineDetailsOpen}
                leadersExpanded={leadersExpanded}
                onToggleEngineDetails={onToggleEngineDetails}
                onToggleLeaders={onToggleLeaders}
                onRefresh={onRefresh}
                onOpenTop5={() => onTab("top5")}
                onOpenTop3={() => onTab("top3")}
                onOpenSignals={() => onTab("signals")}
                showChrome={false}
              />
            ) : (
              <>
                <ProductStatusPanel status={filteredData.officialProducts?.productStatus} />
                <ControlTopSignalCurrentLeader data={filteredData.officialProducts?.topSignal ?? null} title="Top Signal Published" />
                <ControlSignalPreview
                  title="Official Premium Top 5"
                  rows={(filteredData.officialProducts?.premiumTop5 ?? []).slice(0, 5)}
                  empty="Official Premium Top 5 has not been published yet."
                  action={onTab ? <button type="button" onClick={() => onTab("top5")}>Open Official Top 5 →</button> : null}
                />
                <ControlSignalPreview
                  title="Official Exclusive Top 3"
                  rows={(filteredData.officialProducts?.exclusiveTop3 ?? []).slice(0, 3)}
                  empty="Official Exclusive Top 3 has not been published yet."
                  action={onTab ? <button type="button" onClick={() => onTab("top3")}>Open Exclusive Top 3 →</button> : null}
                />
                <ControlSignalPreview
                  title="Signals Detected Frozen"
                  rows={(filteredData.officialProducts?.signalsDetected ?? []).slice(0, 5)}
                  empty="No frozen Signals Detected rows yet."
                  action={onTab ? <button type="button" onClick={() => onTab("signals")}>View Frozen Signals →</button> : null}
                />
              </>
            )
          ) : null}

          {tab === "top-signal" ? (
            mode === "live" ? (
              <>
                <ControlTopSignalHero data={filteredData.topSignal} />
                <ControlTopSignalStrength strength={filteredData.topSignal?.strength} />
                <ControlSection title="Second Place Candidate">
                  <SecondPlaceCandidate candidate={filteredData.topSignal?.secondPlaceCandidate ?? null} />
                </ControlSection>
                <ControlSection title="Top Signal Story">
                  <ControlTopSignalSessionTimeline sessions={filteredData.topSignal?.sessions ?? []} fallbackRows={filteredData.topSignalTimeline ?? []} />
                </ControlSection>
                <ControlSection title="Why Atlas Changed">
                  <ControlChangeReasons rows={filteredData.topSignal?.changeReasons ?? []} />
                </ControlSection>
              </>
            ) : (
              <ControlTopSignalCurrentLeader data={filteredData.officialProducts?.topSignal ?? null} title="Top Signal Published" />
            )
          ) : null}

          {tab === "top5" ? (
            mode === "live" ? (
              <>
              <ControlSection title="Current Internal Ranking" action={`Next ${formatAdminTime(filteredData.top5?.nextRecalculation)}`}>
                <ControlRankingList rows={filteredData.top5?.currentInternalRanking ?? []} empty="No current Premium Top 5 ranking." />
              </ControlSection>
              <ControlSection title="Top 5 Movement History">
                <ControlActivityList rows={(filteredData.top5Movement ?? []).map((row) => ({ timestamp: row.timestamp, engine: row.movementType ?? row.trend, event: row.event, affectedSignal: row.signal ?? "", description: `${row.previousRank ? `#${row.previousRank}` : "—"} → ${row.newRank ? `#${row.newRank}` : "OUT"} · Prob ${controlDeltaPct(row.probabilityDelta)} · Score ${controlSigned(row.scoreDelta)}`, severity: "INFO" }))} />
              </ControlSection>
              </>
            ) : (
              <ControlSection title="Official Frozen Top 5" action={filteredData.top5?.frozen ? "Frozen" : "Pending"}>
                <ControlRankingList rows={filteredData.officialProducts?.premiumTop5 ?? []} empty="Official Top 5 has not frozen yet." />
              </ControlSection>
            )
          ) : null}

          {tab === "top3" ? (
            mode === "live" ? (
              <>
              <ControlSection title="Exclusive Top 3 Internal Ranking" action={filteredData.exclusiveTop3?.frozen ? "Frozen" : "Live"}>
                <ControlRankingList rows={filteredData.exclusiveTop3?.currentInternalRanking ?? []} empty="No Exclusive Top 3 ranking yet." />
              </ControlSection>
              <ControlSection title="Exclusive Top 3 Movement">
                <ControlActivityList rows={(filteredData.exclusiveTop3?.movementHistory ?? []).map((row: any) => ({ timestamp: row.timestamp, engine: row.movementType ?? row.trend, event: row.event, affectedSignal: row.signal ?? "", description: `${row.previousRank ? `#${row.previousRank}` : "—"} → ${row.newRank ? `#${row.newRank}` : "OUT"} · Prob ${controlDeltaPct(row.probabilityDelta)} · Score ${controlSigned(row.scoreDelta)}`, severity: "INFO" }))} />
              </ControlSection>
              </>
            ) : (
              <ControlSection title="Official Frozen Exclusive Top 3" action={filteredData.exclusiveTop3?.frozen ? "Frozen" : "Pending"}>
                <ControlRankingList rows={filteredData.officialProducts?.exclusiveTop3 ?? []} empty="Official Exclusive Top 3 has not frozen yet." />
              </ControlSection>
            )
          ) : null}

          {tab === "signals" ? (
            mode === "live" ? (
              <ControlSignalPreview
                title="Current Signals Ranking"
                rows={filteredData.exclusiveTop3?.currentInternalRanking ?? []}
                empty="No current signals ranking yet."
              />
            ) : (
              <ControlSection title="Frozen Signals Detected">
                <ControlSignalsDetectedList rows={filteredData.officialProducts?.signalsDetected ?? []} />
              </ControlSection>
            )
          ) : null}

          {tab === "activity" ? (
            <>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                {activityFilters.map((item) => (
                  <button key={item} type="button" onClick={() => onActivityFilter(item)} className={`min-w-max rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase ${activityFilter === item ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-200" : "border-white/10 bg-white/[0.03] text-white/50"}`}>
                    {item}
                  </button>
                ))}
              </div>
              <ControlSection title="Live Engine Activity">
                <ControlActivityList rows={filteredActivity} />
              </ControlSection>
              <ControlSection title="Daily Operations Timeline">
                <ControlOperationsTimeline rows={filteredData.operationsTimeline ?? []} />
              </ControlSection>
            </>
          ) : null}

          {tab === "health" ? (
            <>
              <ControlSection title="Engine Health">
                <ControlHealthTable rows={filteredData.engineHealth ?? []} />
              </ControlSection>
              <ControlSection title="Data Sources">
                <div className="flex flex-wrap gap-2">
                  {(filteredData.dataSources ?? []).map((source) => <span key={source} className="rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-200">{source}</span>)}
                </div>
              </ControlSection>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const performanceSports: Array<{ id: PerformanceSport; label: string; icon: string }> = [
  { id: "MLB", label: "MLB", icon: "⚾" },
  { id: "NBA", label: "NBA", icon: "🏀" },
  { id: "NFL", label: "NFL", icon: "🏈" },
  { id: "NHL", label: "NHL", icon: "🏒" },
  { id: "SOCCER", label: "SOCCER", icon: "⚽" },
];

const performanceViews: Array<{ id: PerformanceView; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◔" },
  { id: "top-signal-history", label: "Top Signal History", icon: "☯" },
  { id: "top5-performance", label: "Top 5 Performance", icon: "★" },
  { id: "market-performance", label: "Market Performance", icon: "▥" },
];

const performancePeriods: Array<{ id: PerformancePeriod; label: string }> = [
  { id: "this-week", label: "This Week" },
  { id: "last-7-days", label: "Last 7 Days" },
  { id: "this-month", label: "This Month" },
  { id: "last-30-days", label: "Last 30 Days" },
  { id: "season", label: "Season" },
  { id: "year", label: "Year" },
  { id: "all-time", label: "All Time" },
];

function perfPct(value: unknown) {
  if (typeof value !== "number") return "UNAVAILABLE";
  return `${(value * 100).toFixed(1)}%`;
}

function perfNumber(value: unknown, prefix = "") {
  if (typeof value !== "number") return "UNAVAILABLE";
  return `${value >= 0 && prefix ? prefix : ""}${value.toFixed(2)}`;
}

function perfDate(value: string | null | undefined) {
  if (!value) return "UNAVAILABLE";
  return formatAdminTime(value);
}

function sampleTone(status: string) {
  if (status === "RELIABLE") return "text-emerald-300";
  if (status === "DEVELOPING") return "text-yellow-300";
  return "text-white/45";
}

function PerformanceMetricStrip({ metric }: { metric?: PerformanceMetricSet }) {
  const items = [
    { label: "Top Signals Graded", value: metric?.graded ?? 0, tone: "text-sky-400" },
    { label: "Won", value: metric?.won ?? 0, tone: "text-emerald-300" },
    { label: "Lost", value: metric?.lost ?? 0, tone: "text-red-300" },
    { label: "Push", value: metric?.push ?? 0, tone: "text-white" },
    { label: "Win Rate", value: perfPct(metric?.winRate), tone: "text-emerald-300" },
  ];
  const lower = [
    { label: "Units", value: perfNumber(metric?.units, "+"), tone: "text-emerald-300" },
    { label: "ROI", value: perfPct(metric?.roi), tone: "text-emerald-300" },
    { label: "Avg CLV", value: perfNumber(metric?.averageClv, "+"), tone: "text-emerald-300" },
    { label: "Last Graded", value: perfDate(metric?.lastGraded), tone: "text-white" },
    { label: "Sample Status", value: metric?.sampleStatus ?? "NO DATA", tone: sampleTone(metric?.sampleStatus ?? "") },
  ];

  return (
    <div className="grid gap-2">
      <AdminShellCard className="grid grid-cols-5 divide-x divide-white/10 p-0">
        {items.map((item) => (
          <div key={item.label} className="min-h-[70px] px-2 py-3 text-center">
            <p className="text-[9px] font-black uppercase leading-tight text-white/60">{item.label}</p>
            <p className={`mt-2 text-[21px] font-black leading-none ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </AdminShellCard>
      <AdminShellCard className="grid grid-cols-5 divide-x divide-white/10 p-0">
        {lower.map((item) => (
          <div key={item.label} className="min-h-[64px] px-2 py-3 text-center">
            <p className="text-[9px] font-black uppercase leading-tight text-white/60">{item.label}</p>
            <p className={`mt-2 text-[15px] font-black leading-none ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </AdminShellCard>
    </div>
  );
}

function PerformanceSection({ title, icon, action, children }: { title: string; icon: string; action?: string; children: React.ReactNode }) {
  return (
    <AdminShellCard className="p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[17px] font-black uppercase text-white">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">{icon}</span>
          {title}
        </h2>
        {action ? <button className="text-[11px] font-black uppercase text-sky-400">{action} ›</button> : null}
      </div>
      {children}
    </AdminShellCard>
  );
}

function MetricTable({ rows, type }: { rows: Array<PerformanceMetricSet & { label?: string; market?: string; rank?: number }>; type: "history" | "rank" | "market" }) {
  if (!rows.length) return <p className="rounded-xl border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">No graded data yet.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="hidden grid-cols-[1.2fr_0.65fr_0.65fr_0.65fr_0.65fr_0.8fr_0.8fr_0.8fr] border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase text-white/45 md:grid">
        <span>{type === "rank" ? "Rank" : type === "market" ? "Market" : "Date Range"}</span>
        <span>Graded</span>
        <span>Won</span>
        <span>Lost</span>
        <span>Push</span>
        <span>Win Rate</span>
        <span>ROI</span>
        <span>Avg CLV</span>
      </div>
      {rows.map((row) => (
        <div key={`${row.label ?? row.market ?? row.rank}`} className="grid gap-2 border-b border-white/8 px-3 py-2 last:border-b-0 md:grid-cols-[1.2fr_0.65fr_0.65fr_0.65fr_0.65fr_0.8fr_0.8fr_0.8fr] md:items-center md:gap-0">
          <div className="flex items-center justify-between gap-2 md:block">
            <span className="text-sm font-black text-white">{row.label ?? row.market ?? `Rank ${row.rank}`}</span>
            <span className={`rounded-md bg-white/5 px-2 py-1 text-[9px] font-black uppercase md:hidden ${sampleTone(row.sampleStatus)}`}>{row.sampleStatus}</span>
          </div>
          <span className="text-xs font-bold text-white/70 md:text-sm">{row.graded}</span>
          <span className="text-xs font-black text-emerald-300 md:text-sm">{row.won}</span>
          <span className="text-xs font-black text-red-300 md:text-sm">{row.lost}</span>
          <span className="text-xs font-black text-white md:text-sm">{row.push}</span>
          <span className="text-xs font-black text-emerald-300 md:text-sm">{perfPct(row.winRate)}</span>
          <span className="text-xs font-black text-emerald-300 md:text-sm">{perfPct(row.roi)}</span>
          <span className="text-xs font-black text-emerald-300 md:text-sm">{perfNumber(row.averageClv, "+")}</span>
        </div>
      ))}
    </div>
  );
}

function MarketCards({ rows }: { rows: Array<PerformanceMetricSet & { market: string }> }) {
  if (!rows.length) return <p className="rounded-xl border border-white/10 bg-black/15 p-4 text-center text-sm font-bold text-white/45">NO DATA</p>;
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {rows.map((row) => (
        <div key={row.market} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-cyan-300">{row.market}</h3>
            <span className={`rounded-md bg-white/5 px-2 py-1 text-[9px] font-black uppercase ${sampleTone(row.sampleStatus)}`}>{row.sampleStatus}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniMetric label="Picks" value={row.graded} />
            <MiniMetric label="W-L-P" value={`${row.won}-${row.lost}-${row.push}`} />
            <MiniMetric label="Win Rate" value={perfPct(row.winRate)} />
            <MiniMetric label="Units" value={perfNumber(row.units, "+")} />
            <MiniMetric label="ROI" value={perfPct(row.roi)} />
            <MiniMetric label="Avg CLV" value={perfNumber(row.averageClv, "+")} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [controlCenter, setControlCenter] = useState<AtlasControlCenterData | null>(null);
  const [controlLoading, setControlLoading] = useState(true);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlTab, setControlTab] = useState<AtlasControlTab>("overview");
  const [controlMode, setControlMode] = useState<AtlasControlMode>("live");
  const [controlActivityFilter, setControlActivityFilter] = useState<AtlasActivityFilter>("ALL");
  const [controlSportFilter, setControlSportFilter] = useState<AtlasControlSportFilter>("ALL");
  const [controlEngineDetailsOpen, setControlEngineDetailsOpen] = useState(false);
  const [controlLeadersExpanded, setControlLeadersExpanded] = useState(false);
  const [cronRunning, setCronRunning] = useState<string | null>(null);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [researchView, setResearchView] = useState<"summary" | "system">("summary");
  const [selectedSystemGameId, setSelectedSystemGameId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("control");
  const [performanceSport, setPerformanceSport] = useState<PerformanceSport>("MLB");
  const [performanceView, setPerformanceView] = useState<PerformanceView>("overview");
  const [performancePeriod, setPerformancePeriod] = useState<PerformancePeriod>("this-month");
  const [performanceProduct, setPerformanceProduct] = useState<"global" | "by-product">("global");
  const [performanceCenter, setPerformanceCenter] = useState<PerformanceCenterData | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  const totals = useMemo(() => {
    const sports = overview?.sports ?? [];

    return {
      publicSignals: sports.reduce((sum, item) => sum + item.today.publicSignals, 0),
      top5Live: sports.reduce((sum, item) => sum + item.today.top5Live, 0),
      top5History: sports.reduce((sum, item) => sum + item.today.top5History, 0),
      topSignalHistory: sports.reduce((sum, item) => sum + item.today.topSignalHistory, 0),
    };
  }, [overview]);

  const researchGames = overview?.researchDashboard?.games ?? [];
  const systemGames = selectedSystemGameId
    ? researchGames.filter((game) => game.id === selectedSystemGameId)
    : researchGames;

  function openSystemDetails(gameId: string) {
    setSelectedSystemGameId(gameId);
    setResearchView("system");
  }

  async function loadOverview() {
    setLoading(true);
    setCronResult(null);

    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const data = await response.json();

    if (response.ok) {
      setOverview(data);
    } else {
      setOverview(null);
      setCronResult(data?.error ?? "Unable to load admin overview");
    }

    setLoading(false);
  }

  async function loadControlCenter(options: { silent?: boolean } = {}) {
    if (!options.silent) setControlLoading(true);
    setControlError(null);

    try {
      const response = await fetch("/api/admin/atlas-control-center", { cache: "no-store" });
      const data = await response.json();

      if (response.ok) {
        setControlCenter(data);
      } else {
        setControlError(data?.error ?? "Unable to load Atlas Control Center");
      }
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Unable to load Atlas Control Center");
    } finally {
      setControlLoading(false);
    }
  }

  async function runCron(path: string) {
    const confirmed = window.confirm(`Run ${path}? This will execute the existing cron now.`);
    if (!confirmed) return;

    setCronRunning(path);
    setCronResult(null);

    const response = await fetch("/api/admin/run-cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await response.json();

    setCronRunning(null);
    setCronResult(`${path}: ${data.success ? "OK" : "FAILED"} (${data.status ?? response.status})`);
    await loadOverview();
  }

  async function loadPerformanceCenter(sport = performanceSport, period = performancePeriod) {
    setPerformanceLoading(true);
    const response = await fetch(`/api/admin/performance-center?sport=${sport}&period=${period}`, { cache: "no-store" });
    const data = await response.json();
    setPerformanceCenter(response.ok ? data : null);
    setPerformanceLoading(false);
  }

  useEffect(() => {
    const savedView = window.sessionStorage.getItem("atlas-admin-research-view");
    if (savedView === "summary" || savedView === "system") setResearchView(savedView);
    const savedSport = window.sessionStorage.getItem("atlas-admin-performance-sport") as PerformanceSport | null;
    const savedPeriod = window.sessionStorage.getItem("atlas-admin-performance-period") as PerformancePeriod | null;
    const savedPerfView = window.sessionStorage.getItem("atlas-admin-performance-view") as PerformanceView | null;
    if (savedSport && performanceSports.some((item) => item.id === savedSport)) setPerformanceSport(savedSport);
    if (savedPeriod && performancePeriods.some((item) => item.id === savedPeriod)) setPerformancePeriod(savedPeriod);
    if (savedPerfView && performanceViews.some((item) => item.id === savedPerfView)) setPerformanceView(savedPerfView);
    loadOverview();
    loadControlCenter();
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("atlas-admin-research-view", researchView);
  }, [researchView]);

  useEffect(() => {
    window.sessionStorage.setItem("atlas-admin-performance-sport", performanceSport);
    window.sessionStorage.setItem("atlas-admin-performance-period", performancePeriod);
    window.sessionStorage.setItem("atlas-admin-performance-view", performanceView);
    if (activeSection === "performance") void loadPerformanceCenter(performanceSport, performancePeriod);
  }, [activeSection, performanceSport, performancePeriod, performanceView]);

  useEffect(() => {
    if (activeSection !== "control") return;
    if (controlMode !== "live") return;
    const interval = window.setInterval(() => {
      void loadControlCenter({ silent: true });
    }, 45000);
    return () => window.clearInterval(interval);
  }, [activeSection, controlMode]);

  const operations = overview?.operations;
  const adminNav: Array<{ id: AdminSection; label: string; icon: string }> = [
    { id: "control", label: "Control", icon: "⌁" },
    { id: "operations", label: "Operations", icon: "▱" },
    { id: "research", label: "Research", icon: "⌬" },
    { id: "performance", label: "Performance", icon: "▥" },
    { id: "more", label: "More", icon: "•••" },
  ];

  const researchPanel = (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Research</p>
          <h1 className="text-[26px] font-black text-white">Atlas Research Dashboard</h1>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-[#071322]">
          <button
            type="button"
            onClick={() => {
              setResearchView("summary");
              setSelectedSystemGameId(null);
            }}
            className={`px-4 py-2 text-[11px] font-black uppercase ${researchView === "summary" ? "bg-cyan-400/12 text-cyan-300" : "text-white/55"}`}
          >
            Resumen
          </button>
          <button
            type="button"
            onClick={() => setResearchView("system")}
            className={`px-4 py-2 text-[11px] font-black uppercase ${researchView === "system" ? "bg-cyan-400/12 text-cyan-300" : "text-white/55"}`}
          >
            Sistema
          </button>
        </div>
      </div>
      <div className="grid gap-3">
        {researchView === "summary"
          ? researchGames.map((game) => <SummaryGameCard key={game.id} game={game} onSystem={openSystemDetails} />)
          : systemGames.map((game) => <ResearchGameCard key={game.id} game={game} />)}
        {!researchGames.length ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/50">No research snapshots available yet.</p>
        ) : null}
        {researchView === "system" && selectedSystemGameId ? (
          <button
            type="button"
            onClick={() => {
              setResearchView("summary");
              setSelectedSystemGameId(null);
            }}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white/70"
          >
            Back to Resumen
          </button>
        ) : null}
      </div>
    </section>
  );

  const currentPeriodLabel = performancePeriods.find((item) => item.id === performancePeriod)?.label ?? "This Month";
  const currentSportLabel = performanceSports.find((item) => item.id === performanceSport)?.label ?? "MLB";
  const performanceData = performanceCenter;
  const performancePanel = (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[25px] font-black uppercase tracking-[-0.03em] text-white">Performance</h1>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live
          </span>
        </div>
        <div className="rounded-lg border border-slate-600/70 bg-[#071322] px-2 py-1.5 text-[10px] font-black uppercase text-white">
          ▣ {formatAdminDate(operations?.date ?? overview?.today)}
        </div>
      </div>

      <div className="scrollbar-hide flex overflow-x-auto rounded-xl border border-white/10 bg-[#061223]">
        {performanceSports.map((sport) => (
          <button
            key={sport.id}
            type="button"
            onClick={() => setPerformanceSport(sport.id)}
            className={`flex min-w-[126px] flex-1 items-center justify-center gap-2 border-r border-white/8 px-3 py-3 text-sm font-black uppercase last:border-r-0 ${performanceSport === sport.id ? "border-cyan-400/45 bg-cyan-400/10 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.28)]" : "text-white/72"}`}
          >
            <span className="text-[22px]">{sport.icon}</span>
            {sport.label}
          </button>
        ))}
      </div>

      <div className="scrollbar-hide flex gap-3 overflow-x-auto border-b border-white/10">
        {performanceViews.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setPerformanceView(view.id)}
            className={`flex min-w-max items-center gap-2 border-b-2 px-1 py-2 text-[11px] font-black uppercase ${performanceView === view.id ? "border-cyan-400 text-cyan-300" : "border-transparent text-white/58"}`}
          >
            <span>{view.icon}</span>
            {view.label}
          </button>
        ))}
      </div>

      <div className="scrollbar-hide flex overflow-x-auto rounded-xl border border-white/10 bg-[#061223]">
        {performancePeriods.map((period) => (
          <button
            key={period.id}
            type="button"
            onClick={() => setPerformancePeriod(period.id)}
            className={`min-w-[118px] border-r border-white/8 px-3 py-2 text-[10px] font-black uppercase last:border-r-0 ${performancePeriod === period.id ? "bg-cyan-400/12 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.32)]" : "text-white/55"}`}
          >
            {period.label}
          </button>
        ))}
      </div>

      {performanceLoading ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">Loading performance center...</p> : null}
      {!performanceLoading && !performanceData ? <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold text-white/55">No graded data yet.</p> : null}

      {performanceData ? (
        <>
          {performanceView === "overview" ? (
            <>
              <PerformanceMetricStrip metric={performanceData.overview} />
              <PerformanceSection title="Top Signal History" icon="☯" action="View Full History">
                <MetricTable rows={[{ label: currentPeriodLabel, ...performanceData.topSignalHistory }]} type="history" />
              </PerformanceSection>
              <PerformanceSection title="Top 5 Performance" icon="★" action="View Full Analysis">
                <div className="grid gap-3 md:grid-cols-[0.9fr_1.6fr]">
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <h3 className="mb-2 text-xs font-black uppercase text-white/70">Summary</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniMetric label="Total Picks" value={performanceData.top5Performance.graded} />
                      <MiniMetric label="Won" value={performanceData.top5Performance.won} />
                      <MiniMetric label="Lost" value={performanceData.top5Performance.lost} />
                      <MiniMetric label="Push" value={performanceData.top5Performance.push} />
                      <MiniMetric label="Units" value={perfNumber(performanceData.top5Performance.units, "+")} />
                      <MiniMetric label="ROI" value={perfPct(performanceData.top5Performance.roi)} />
                    </div>
                  </div>
                  <MetricTable rows={performanceData.top5Performance.byRank} type="rank" />
                </div>
              </PerformanceSection>
              <PerformanceSection title="Market Performance" icon="▥" action="View Full Analysis">
                <MarketCards rows={performanceData.marketPerformance.global} />
              </PerformanceSection>
            </>
          ) : null}

          {performanceView === "top-signal-history" ? (
            <PerformanceSection title={`${currentSportLabel} Top Signal History`} icon="☯">
              <MetricTable rows={[{ label: currentPeriodLabel, ...performanceData.topSignalHistory }]} type="history" />
            </PerformanceSection>
          ) : null}

          {performanceView === "top5-performance" ? (
            <PerformanceSection title={`${currentSportLabel} Top 5 Performance`} icon="★">
              <PerformanceMetricStrip metric={performanceData.top5Performance} />
              <div className="mt-3">
                <MetricTable rows={performanceData.top5Performance.byRank} type="rank" />
              </div>
            </PerformanceSection>
          ) : null}

          {performanceView === "market-performance" ? (
            <PerformanceSection title={`${currentSportLabel} Market Performance`} icon="▥">
              <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/20 md:w-[320px]">
                <button type="button" onClick={() => setPerformanceProduct("global")} className={`px-4 py-2 text-[11px] font-black uppercase ${performanceProduct === "global" ? "bg-cyan-400/12 text-cyan-300" : "text-white/55"}`}>Global</button>
                <button type="button" onClick={() => setPerformanceProduct("by-product")} className={`px-4 py-2 text-[11px] font-black uppercase ${performanceProduct === "by-product" ? "bg-cyan-400/12 text-cyan-300" : "text-white/55"}`}>By Product</button>
              </div>
              {performanceProduct === "global" ? (
                <MarketCards rows={performanceData.marketPerformance.global} />
              ) : (
                <div className="grid gap-3">
                  <details open className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <summary className="cursor-pointer text-sm font-black uppercase text-white">Top 5</summary>
                    <div className="mt-3"><MarketCards rows={performanceData.marketPerformance.byProduct.top5} /></div>
                  </details>
                  <details className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <summary className="cursor-pointer text-sm font-black uppercase text-white">Top Signal</summary>
                    <div className="mt-3"><MarketCards rows={performanceData.marketPerformance.byProduct.topSignal} /></div>
                  </details>
                </div>
              )}
            </PerformanceSection>
          ) : null}

          <AdminShellCard className="p-3">
            <div className="grid gap-1 text-[10px] font-bold text-white/45">
              <p>Win Rate = Won / (Won + Lost). Pushes no entran en Win Rate.</p>
              <p>ROI = Units / Risked Units. Solo se incluyen picks oficiales.</p>
              <p>Pending, Removed y Void están excluidos. Datos por deporte no se mezclan.</p>
              <p>Tables: {performanceData.tables.top5History ?? "NO TOP 5 TABLE"} · {performanceData.tables.topSignalHistory ?? "NO TOP SIGNAL TABLE"}</p>
            </div>
          </AdminShellCard>
        </>
      ) : null}
    </section>
  );

  const morePanel = (
    <section className="grid gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">More</p>
        <h1 className="text-[26px] font-black text-white">System Controls</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {["History", "Clients", "Database", "Settings"].map((item) => (
          <AdminShellCard key={item} className="p-4">
            <p className="text-[15px] font-black text-white">{item}</p>
            <p className="mt-1 text-xs font-bold text-white/48">Internal Atlas tools</p>
          </AdminShellCard>
        ))}
      </div>
      <AdminShellCard className="p-4">
        <h2 className="text-[16px] font-black uppercase text-white">Database</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <MiniMetric label="Health" value={operations?.database?.health ?? "Loading"} />
          <MiniMetric label="Snapshots" value={operations?.database?.snapshots ?? 0} />
          <MiniMetric label="Cron" value={operations?.database?.cron ?? "N/A"} />
          <MiniMetric label="Storage" value={operations?.database?.storage ?? "N/A"} />
        </div>
      </AdminShellCard>
      <AdminShellCard className="p-4">
        <h2 className="text-[16px] font-black uppercase text-white">Cron</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(overview?.crons ?? []).slice(0, 8).map((cron) => (
            <button
              key={cron.path}
              onClick={() => runCron(cron.path)}
              disabled={Boolean(cronRunning)}
              className="rounded-xl border border-cyan-400/15 bg-cyan-950/10 p-3 text-left transition hover:border-cyan-300/45 disabled:opacity-50"
            >
              <span className="block text-xs font-black text-white">{cron.path}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">{cronRunning === cron.path ? "Running" : cron.schedule}</span>
            </button>
          ))}
        </div>
      </AdminShellCard>
    </section>
  );

  const operationsPanel = (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[23px] font-black uppercase tracking-[-0.03em] text-white">Operations</h1>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live
          </span>
        </div>
        <div className="rounded-lg border border-slate-600/70 bg-[#071322] px-2 py-1.5 text-[10px] font-black uppercase text-white">
          ▣ {formatAdminDate(operations?.date ?? overview?.today)}
        </div>
      </div>
      <AtlasCoreHealth operations={operations} />
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <OperationMetricCard label="Signals Detected" value={operations?.signalsDetected ?? 0} sub="Free View" />
        <OperationMetricCard label="Validated Picks" value={operations?.validatedPicks ?? 0} sub="Subscribers" tone="green" />
        <OperationMetricCard label="Top Signal" value={operations?.topSignalPublished ? 1 : 0} sub={operations?.topSignalPublished ? "Published" : "Pending"} tone="purple" />
        <OperationMetricCard
          label="Next Game"
          value={operations?.nextGame?.startTime ? formatAdminTime(operations.nextGame.startTime) : "No Games"}
          sub={operations?.nextGame?.awayTeam && operations?.nextGame?.homeTeam ? `${shortTeam(operations.nextGame.awayTeam)} @ ${shortTeam(operations.nextGame.homeTeam)} · ${operations.nextGame.status ?? "Scheduled"}` : "Remaining"}
          tone="white"
        />
      </div>
      <AdminTopSignalCard operations={operations} />
      <AdminTop5Card operations={operations} />
      <PipelineStatus operations={operations} />
      <TodaysStatus operations={operations} />
      <RecentActivity operations={operations} />
      <BusinessSnapshot operations={operations} />
    </section>
  );

  const controlPanel = (
    <AtlasControlCenterPanel
      data={controlCenter}
      loading={controlLoading}
      error={controlError}
      mode={controlMode}
      tab={controlTab}
      activityFilter={controlActivityFilter}
      engineDetailsOpen={controlEngineDetailsOpen}
      leadersExpanded={controlLeadersExpanded}
      selectedSport={controlSportFilter}
      onTab={setControlTab}
      onModeChange={setControlMode}
      onActivityFilter={setControlActivityFilter}
      onToggleEngineDetails={() => setControlEngineDetailsOpen((open) => !open)}
      onToggleLeaders={() => setControlLeadersExpanded((open) => !open)}
      onSportChange={setControlSportFilter}
      onRefresh={() => void loadControlCenter()}
    />
  );

  return (
    <main className="min-h-screen bg-[#020915] text-white">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[210px] border-r border-white/10 bg-[#03101f] px-5 py-6 lg:block">
        <div className="mb-10">
          <p className="text-[23px] font-black uppercase tracking-[0.16em] text-white">Atlas</p>
          <p className="text-[15px] font-black uppercase tracking-[0.34em] text-cyan-300">Signals</p>
        </div>
        <nav className="grid gap-2">
          {adminNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold ${activeSection === item.id ? "bg-cyan-400/10 text-cyan-300" : "text-white/62"}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-6 left-5 right-5 rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[11px] font-black uppercase text-white">System Status</p>
          <p className="mt-2 text-[11px] font-bold text-emerald-300">{operations?.database?.health === "warnings" ? "Warnings detected" : "All Systems Operational"}</p>
        </div>
      </aside>

      <div className="min-h-screen pb-20 lg:ml-[210px] lg:pb-6">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#020915]/95 px-4 py-2 backdrop-blur lg:static lg:px-8 lg:py-2.5">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button className="grid h-7 w-7 place-items-center text-[25px] text-white/85 lg:hidden">≡</button>
            <AtlasAdminLogo />
            <button className="relative grid h-7 w-7 place-items-center text-lg text-white/85">
              ♧
              <span className="absolute right-0 top-0 grid h-3.5 w-3.5 place-items-center rounded-full bg-sky-500 text-[8px] font-black text-white">3</span>
            </button>
          </div>
        </header>

        <div className="mx-auto grid max-w-5xl gap-2 px-3 py-2.5 sm:px-4 lg:px-8">
          <div className="hidden items-center justify-between lg:flex">
            <div>
              <h1 className="text-[22px] font-black uppercase text-white">Admin Dashboard</h1>
              <p className="text-xs text-white/45">Atlas Admin Command Center · {adminEmail}</p>
            </div>
            <button
              onClick={loadOverview}
              disabled={loading}
              className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-200"
            >
              {loading ? "Loading" : "Refresh"}
            </button>
          </div>

          {cronResult ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-3 text-sm font-bold text-cyan-100">{cronResult}</div> : null}
          {activeSection === "control" ? controlPanel : null}
          {activeSection === "operations" ? operationsPanel : null}
          {activeSection === "research" ? researchPanel : null}
          {activeSection === "performance" ? performancePanel : null}
          {activeSection === "more" ? morePanel : null}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#020915]/98 px-2 pb-5 pt-3 backdrop-blur lg:hidden">
        {adminNav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(item.id)}
            className={`grid place-items-center gap-1 text-[11px] font-black uppercase ${activeSection === item.id ? "text-sky-400" : "text-white/55"}`}
          >
            <span className="text-[27px] leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#050816] px-3 py-4 text-white sm:px-4">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-950/20 to-black/20 p-4 shadow-[0_0_32px_rgba(0,220,255,0.07)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Atlas Signals
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Research Dashboard</h1>
            <p className="mt-1 text-xs text-white/55">{adminEmail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadOverview}
              disabled={loading}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-50"
            >
              {loading ? "Loading" : "Refresh"}
            </button>
            <Link
              href="/"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white/80"
            >
              App
            </Link>
          </div>
        </header>

        {cronResult ? (
          <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-3 text-sm font-bold text-cyan-100">
            {cronResult}
          </div>
        ) : null}

        <section className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Public Signals Today" value={totals.publicSignals} />
          <StatCard label="Top 5 Live Today" value={totals.top5Live} tone="gold" />
          <StatCard label="Top 5 History Today" value={totals.top5History} tone="green" />
          <StatCard label="Top Signal History Today" value={totals.topSignalHistory} tone="green" />
        </section>

        <section className="mb-4 rounded-2xl border border-cyan-400/15 bg-white/[0.03] p-3.5 shadow-[0_0_32px_rgba(0,220,255,0.06)] sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
                Atlas Research Dashboard
              </p>
              <h2 className="mt-0.5 text-xl font-black">
                {researchView === "summary" ? "Resumen" : "Sistema"}
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-white/50">
                Internal research-only view powered by existing Atlas engine snapshots.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <p className="text-xs text-white/40">
                Updated: {formatTime(overview?.researchDashboard?.updatedAt)}
              </p>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <button
                  type="button"
                  onClick={() => {
                    setResearchView("summary");
                    setSelectedSystemGameId(null);
                  }}
                  className={`px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] ${
                    researchView === "summary" ? "bg-cyan-400/10 text-cyan-300" : "text-white/55"
                  }`}
                >
                  Resumen
                </button>
                <button
                  type="button"
                  onClick={() => setResearchView("system")}
                  className={`px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] ${
                    researchView === "system" ? "bg-cyan-400/10 text-cyan-300" : "text-white/55"
                  }`}
                >
                  Sistema
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {researchView === "summary"
              ? researchGames.map((game) => (
                  <SummaryGameCard key={game.id} game={game} onSystem={openSystemDetails} />
                ))
              : systemGames.map((game) => (
                  <ResearchGameCard key={game.id} game={game} />
                ))}
            {!researchGames.length ? (
              <p className="rounded-2xl bg-black/20 p-4 text-sm text-white/45">
                No research snapshots available yet.
              </p>
            ) : null}
            {researchView === "system" && selectedSystemGameId ? (
              <button
                type="button"
                onClick={() => {
                  setResearchView("summary");
                  setSelectedSystemGameId(null);
                }}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white/70"
              >
                Back to Resumen
              </button>
            ) : null}
          </div>
        </section>

        <section className="mb-4 grid gap-3 lg:grid-cols-2">
          {(overview?.sports ?? []).map((sport) => (
            <article
              key={sport.sport}
              className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#071627] to-[#070914] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-black">{sport.sport}</h2>
                <span className="rounded-full border border-cyan-400/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                  Today
                </span>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <StatCard label="Public" value={sport.today.publicSignals} />
                <StatCard label="Top 5 Live" value={sport.today.top5Live} tone="gold" />
                <StatCard label="Top 5 History" value={sport.today.top5History} tone="green" />
                <StatCard label="Top Signal" value={sport.today.topSignalHistory} tone="green" />
              </div>
              <div className="grid gap-2">
                <ResultLine title="Top 5 last 7 days" counts={sport.last7Days.top5} />
                <ResultLine title="Top Signal last 7 days" counts={sport.last7Days.topSignal} />
              </div>
            </article>
          ))}
        </section>

        <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
              Cron Center
            </p>
            <h2 className="text-xl font-black">Run Safe Automations</h2>
            <p className="mt-1 text-xs text-white/50">
              These buttons execute existing allowlisted cron routes. No delete, drop, or truncate
              actions are available here.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(overview?.crons ?? []).map((cron) => (
              <button
                key={cron.path}
                onClick={() => runCron(cron.path)}
                disabled={Boolean(cronRunning)}
                className="rounded-xl border border-cyan-400/15 bg-cyan-950/10 p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-950/25 disabled:opacity-50"
              >
                <span className="block text-xs font-black text-white">{cron.path}</span>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                  {cronRunning === cron.path ? "Running" : cron.schedule}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-xl font-black">Subscriptions</h2>
            <div className="grid gap-2">
              {(overview?.subscriptions ?? []).map((item) => (
                <div key={item.id} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">{planLabel(item.plan_code)}</p>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                      {planLabel(item.status)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-white/55">Sport: {item.sport ?? "N/A"}</p>
                  <p className="mt-1 text-xs text-white/35">
                    Ends: {formatDate(item.current_period_end)}
                  </p>
                </div>
              ))}
              {!overview?.subscriptions?.length ? (
                <p className="text-sm text-white/45">No recent subscriptions found.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-xl font-black">Daily Purchases</h2>
            <div className="grid gap-2">
              {(overview?.purchases ?? []).map((item) => (
                <div key={item.id} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">{planLabel(item.product_code)}</p>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                      {item.sport ?? "ALL"}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-white/55">Status: {planLabel(item.status)}</p>
                  <p className="mt-1 text-xs text-white/35">Date: {formatDate(item.access_date)}</p>
                </div>
              ))}
              {!overview?.purchases?.length ? (
                <p className="text-sm text-white/45">No recent product purchases found.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-xl font-black">Challenge Attempts</h2>
            <div className="grid gap-2">
              {(overview?.challenges?.attempts ?? []).map((item) => (
                <div key={item.id} className="rounded-xl bg-black/20 p-3">
                  <p className="font-black text-white">{planLabel(item.challenge_code)}</p>
                  <p className="mt-1 text-sm text-white/55">
                    {planLabel(item.status)} {item.result ? `- ${planLabel(item.result)}` : ""}
                  </p>
                </div>
              ))}
              {!overview?.challenges?.attempts?.length ? (
                <p className="text-sm text-white/45">No recent challenge attempts found.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-xl font-black">Challenge Rewards</h2>
            <div className="grid gap-2">
              {(overview?.challenges?.rewards ?? []).map((item) => (
                <div key={item.id} className="rounded-xl bg-black/20 p-3">
                  <p className="font-black text-white">{planLabel(item.reward_plan)}</p>
                  <p className="mt-1 text-sm text-white/55">Status: {planLabel(item.status)}</p>
                  <p className="mt-1 text-xs text-white/35">
                    {formatDate(item.starts_at)} to {formatDate(item.ends_at)}
                  </p>
                </div>
              ))}
              {!overview?.challenges?.rewards?.length ? (
                <p className="text-sm text-white/45">No recent rewards found.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
                Environment
              </p>
              <h2 className="text-xl font-black">Production Readiness</h2>
            </div>
            <p className="text-xs text-white/45">ET date: {overview?.today ?? "..."}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(overview?.environment ?? {}).map(([key, ready]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <span className="text-xs font-bold text-white/70">{envLabels[key] ?? key}</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-[0.14em] ${
                    ready ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {ready ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {overview?.errors?.length ? (
          <section className="rounded-2xl border border-rose-400/20 bg-rose-950/10 p-4">
            <h2 className="mb-3 text-xl font-black text-rose-200">Warnings</h2>
            <div className="grid gap-2">
              {(overview?.errors ?? []).map((error, index) => (
                <p key={`${error}-${index}`} className="rounded-xl bg-black/20 p-2.5 text-sm text-rose-100">
                  {error}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
