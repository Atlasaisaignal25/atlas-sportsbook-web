"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  confirmed: number;
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
};

type ResearchGame = {
  id: string;
  header: { awayTeam: string; homeTeam: string; time: string; status: string; league: string };
  decision: any;
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
                {noPick ? "No Pick" : "Top Play"}
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
            <MiniMetric label="Decision" value={decisionLabel(game.decision?.decision)} />
            <MiniMetric label="Confidence" value={scorePct(game.decision?.confidence)} />
            <MiniMetric label="Snapshot" value={formatTime(game.decision?.updatedAt)} />
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
                ["Decision", game.decision?.decision, "cyan"],
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

          <SystemSection index={3} title="Sports Projection" version={game.projection?.modelVersion}>
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
            <SystemSection index={4} title="Market">
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

          <SystemSection index={5} title="Team Quality">
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

          <SystemSection index={6} title="Starting Pitchers">
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

          <SystemSection index={7} title="Offense">
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

          <SystemSection index={8} title="Bullpen">
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

          <SystemSection index={9} title="Lineups">
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

          <SystemSection index={10} title="Weather and Park">
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

          <SystemSection index={11} title="Game Readiness">
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

          <SystemSection index={12} title="Context Certainty">
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
          <SystemSection index={13} title="Engine Contribution">
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

          <SystemSection index={14} title="Engine Status">
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
            <SystemSection index={15} title="Warnings">
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
            <SystemSection index={16} title="Timeline">
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

type AdminSection = "operations" | "research" | "performance" | "more";

function AtlasAdminLogo() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <img src="/icon.png" alt="" className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.30)]" />
      <div className="leading-none">
        <p className="text-[23px] font-black uppercase tracking-[0.24em] text-white">Atlas</p>
        <p className="-mt-0.5 text-center text-[9px] font-black uppercase tracking-[0.26em] text-white/72">Admin</p>
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
    <AdminShellCard className="min-h-[58px] px-2.5 py-2 text-center">
      <p className="text-[10px] font-black uppercase leading-tight text-white/88">{label}</p>
      <p className={`mt-1 text-[25px] font-black leading-none ${color}`}>{value}</p>
      {sub ? <p className={`mt-1 text-[9px] font-black uppercase ${color}`}>{sub}</p> : null}
    </AdminShellCard>
  );
}

