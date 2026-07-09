"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalDetectedRow } from "./SignalDetectedFeed";
import type { SportCode } from "./SportSignalCard";
import { teamBranding } from "../../lib/teamBranding";

const logoFolderToSport: Record<string, SportCode> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  soccer: "SOCCER",
};

type SignalStatus = "pending" | "confirmed" | "removed" | "downgraded";

const liveTeamLogoFileOverrides: Record<string, string> = {
  oaklandathletics: "athletics",
  stlouiscardinals: "stlouiscardinals",
};

function getLogoKey(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const liveTeamLogoLookup = Object.entries(teamBranding).reduce(
  (lookup, [teamName, team]) => {
    const folder = team.logo.match(/\/team-logos\/([^/]+)\//)?.[1];
    const sport = folder ? logoFolderToSport[folder] : null;

    if (!folder || !sport) return lookup;

    const teamKey = getLogoKey(teamName);
    const fileKey = liveTeamLogoFileOverrides[teamKey] ?? teamKey;
    const logo = `/team-logos/${folder}/${fileKey}.png`;

    [teamName, team.shortName, team.abbr].forEach((alias) => {
      lookup[sport][getLogoKey(alias)] = logo;
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

function SignalDetailTeamLogo({
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
    <span className={`grid place-items-center ${className}`} aria-hidden="true">
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

function SignalDetailTeamLogoStack({ row }: { row: SignalDetectedRow }) {
  const { awayTeam, homeTeam } = getSignalMatchupTeams(row);

  return (
    <span className="relative block h-[60px] w-[60px] shrink-0" aria-label={`${row.matchup} team logos`}>
      <SignalDetailTeamLogo team={awayTeam} sport={row.sport} className="absolute left-1 top-1 z-10 h-[36px] w-[36px]" />
      <SignalDetailTeamLogo
        team={homeTeam || awayTeam}
        sport={row.sport}
        className="absolute bottom-1 right-1 z-20 h-[36px] w-[36px]"
      />
    </span>
  );
}

function normalizeStatus(status?: string): SignalStatus {
  const normalized = (status || "").trim().toLowerCase();

  if (normalized.includes("confirm") || normalized === "won") return "confirmed";
  if (normalized.includes("remove")) return "removed";
  if (normalized.includes("downgrade")) return "downgraded";

  return "pending";
}

function formatStatus(status: SignalStatus) {
  if (status === "confirmed") return "Confirmed";
  if (status === "removed") return "Removed";
  if (status === "downgraded") return "Downgraded";
  return "Pending";
}

function getStatusMessage(status: SignalStatus) {
  if (status === "confirmed") return "This signal remained strong after market validation.";
  if (status === "removed") return "Atlas removed this signal because market conditions changed.";
  if (status === "downgraded") return "This signal lost strength during market validation.";
  return "Atlas is still validating this opportunity.";
}

function getStatusClass(status: SignalStatus) {
  if (status === "confirmed") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "removed") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  }
  if (status === "downgraded") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-2.5 last:border-b-0">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
        {label}
      </span>
      <span className="max-w-[62%] text-right text-sm font-bold text-white/86">
        {value}
      </span>
    </div>
  );
}

export function SignalDetectedDetailSheet({
  open,
  row,
  onClose,
  onLearnTopSignals,
}: {
  open: boolean;
  row: SignalDetectedRow | null;
  onClose: () => void;
  onLearnTopSignals: () => void;
}) {
  const [rendered, setRendered] = useState(open);
  const dragStartY = useRef<number | null>(null);
  const status = normalizeStatus(row?.status);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-3 backdrop-blur-sm transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      onTransitionEnd={() => {
        if (!open) setRendered(false);
      }}
    >
      <div
        className={`max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[30px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_32%),#07101f] shadow-[0_-22px_70px_rgba(34,211,238,0.18)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signal-detected-detail-title"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          dragStartY.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (dragStartY.current !== null && event.clientY - dragStartY.current > 80) {
            onClose();
          }
          dragStartY.current = null;
        }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/18" />

        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Free Market Opportunity
            </p>
            <h2
              id="signal-detected-detail-title"
              className="mt-2 text-[26px] font-black leading-none tracking-[-0.03em] text-white"
            >
              Signal Detected
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-cyan-300/40 hover:text-cyan-200"
            aria-label="Close Signal Detected details"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-94px)] space-y-4 overflow-y-auto px-5 py-4">
          {row ? (
            <>
              <div className="rounded-[20px] border border-cyan-400/18 bg-cyan-400/[0.055] p-4 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
                <div className="flex items-center gap-3">
                  <SignalDetailTeamLogoStack row={row} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">
                      {row.sport}
                    </p>
                    <p className="mt-1 truncate text-lg font-black text-white">
                      {row.matchup}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[16px] border border-cyan-400/24 bg-black/22 px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">
                    Pick Detected
                  </p>
                  <p className="mt-1 text-xl font-black text-cyan-200">{row.pick}</p>
                </div>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4">
                <DetailLine label="Sport" value={row.sport} />
                <DetailLine label="Teams" value={row.matchup} />
                <DetailLine label="Game Time" value={row.time} />
                <DetailLine label="Pick" value={row.pick} />
                <DetailLine label="Status" value={formatStatus(status)} />
              </div>

              <div className={`rounded-[16px] border px-4 py-3 text-sm font-semibold leading-5 ${getStatusClass(status)}`}>
                {getStatusMessage(status)}
              </div>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-cyan-300">
                  What does this mean?
                </h3>
                <div className="mt-3 space-y-2 text-[13px] leading-5 text-white/70">
                  <p>Atlas has detected meaningful market activity for this matchup.</p>
                  <p>
                    This signal is part of our free market feed and may change as additional market
                    information becomes available.
                  </p>
                  <p>Premium signals are validated separately before release.</p>
                </div>
              </section>

              <button
                type="button"
                onClick={onLearnTopSignals}
                className="h-13 w-full rounded-[16px] border border-cyan-400/30 bg-cyan-400/12 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.12)] transition hover:bg-cyan-400/18"
              >
                Learn about Top Signals
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
