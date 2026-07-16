"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalsHomePrecisionResponse } from "./SignalsHomePage";
import type { SportCode } from "./SportSignalCard";

function cleanText(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text === "undefined" || text === "null" || text === "NaN") return fallback;
  return text;
}

function formatStatus(status?: string) {
  if (status === "locked") return "Closed";
  if (status === "available_now") return "Available Now";
  if (status === "no_play") return "No Play";
  if (status === "validating") return "Validating";
  if (status === "strong_candidate") return "Strong Candidate";
  if (status === "final_review") return "Final Review";
  if (status === "scanning") return "Scanning";
  return "Available";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatLine(value?: number | null) {
  if (value === null || value === undefined) return "Not available";
  return String(value);
}

function formatOdds(value?: number | null) {
  if (value === null || value === undefined) return "Not available";
  return `${Number(value) > 0 ? "+" : ""}${value}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-2.5 last:border-b-0">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
        {label}
      </span>
      <span className="max-w-[60%] text-right text-sm font-bold text-white/88">
        {value}
      </span>
    </div>
  );
}

export function PrecisionRevealSheet({
  open,
  productType,
  sport,
  data,
  onClose,
  onRefresh,
}: {
  open: boolean;
  productType: "top_play" | "top_signal";
  sport?: SportCode | null;
  data?: SignalsHomePrecisionResponse | null;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const [refreshSettled, setRefreshSettled] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const isTopSignal = productType === "top_play";
  const canReveal = Boolean(data?.admin || (data?.purchased && data?.canRevealPick));
  const hasPick = Boolean(data?.pick);
  const tone = isTopSignal ? "gold" : "cyan";
  const title = isTopSignal ? "Top Signal" : "Top Signal";
  const sportLabel = isTopSignal ? cleanText(data?.sport, "All Sports").toUpperCase() : sport ?? cleanText(data?.sport).toUpperCase();

  useEffect(() => {
    if (open) {
      setRendered(true);
      setRefreshAttempted(false);
      setRefreshSettled(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canReveal || hasPick || refreshAttempted) return;

    setRefreshAttempted(true);
    const timeout = window.setTimeout(() => {
      onRefresh?.();
    }, 350);
    const settleTimeout = window.setTimeout(() => {
      setRefreshSettled(true);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(settleTimeout);
    };
  }, [open, canReveal, hasPick, refreshAttempted, onRefresh]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  const accent =
    tone === "gold"
      ? {
          border: "border-yellow-300/28",
          text: "text-yellow-300",
          glow: "shadow-[0_-24px_78px_rgba(250,204,21,0.22)]",
          bg: "bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.22),transparent_34%),#07101f]",
          badge: "border-yellow-300/32 bg-yellow-300/12 text-yellow-100",
          button: "bg-yellow-300 text-black shadow-[0_0_26px_rgba(250,204,21,0.28)]",
        }
      : {
          border: "border-cyan-300/28",
          text: "text-cyan-300",
          glow: "shadow-[0_-24px_78px_rgba(34,211,238,0.22)]",
          bg: "bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.20),transparent_34%),#07101f]",
          badge: "border-cyan-300/32 bg-cyan-300/12 text-cyan-100",
          button: "bg-cyan-300 text-black shadow-[0_0_26px_rgba(34,211,238,0.28)]",
        };

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/72 px-3 backdrop-blur-sm transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      onTransitionEnd={() => {
        if (!open) setRendered(false);
      }}
    >
      <div
        className={`max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[30px] border ${accent.border} ${accent.bg} ${accent.glow} transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="precision-reveal-title"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          dragStartY.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (dragStartY.current !== null && event.clientY - dragStartY.current > 80) onClose();
          dragStartY.current = null;
        }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/18" />

        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-4">
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${accent.text}`}>
                Atlas Reveal
              </p>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${accent.badge}`}>
                Unlocked
              </span>
            </div>
            <h2
              id="precision-reveal-title"
              className="mt-2 text-[28px] font-black leading-none tracking-[-0.03em] text-white"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-white/30 hover:text-white"
            aria-label={`Close ${title} reveal`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-104px)] space-y-4 overflow-y-auto px-5 py-4">
          {canReveal && hasPick ? (
            <>
              <div className={`rounded-[22px] border ${accent.border} bg-black/24 p-4`}>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
                  Pick
                </p>
                <p className={`mt-2 text-[26px] font-black leading-tight ${accent.text}`}>
                  {cleanText(data?.pick?.pickLabel)}
                </p>
                <p className="mt-2 text-sm font-semibold text-white/58">
                  {sportLabel}
                </p>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4">
                <DetailRow label="Sport" value={sportLabel} />
                <DetailRow label="Matchup" value={cleanText(data?.pick?.matchup, "Matchup not available")} />
                <DetailRow label="Pick" value={cleanText(data?.pick?.pickLabel)} />
                <DetailRow label="Market" value={cleanText(data?.pick?.market)} />
                <DetailRow label="Selection" value={cleanText(data?.pick?.selection)} />
                <DetailRow label="Line" value={formatLine(data?.pick?.line)} />
                <DetailRow label="Odds" value={formatOdds(data?.pick?.odds)} />
                <DetailRow label="Game Time" value={formatDateTime(data?.pick?.startTime)} />
                <DetailRow label="Status" value={formatStatus(data?.status)} />
              </div>
            </>
          ) : canReveal && !hasPick && !refreshSettled ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-white/72"
            >
              We&apos;re refreshing your purchase...
            </p>
          ) : (
            <p
              role="status"
              aria-live="polite"
              className="rounded-[18px] border border-red-400/20 bg-red-400/[0.07] p-4 text-sm font-semibold leading-6 text-red-100"
            >
              We couldn&apos;t load your pick.
              <br />
              Please try again in a moment.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-[18px] px-5 py-4 text-[14px] font-black uppercase tracking-[0.14em] transition ${accent.button}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