function AdminStatusPill({ status }: { status?: string | null }) {
  const value = String(status ?? "PENDING").toUpperCase();
  const classes =
    value === "CONFIRMED"
      ? "border-emerald-400/20 bg-emerald-400/14 text-emerald-300"
      : value === "DOWNGRADED" || value === "REMOVED"
        ? "border-orange-400/20 bg-orange-400/14 text-orange-300"
        : "border-yellow-400/20 bg-yellow-400/12 text-yellow-300";
  return <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${classes}`}>{value}</span>;
}

function AdminTopSignalCard({ operations }: { operations?: AdminOperations }) {
  const top = operations?.topSignal;
  return (
    <AdminShellCard className="border-cyan-300/35 p-3 shadow-[0_0_0_1px_rgba(56,189,248,0.10)]">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[17px] font-black uppercase tracking-[-0.01em] text-white">Top Signal</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">View Details ›</button>
      </div>
      {top ? (
        <>
          <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-white/10 py-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-300/18 bg-cyan-300/[0.055] text-[20px] font-black text-sky-300">
              {shortTeam(top.home_team).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[22px] font-black leading-tight text-white">{top.pick?.replace(/\s\([^)]+\)/, "") ?? shortTeam(top.home_team)}</p>
              <p className="mt-0.5 text-[13px] font-black uppercase text-sky-400">{adminMarketLabel(top.market)} {top.line ? `${Number(top.line) > 0 ? "+" : ""}${top.line}` : formatAdminOdds(top.odds)}</p>
            </div>
            <AdminStatusPill status={top.status} />
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2.5">
            <MiniAdminStat label="Confidence" value={numberPct(top.confidence)} />
            <MiniAdminStat label="Edge" value={formatAdminEdge(top.edge)} />
            <MiniAdminStat label="Published" value={formatAdminTime(top.published_at)} />
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

function AdminTop5Card({ operations }: { operations?: AdminOperations }) {
  const rows = operations?.topPicks ?? [];
  return (
    <AdminShellCard className="p-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[17px] font-black uppercase tracking-[-0.01em] text-white">Top 5 Picks</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">View All ›</button>
      </div>
      <div>
        {rows.slice(0, 5).map((pick, index) => (
          <div key={pick.id ?? `${pick.game_id}-${index}`} className="grid grid-cols-[22px_1fr_58px_70px_58px_12px] items-center gap-1.5 border-b border-white/8 py-1.5 last:border-b-0">
            <span className="text-[13px] font-black text-white">{pick.rank ?? index + 1}</span>
            <span className="truncate text-[14px] font-semibold text-white">{pick.pick?.replace(/\sML$|\s\([^)]+\)$/g, "") ?? shortTeam(pick.home_team)}</span>
            <span className="text-[12px] font-black text-white">{pick.line ? `${Number(pick.line) > 0 ? "+" : ""}${pick.line}` : adminMarketLabel(pick.market)}</span>
            <AdminStatusPill status={pick.status} />
            <span className="text-right text-[13px] font-black text-emerald-300">{formatAdminEdge(pick.edge)}</span>
            <span className="text-lg text-white/50">›</span>
          </div>
        ))}
        {!rows.length ? <p className="py-6 text-center text-sm text-white/45">No validated picks yet.</p> : null}
      </div>
    </AdminShellCard>
  );
}

function PipelineStatus({ operations }: { operations?: AdminOperations }) {
  const steps = operations?.pipeline ?? [];
  const icons = ["⌕", "◎", "▥", "★", "♛", "🏆"];
  return (
    <AdminShellCard className="p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-black uppercase text-white">Pipeline Status</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">View Pipeline ›</button>
      </div>
      <div className="mt-3 grid grid-cols-6 items-start gap-0">
        {steps.map((step, index) => {
          const complete = step.status === "complete";
          return (
            <div key={step.label} className="relative text-center">
              {index < steps.length - 1 ? <span className={`absolute left-1/2 right-[-50%] top-5 h-0.5 ${complete ? "bg-emerald-400" : "bg-white/14"}`} /> : null}
              <span className={`relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-full border text-[17px] ${complete ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-400"}`}>{icons[index]}</span>
              <p className="mt-1.5 text-[9px] font-black uppercase leading-3 text-white">{step.label}</p>
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
  };
  return (
    <AdminShellCard className="p-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-[16px] font-black uppercase text-white">Recent Activity</h2>
        <button className="text-[12px] font-black uppercase text-sky-400">View All ›</button>
      </div>
      <div className="pt-1.5">
        {rows.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid grid-cols-[66px_16px_1fr_12px] items-center border-b border-white/8 py-1.5 last:border-b-0">
            <span className="text-[12px] font-medium text-white/60">{formatAdminTime(item.time)}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${tone[item.tone] ?? "bg-sky-400"} shadow-[0_0_0_3px_rgba(255,255,255,0.05)]`} />
            <span>
              <p className="text-[14px] font-semibold leading-tight text-white">{item.title}</p>
              <p className="text-[12px] leading-tight text-white/45">{item.detail}</p>
            </span>
            <span className="text-lg text-white/50">›</span>
          </div>
        ))}
        {!rows.length ? <p className="py-5 text-center text-sm text-white/45">No activity yet.</p> : null}
      </div>
    </AdminShellCard>
  );
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState<string | null>(null);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [researchView, setResearchView] = useState<"summary" | "system">("summary");
  const [selectedSystemGameId, setSelectedSystemGameId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("operations");

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

  useEffect(() => {
    const savedView = window.sessionStorage.getItem("atlas-admin-research-view");
    if (savedView === "summary" || savedView === "system") setResearchView(savedView);
    loadOverview();
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("atlas-admin-research-view", researchView);
  }, [researchView]);

  const operations = overview?.operations;
  const adminNav: Array<{ id: AdminSection; label: string; icon: string }> = [
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

  const performance = operations?.performance;
  const performancePanel = (
    <section className="grid gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Performance</p>
        <h1 className="text-[26px] font-black text-white">Atlas Performance</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <OperationMetricCard label="ROI" value={performance?.roi === null || performance?.roi === undefined ? "N/A" : `${Number(performance.roi).toFixed(2)}%`} sub="Research" tone="green" />
        <OperationMetricCard label="CLV" value={performance?.averageClv === null || performance?.averageClv === undefined ? "N/A" : `${Number(performance.averageClv).toFixed(2)}%`} sub="Average" />
        <OperationMetricCard label="Win Rate" value={performance?.winRate === null || performance?.winRate === undefined ? "N/A" : pct(performance.winRate)} sub="Graded" tone="white" />
        <OperationMetricCard label="Sample Size" value={performance?.sampleSize ?? 0} sub={performance?.lowSampleSize ? "Low Sample" : "Ready"} tone="purple" />
      </div>
      <AdminShellCard className="p-4">
        <h2 className="text-[16px] font-black uppercase text-white">Research Summary</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <MiniMetric label="Best Market" value={performance?.bestMarket ?? "N/A"} />
          <MiniMetric label="Best Edge" value={performance?.bestEdgeClassification ?? "N/A"} />
          <MiniMetric label="Best Conviction" value={performance?.bestConviction ?? "N/A"} />
          <MiniMetric label="Best Confidence" value={performance?.bestConfidenceBucket ?? "N/A"} />
          <MiniMetric label="Wins / Losses" value={`${performance?.wins ?? 0} / ${performance?.losses ?? 0}`} />
          <MiniMetric label="Learning Status" value={operations?.learning?.length ? "Active" : "Waiting"} />
        </div>
      </AdminShellCard>
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
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[24px] font-black uppercase tracking-[-0.03em] text-white">Operations</h1>
          <span className="flex items-center gap-1 text-[11px] font-black uppercase text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live
          </span>
        </div>
        <div className="rounded-lg border border-slate-600/70 bg-[#071322] px-2.5 py-1.5 text-[11px] font-black uppercase text-white">
          ▣ {formatAdminDate(operations?.date ?? overview?.today)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <OperationMetricCard label="Signals Detected" value={operations?.signalsDetected ?? 0} />
        <OperationMetricCard label="Validated Picks" value={operations?.validatedPicks ?? 0} tone="green" />
        <OperationMetricCard label="Top Signal" value={operations?.topSignalPublished ? 1 : 0} tone="purple" />
        <OperationMetricCard label="Games Remaining" value={operations?.gamesRemaining ?? 0} tone="white" />
      </div>
      <AdminTopSignalCard operations={operations} />
      <AdminTop5Card operations={operations} />
      <PipelineStatus operations={operations} />
      <RecentActivity operations={operations} />
    </section>
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
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#020915]/95 px-4 py-2.5 backdrop-blur lg:static lg:px-8 lg:py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button className="grid h-8 w-8 place-items-center text-2xl text-white/85 lg:hidden">≡</button>
            <AtlasAdminLogo />
            <button className="relative grid h-8 w-8 place-items-center text-xl text-white/85">
              ♧
              <span className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded-full bg-sky-500 text-[9px] font-black text-white">3</span>
            </button>
          </div>
        </header>

        <div className="mx-auto grid max-w-5xl gap-2.5 px-4 py-3 lg:px-8">
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
          {activeSection === "operations" ? operationsPanel : null}
          {activeSection === "research" ? researchPanel : null}
          {activeSection === "performance" ? performancePanel : null}
          {activeSection === "more" ? morePanel : null}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#020915]/98 px-2 pb-5 pt-3 backdrop-blur lg:hidden">
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
