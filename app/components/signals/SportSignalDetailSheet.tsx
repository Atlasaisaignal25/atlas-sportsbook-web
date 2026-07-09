"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PrecisionNotifyResult,
  PrecisionUnlockResult,
  SignalsHomePrecisionResponse,
} from "./SignalsHomePage";
import type { SportCode } from "./SportSignalCard";

const sportLogoMap: Record<SportCode, string> = {
  MLB: "/assets/sports/mlb.svg",
  NBA: "/assets/sports/nba.svg",
  NFL: "/assets/sports/nfl.svg",
  NHL: "/assets/sports/nhl.svg",
  SOCCER: "/assets/sports/soccer.png",
};

function cleanText(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text === "undefined" || text === "null" || text === "NaN") {
    return fallback;
  }
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
  return "Scanning";
}

function formatCountdown(minutes?: number | null) {
  if (minutes === null || minutes === undefined || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/38">
        {label}
      </p>
      <p className="mt-1 text-[14px] font-bold text-white">{value}</p>
    </div>
  );
}

export function SportSignalDetailSheet({
  open,
  sport,
  data,
  onClose,
  onPrimaryAction,
  onReveal,
  notifyState = "idle",
  onNotify,
}: {
  open: boolean;
  sport: SportCode | null;
  data?: SignalsHomePrecisionResponse | null;
  onClose: () => void;
  onPrimaryAction?: (sport: SportCode) => Promise<PrecisionUnlockResult> | PrecisionUnlockResult | void;
  onReveal?: (sport: SportCode) => void;
  notifyState?: "idle" | "reserved" | "prepared" | "error";
  onNotify?: (sport: SportCode) => Promise<PrecisionNotifyResult>;
}) {
  const [rendered, setRendered] = useState(open);
  const [notifying, setNotifying] = useState(false);
  const [localNotifyState, setLocalNotifyState] = useState<"idle" | "error">("idle");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockFeedback, setUnlockFeedback] = useState("");
  const dragStartY = useRef<number | null>(null);
  const status = data?.status ?? "scanning";
  const closed =
    status === "locked" ||
    (data?.minutesToKickoff !== null &&
      data?.minutesToKickoff !== undefined &&
      data.minutesToKickoff <= 0);
  const noPlay = status === "no_play";
  const canReveal = Boolean(data?.admin || (data?.purchased && data?.canRevealPick));
  const hasPick = Boolean(data?.pick);
  const available = Boolean(data?.availableForPurchase || data?.canPurchase || status === "available_now");
  const progress = Math.max(0, Math.min(100, Math.round(data?.progressPercent ?? 0)));
  const countdown = formatCountdown(data?.minutesToRelease);
  const nflUnavailable =
    sport === "NFL" &&
    !data?.releaseAt &&
    !data?.lockedAt &&
    !data?.pick &&
    !data?.noPlayReason;

  useEffect(() => {
    if (open) setRendered(true);
    if (open) setUnlockFeedback("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!rendered || !sport) return null;

  let title = `${sport} Top Signal`;
  let subtitle = "Atlas is analyzing this sport.";
  let message = "Atlas is still validating this sport's strongest opportunity.";
  let cta = "Notify Me";

  if (nflUnavailable) {
    title = "NFL Signals Not Available Yet";
    subtitle = "Atlas Precision Engine";
    message = "NFL Top Signal will become available once the NFL engine and candidate pool are active.";
    cta = "Close";
  } else if (noPlay) {
    title = `No ${sport} Top Signal Today`;
    subtitle = "Atlas Precision Engine";
    message = "Atlas did not find a strong enough opportunity for this sport today.";
    cta = "Close";
  } else if (closed) {
    title = `Today's ${sport} Top Signal Closed`;
    subtitle = canReveal ? "Unlocked" : "Market window closed";
    message = "This Top Signal is no longer available for purchase.";
    cta = canReveal ? "View Pick" : "Close";
  } else if (canReveal) {
    title = `${sport} Top Signal`;
    subtitle = "Unlocked";
    message = `Today's strongest ${sport} opportunity is unlocked for this account.`;
    cta = "View Pick";
  } else if (available) {
    title = `${sport} Top Signal Available`;
    subtitle = `The strongest opportunity for ${sport} is ready.`;
    message = `Unlock today's ${sport} Top Signal to view the full pick.`;
    cta = "Unlock Top Signal — $24.99";
  }

  const notifyReserved = notifyState === "reserved" || notifyState === "prepared";
  const showNotifyFeedback =
    cta === "Notify Me" || notifyReserved || notifyState === "error" || localNotifyState === "error";
  const notifyFeedback =
    notifyState === "prepared"
      ? "Notification reserved. Push alerts coming soon."
      : notifyReserved
        ? "Notification reserved. We'll let you know when it's available."
        : notifyState === "error" || localNotifyState === "error"
          ? "Couldn't reserve notification. Try again."
          : "";
  let ctaDisabled = false;

  if (cta === "Notify Me" && notifyReserved) {
    cta = "Notification Reserved";
    ctaDisabled = true;
  } else if (cta === "Notify Me" && notifying) {
    ctaDisabled = true;
  } else if (cta.startsWith("Unlock") && unlocking) {
    ctaDisabled = true;
  }

  async function handleNotify() {
    if (!sport || notifyReserved || notifying) return;

    setNotifying(true);
    setLocalNotifyState("idle");

    try {
      const result = await onNotify?.(sport);
      if (!result || result.status === "error") {
        setLocalNotifyState("error");
      }
    } catch {
      setLocalNotifyState("error");
    } finally {
      setNotifying(false);
    }
  }

  async function handleUnlock() {
    if (!sport || unlocking) return;

    setUnlocking(true);
    setUnlockFeedback("");

    try {
      const result = await onPrimaryAction?.(sport);

      if (result?.status === "error") {
        setUnlockFeedback(result.message);
      }
    } catch {
      setUnlockFeedback("Could not start checkout. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/68 px-3 backdrop-blur-sm transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      onTransitionEnd={() => {
        if (!open) setRendered(false);
      }}
    >
      <div
        className={`max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[30px] border border-cyan-300/24 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),#07101f] shadow-[0_-24px_78px_rgba(34,211,238,0.18)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sport-signal-detail-title"
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
          <div className="flex min-w-0 items-start gap-3">
            <img
              src={sportLogoMap[sport]}
              alt={`${sport} logo`}
              className="mt-1 h-11 w-11 shrink-0 object-contain drop-shadow-[0_0_14px_rgba(34,211,238,0.24)]"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">
                Atlas Top Signal
              </p>
              <h2
                id="sport-signal-detail-title"
                className="mt-2 text-[24px] font-black leading-none tracking-[-0.03em] text-white"
              >
                {title}
              </h2>
              <p className="mt-2 text-[13px] font-semibold leading-5 text-white/65">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-cyan-300/40 hover:text-cyan-200"
            aria-label={`Close ${sport} Top Signal details`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-104px)] space-y-4 overflow-y-auto px-5 py-4">
          {!canReveal && !nflUnavailable ? (
            <div className="rounded-[20px] border border-cyan-300/18 bg-cyan-300/[0.055] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    Status
                  </p>
                  <p className="mt-1 text-[16px] font-black text-cyan-200">
                    {formatStatus(status)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    Progress
                  </p>
                  <p className="mt-1 text-[18px] font-black text-cyan-300">{progress}%</p>
                </div>
              </div>

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-cyan-400 to-sky-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {!noPlay && !closed ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <DetailRow label="Release time" value={formatDateTime(data?.releaseAt)} />
                  <DetailRow label="Countdown" value={countdown || "Coming Soon"} />
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4 text-[13px] leading-6 text-white/70">
            {message}
          </p>

          {showNotifyFeedback && notifyFeedback ? (
            <p
              className={`rounded-[16px] border px-4 py-3 text-[12px] font-semibold leading-5 ${
                notifyState === "error" || localNotifyState === "error"
                  ? "border-red-400/20 bg-red-400/[0.07] text-red-100"
                  : "border-cyan-300/18 bg-cyan-300/[0.055] text-cyan-100"
              }`}
            >
              {notifyFeedback}
            </p>
          ) : null}

          {unlockFeedback ? (
            <p className="rounded-[16px] border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-[12px] font-semibold leading-5 text-red-100">
              {unlockFeedback}
            </p>
          ) : null}

          {available && !canReveal && !closed && !noPlay && !nflUnavailable ? (
            <div className="rounded-[20px] border border-amber-300/24 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_38%),rgba(0,0,0,0.24)] p-4 shadow-[0_0_24px_rgba(245,158,11,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                    One-Time Access
                  </p>
                  <p className="mt-1 text-[15px] font-black text-white">
                    {sport} Top Signal
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[24px] font-black text-amber-300">$24.99</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
                    Daily unlock
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-[12px] font-semibold text-white/76">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  Full pick reveal when the market window opens.
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  Includes market, selection, line, odds and game time.
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  Single-day access for today&apos;s strongest {sport} signal.
                </span>
              </div>
              <p className="mt-3 rounded-[14px] border border-amber-300/14 bg-amber-300/[0.07] px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-100/82">
                Top Signal is sold separately and is not included with monthly packs.
              </p>
            </div>
          ) : null}

          {canReveal && !hasPick ? (
            <p className="rounded-[18px] border border-cyan-300/18 bg-cyan-300/[0.055] p-4 text-[13px] font-semibold leading-6 text-cyan-100">
              We&apos;re refreshing your purchase...
            </p>
          ) : null}

          <button
            type="button"
            disabled={ctaDisabled}
            onClick={() => {
              if (canReveal) {
                onReveal?.(sport);
                return;
              }
              if (
                cta === "Close" ||
                noPlay ||
                closed ||
                nflUnavailable
              ) {
                onClose();
                return;
              }
              if (cta === "Notify Me") {
                void handleNotify();
                return;
              }
              void handleUnlock();
            }}
            className={`w-full rounded-[18px] px-5 py-4 text-[14px] font-black uppercase tracking-[0.12em] transition ${
              available && !canReveal && !closed && !noPlay && !nflUnavailable
                ? "bg-cyan-300 text-black shadow-[0_0_26px_rgba(34,211,238,0.28)]"
                : "border border-white/12 bg-white/[0.05] text-white/82"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {unlocking && cta.startsWith("Unlock") ? "Opening Checkout" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}
