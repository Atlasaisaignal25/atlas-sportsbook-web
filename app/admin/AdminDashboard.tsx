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
  errors: string[];
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
  if (status === "Negative") return "bg-red-400 text-red-300";
  if (status === "Partial") return "bg-sky-400 text-sky-300";
  if (status === "Unavailable") return "bg-red-400 text-red-300";
  return "bg-slate-400 text-white/55";
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function ResultLine({ title, counts }: { title: string; counts: StatusCounts }) {
  const decided = counts.won + counts.lost;
  const rate = decided ? Math.round((counts.won / decided) * 100) : 0;

  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/65">{title}</p>
        <p className="text-sm font-black text-cyan-300">{rate}%</p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.12em]">
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{String(value ?? "N/A")}</p>
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
  return (
    <details className="rounded-3xl border border-cyan-400/15 bg-[#071120] shadow-[0_0_30px_rgba(0,220,255,0.06)]">
      <summary className="cursor-pointer list-none p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <p className="text-sm text-white/70">{game.header.awayTeam}</p>
              <h3 className="text-2xl font-black text-white">{awayName}</h3>
            </div>
            <div className="text-left sm:text-center">
              <p className="text-lg font-black text-white/70">@</p>
              <p className="text-sm text-white/45">{formatTime(game.header.time)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-white/70">{game.header.homeTeam}</p>
              <h3 className="text-2xl font-black text-white">{homeName}</h3>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-[380px]">
            <MiniMetric label="Decision" value={decisionLabel(game.decision?.decision)} />
            <MiniMetric label="Confidence" value={scorePct(game.decision?.confidence)} />
            <MiniMetric label="Conviction" value={fmt(game.decision?.conviction)} />
          </div>
        </div>
      </summary>

      <div className="grid gap-4 border-t border-white/10 p-4 sm:p-5">
        <section className="rounded-2xl border border-cyan-400/15 bg-black/20 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">Main Decision</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MiniMetric label="Pick" value={decisionLabel(game.decision?.decision)} />
            <MiniMetric label="Decision" value={game.decision?.decision} />
            <MiniMetric label="Confidence" value={scorePct(game.decision?.confidence)} />
            <MiniMetric label="Conviction" value={`${fmt(game.decision?.convictionScore)} ${game.decision?.conviction ?? ""}`} />
            <MiniMetric label="Consensus" value={`${fmt(game.decision?.consensusScore)} ${decisionLabel(game.decision?.consensus)}`} />
            <MiniMetric label="No Pick" value={game.decision?.noPick ? "Yes" : "No"} />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white">
            {game.decision?.noPick ? "Why Atlas passed" : "Why Atlas reached this decision"}
          </h4>
          <div className="mt-3 grid gap-2">
            {brain.reasons.map((reason: string, index: number) => (
              <p key={`${reason}-${index}`} className="text-sm font-bold text-white/75">
                <span className={reason.toLowerCase().includes("neutral") ? "text-white/45" : "text-emerald-300"}>
                  {reason.toLowerCase().includes("neutral") ? "−" : "✓"}
                </span>{" "}
                {reason}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white">Quick Projection</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="Projected Score" value={`${awayName} ${fmt(game.projection?.awayRuns)} · ${homeName} ${fmt(game.projection?.homeRuns)}`} />
            <MiniMetric label="Projected Total" value={fmt(game.projection?.totalRuns)} />
            <MiniMetric label="Win Probability" value={`${homeName} ${pct(game.projection?.homeWinProbability)} · ${awayName} ${pct(game.projection?.awayWinProbability)}`} />
            <MiniMetric label="Fair Moneyline" value={`${homeName} ${money(game.projection?.fairMoneylineHome)} · ${awayName} ${money(game.projection?.fairMoneylineAway)}`} />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white">Motor Signals</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-9">
            {motors.map((motor) => {
              const color = statusColor(motor.status);
              return (
                <div key={motor.name} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${color.split(" ")[0]}`} />
                  <span>
                    <span className="block font-bold text-white">{motor.name}</span>
                    <span className={`text-xs font-bold ${color.split(" ")[1]}`}>{motor.status}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white">Readiness</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Home Game Readiness" value={fmt(game.gameReadiness.home)} />
            <MiniMetric label="Away Game Readiness" value={fmt(game.gameReadiness.away)} />
            <MiniMetric label="Context Certainty" value={fmt(game.contextCertainty.score)} />
          </div>
        </section>

        <button
          type="button"
          onClick={() => onSystem(game.id)}
          className="rounded-2xl border border-cyan-400/20 bg-cyan-950/20 px-4 py-4 text-left text-sm font-black uppercase tracking-[0.16em] text-cyan-300"
        >
          View System Details →
        </button>
      </div>
    </details>
  );
}

function ResearchGameCard({ game }: { game: ResearchGame }) {
  const brain = atlasBrain(game);
  return (
    <details className="rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-[#071627] to-[#070914] p-4 shadow-[0_0_30px_rgba(0,220,255,0.06)]">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">{game.header.league} · {formatTime(game.header.time)}</p>
            <h3 className="mt-1 text-xl font-black">{game.header.awayTeam} @ {game.header.homeTeam}</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-white/45">{game.header.status}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:min-w-64">
            <MiniMetric label="Decision" value={game.decision?.decision} />
            <MiniMetric label="Conviction" value={game.decision?.conviction} />
          </div>
        </div>
      </summary>

      <div className="mt-4 grid gap-4">
        <ResearchSection title="Atlas Decision Engine">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <MiniMetric label="Decision" value={game.decision?.decision} />
            <MiniMetric label="Consensus" value={`${game.decision?.consensus ?? "N/A"} (${fmt(game.decision?.consensusScore)})`} />
            <MiniMetric label="Conviction" value={`${game.decision?.conviction ?? "N/A"} (${fmt(game.decision?.convictionScore)})`} />
            <MiniMetric label="Confidence" value={`${fmt(game.decision?.confidence)} ${game.decision?.confidenceTier ?? ""}`} />
            <MiniMetric label="No Pick" value={game.decision?.noPick ? "Yes" : "No"} />
            <MiniMetric label="Reason" value={game.decision?.noPickReasons?.join(" ") || "N/A"} />
          </div>
        </ResearchSection>

        <ResearchSection title="Sports Projection">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="Home Runs" value={fmt(game.projection?.homeRuns)} />
            <MiniMetric label="Away Runs" value={fmt(game.projection?.awayRuns)} />
            <MiniMetric label="Projected Total" value={fmt(game.projection?.totalRuns)} />
            <MiniMetric label="Home Win Probability" value={pct(game.projection?.homeWinProbability)} />
            <MiniMetric label="Away Win Probability" value={pct(game.projection?.awayWinProbability)} />
            <MiniMetric label="Fair ML Home" value={fmt(game.projection?.fairMoneylineHome)} />
            <MiniMetric label="Fair ML Away" value={fmt(game.projection?.fairMoneylineAway)} />
          </div>
        </ResearchSection>

        {game.market ? (
          <ResearchSection title="Market">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MiniMetric label="Market Moneyline" value="N/A" />
              <MiniMetric label="Atlas Fair Moneyline" value={fmt(game.projection?.fairMoneylineHome)} />
              <MiniMetric label="Edge" value="N/A" />
              <MiniMetric label="No Vig Probability" value="N/A" />
            </div>
          </ResearchSection>
        ) : null}

        <ResearchSection title="Team Quality">
          <SideBySide home={game.teamQuality.home} away={game.teamQuality.away} fields={[
            ["Team Quality", "score", fmt],
            ["Team Confidence", "confidence", fmt],
          ]} />
        </ResearchSection>

        <ResearchSection title="Starting Pitchers">
          <SideBySide home={game.pitchers.home} away={game.pitchers.away} fields={[
            ["Pitcher", "name", fmt],
            ["Pitcher Quality", "quality", fmt],
            ["Pitcher Readiness", "readiness", fmt],
          ]} />
        </ResearchSection>

        <ResearchSection title="Offense">
          <SideBySide home={game.offense.home} away={game.offense.away} fields={[["Offensive Score", "score", fmt]]} />
        </ResearchSection>

        <ResearchSection title="Bullpen">
          <SideBySide home={game.bullpen.home} away={game.bullpen.away} fields={[
            ["Bullpen Quality", "quality", fmt],
            ["Bullpen Fatigue", "fatigue", fmt],
          ]} />
        </ResearchSection>

        <ResearchSection title="Lineups">
          <SideBySide home={game.lineups.home} away={game.lineups.away} fields={[
            ["Confirmed", "confirmed", (value) => value === null || value === undefined ? "N/A" : value ? "Yes" : "No"],
            ["Stability", "stability", fmt],
          ]} />
        </ResearchSection>

        <div className="grid gap-4 lg:grid-cols-2">
          <ResearchSection title="Weather">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniMetric label="Temperature" value={game.weather?.temperature ? `${game.weather.temperature} F` : "N/A"} />
              <MiniMetric label="Wind" value={game.weather?.wind ?? "N/A"} />
              <MiniMetric label="Delay Risk" value={fmt(game.weather?.delayRisk)} />
              <MiniMetric label="Weather Run Environment" value={fmt(game.weather?.runEnvironment)} />
            </div>
          </ResearchSection>
          <ResearchSection title="Park">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniMetric label="Venue" value={game.park?.venue ?? "N/A"} />
              <MiniMetric label="Park Environment" value={fmt(game.park?.environment)} />
            </div>
          </ResearchSection>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ResearchSection title="Game Readiness">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniMetric label="Away" value={fmt(game.gameReadiness.away)} />
              <MiniMetric label="Home" value={fmt(game.gameReadiness.home)} />
            </div>
          </ResearchSection>
          <ResearchSection title="Context Certainty">
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Score" value={fmt(game.contextCertainty.score)} />
              <MiniMetric label="Confidence" value={fmt(game.contextCertainty.confidence)} />
              <MiniMetric label="Availability" value={fmt(game.contextCertainty.availability)} />
            </div>
          </ResearchSection>
        </div>

        <ResearchSection title="Atlas Brain">
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-lg font-black text-white">{brain.title}</p>
            <div className="mt-3 grid gap-2">
              {brain.reasons.map((reason: string, index: number) => (
                <p key={`${reason}-${index}`} className="text-sm font-bold text-white/70">✓ {reason}</p>
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Consensus" value={fmt(game.decision?.consensusScore)} />
              <MiniMetric label="Conviction" value={fmt(game.decision?.convictionScore)} />
              <MiniMetric label="Confidence" value={fmt(game.decision?.confidence)} />
            </div>
          </div>
        </ResearchSection>

        <ResearchSection title="Engine Status">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {game.engineStatus.map((engine) => (
              <div key={engine.name} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{engine.name}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">{engine.status}</p>
                </div>
                <p className="mt-2 text-[11px] text-white/40">{formatTime(engine.updatedAt)}</p>
              </div>
            ))}
          </div>
        </ResearchSection>
      </div>
    </details>
  );
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState<string | null>(null);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [researchView, setResearchView] = useState<"summary" | "system">("summary");
  const [selectedSystemGameId, setSelectedSystemGameId] = useState<string | null>(null);

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
    loadOverview();
  }, []);

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-950/25 to-black/20 p-5 shadow-[0_0_40px_rgba(0,220,255,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
              Atlas Signals
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Admin Dashboard</h1>
            <p className="mt-2 text-sm text-white/55">{adminEmail}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadOverview}
              disabled={loading}
              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-black disabled:opacity-50"
            >
              {loading ? "Loading" : "Refresh"}
            </button>
            <Link
              href="/"
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white/80"
            >
              App
            </Link>
          </div>
        </header>

        {cronResult ? (
          <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-950/20 p-4 text-sm font-bold text-cyan-100">
            {cronResult}
          </div>
        ) : null}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Public Signals Today" value={totals.publicSignals} />
          <StatCard label="Top 5 Live Today" value={totals.top5Live} tone="gold" />
          <StatCard label="Top 5 History Today" value={totals.top5History} tone="green" />
          <StatCard label="Top Signal History Today" value={totals.topSignalHistory} tone="green" />
        </section>

        <section className="mb-6 rounded-3xl border border-cyan-400/15 bg-white/[0.03] p-4 shadow-[0_0_40px_rgba(0,220,255,0.07)] sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
                Atlas Research Dashboard
              </p>
              <h2 className="mt-1 text-2xl font-black">
                {researchView === "summary" ? "Resumen" : "Sistema"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-white/50">
                Internal research-only view powered by existing Atlas engine snapshots.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
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
                  className={`px-5 py-3 text-xs font-black uppercase tracking-[0.18em] ${
                    researchView === "summary" ? "bg-cyan-400/10 text-cyan-300" : "text-white/55"
                  }`}
                >
                  Resumen
                </button>
                <button
                  type="button"
                  onClick={() => setResearchView("system")}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-[0.18em] ${
                    researchView === "system" ? "bg-cyan-400/10 text-cyan-300" : "text-white/55"
                  }`}
                >
                  Sistema
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
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

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
                Environment
              </p>
              <h2 className="text-2xl font-black">Production Readiness</h2>
            </div>
            <p className="text-xs text-white/45">ET date: {overview?.today ?? "..."}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(overview?.environment ?? {}).map(([key, ready]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <span className="text-sm font-bold text-white/70">{envLabels[key] ?? key}</span>
                <span
                  className={`text-xs font-black uppercase tracking-[0.16em] ${
                    ready ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {ready ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          {(overview?.sports ?? []).map((sport) => (
            <article
              key={sport.sport}
              className="rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-[#071627] to-[#070914] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-black">{sport.sport}</h2>
                <span className="rounded-full border border-cyan-400/25 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                  Today
                </span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <StatCard label="Public" value={sport.today.publicSignals} />
                <StatCard label="Top 5 Live" value={sport.today.top5Live} tone="gold" />
                <StatCard label="Top 5 History" value={sport.today.top5History} tone="green" />
                <StatCard label="Top Signal" value={sport.today.topSignalHistory} tone="green" />
              </div>
              <div className="grid gap-3">
                <ResultLine title="Top 5 last 7 days" counts={sport.last7Days.top5} />
                <ResultLine title="Top Signal last 7 days" counts={sport.last7Days.topSignal} />
              </div>
            </article>
          ))}
        </section>

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
              Cron Center
            </p>
            <h2 className="text-2xl font-black">Run Safe Automations</h2>
            <p className="mt-2 text-sm text-white/50">
              These buttons execute existing allowlisted cron routes. No delete, drop, or truncate
              actions are available here.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(overview?.crons ?? []).map((cron) => (
              <button
                key={cron.path}
                onClick={() => runCron(cron.path)}
                disabled={Boolean(cronRunning)}
                className="rounded-2xl border border-cyan-400/15 bg-cyan-950/10 p-4 text-left transition hover:border-cyan-300/45 hover:bg-cyan-950/25 disabled:opacity-50"
              >
                <span className="block text-sm font-black text-white">{cron.path}</span>
                <span className="mt-2 block text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {cronRunning === cron.path ? "Running" : cron.schedule}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-2xl font-black">Subscriptions</h2>
            <div className="grid gap-3">
              {(overview?.subscriptions ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl bg-black/20 p-4">
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

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-2xl font-black">Daily Purchases</h2>
            <div className="grid gap-3">
              {(overview?.purchases ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl bg-black/20 p-4">
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

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-2xl font-black">Challenge Attempts</h2>
            <div className="grid gap-3">
              {(overview?.challenges?.attempts ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl bg-black/20 p-4">
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

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-2xl font-black">Challenge Rewards</h2>
            <div className="grid gap-3">
              {(overview?.challenges?.rewards ?? []).map((item) => (
                <div key={item.id} className="rounded-2xl bg-black/20 p-4">
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

        {overview?.errors?.length ? (
          <section className="rounded-3xl border border-rose-400/20 bg-rose-950/10 p-5">
            <h2 className="mb-3 text-2xl font-black text-rose-200">Warnings</h2>
            <div className="grid gap-2">
              {overview.errors.map((error, index) => (
                <p key={`${error}-${index}`} className="rounded-xl bg-black/20 p-3 text-sm text-rose-100">
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
