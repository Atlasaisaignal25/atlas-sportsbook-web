"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PrecisionNotifyResult,
  PrecisionUnlockResult,
  SignalsHomePrecisionResponse,
} from "./SignalsHomePage";

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

export function TopPlayDetailSheet({
  open,
  data,
  onClose,
  onPrimaryAction,
  onReveal,
  notifyState = "idle",
  onNotify,
}: {
  open: boolean;
  data?: SignalsHomePrecisionResponse | null;
  onClose: () => void;
  onPrimaryAction?: () => Promise<PrecisionUnlockResult> | PrecisionUnlockResult | void;
  onReveal?: () => void;
  notifyState?: "idle" | "reserved" | "prepared" | "error";
  onNotify?: () => Promise<PrecisionNotifyResult>;
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

  if (!rendered) return null;

  let title = "Top Play";
  let subtitle = "Atlas is analyzing every sport.";
  let message = "Atlas is still comparing the strongest opportunities across all sports.";
  let cta = "Notify Me";
  let ctaDisabled = false;

  if (noPlay) {
    title = "No Top Play Today";
    subtitle = "Atlas Precision Engine";
    message = "Atlas did not find a strong enough opportunity across all sports today.";
    cta = "Close";
  } else if (closed) {
    title = "Today's Top Play Closed";
    subtitle = canReveal ? "Unlocked" : "Market window closed";
    message = "This Top Play is no longer available for purchase.";
    cta = canReveal ? "View Pick" : "Close";
  } else if (canReveal) {
    title = "Top Play";
    subtitle = "Unlocked";
    message = "Today's strongest opportunity is unlocked for this account.";
    cta = "View Pick";
  } else if (available) {
    title = "Top Play Available";
    subtitle = "The strongest opportunity across all sports is ready.";
    message = "Unlock today's Top Play to view the full pick.";
    cta = "Unlock Top Play — $149.99";
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

  if (cta === "Notify Me" && notifyReserved) {
    cta = "Notification Reserved";
    ctaDisabled = true;
  } else if (cta === "Notify Me" && notifying) {
    ctaDisabled = true;
  } else if (cta.startsWith("Unlock") && unlocking) {
    ctaDisabled = true;
  }

  async function handleNotify() {
    if (notifyReserved || notifying) return;

    setNotifying(true);
    setLocalNotifyState("idle");

    try {
      const result = await onNotify?.();
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
    if (unlocking) return;

    setUnlocking(true);
    setUnlockFeedback("");

    try {
      const result = await onPrimaryAction?.();

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
        className={`max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[30px] border border-yellow-300/25 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.20),transparent_34%),#07101f] shadow-[0_-24px_78px_rgba(250,204,21,0.20)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-play-detail-title"
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
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-yellow-300">
              Atlas Top Play
            </p>
            <h2
              id="top-play-detail-title"
              className="mt-2 text-[26px] font-black leading-none tracking-[-0.03em] text-white"
            >
              {title}
            </h2>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-white/65">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-yellow-300/40 hover:text-yellow-200"
            aria-label="Close Top Play details"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-104px)] space-y-4 overflow-y-auto px-5 py-4">
          {!canReveal ? (
            <div className="rounded-[20px] border border-yellow-300/20 bg-yellow-300/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    Status
                  </p>
                  <p className="mt-1 text-[16px] font-black text-yellow-200">
                    {formatStatus(status)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    Progress
                  </p>
                  <p className="mt-1 text-[18px] font-black text-yellow-300">{progress}%</p>
                </div>
              </div>

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500"
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
                  : "border-yellow-300/20 bg-yellow-300/[0.06] text-yellow-100"
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

          {available && !canReveal && !closed && !noPlay ? (
            <div className="rounded-[20px] border border-yellow-300/20 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                Price
              </p>
              <p className="mt-1 text-[30px] font-black text-white">$149.99</p>
              <p className="mt-1 text-[12px] font-semibold text-white/50">
                One daily Top Play purchase.
              </p>
            </div>
          ) : null}

          {canReveal && !hasPick ? (
            <p className="rounded-[18px] border border-yellow-300/20 bg-yellow-300/[0.06] p-4 text-[13px] font-semibold leading-6 text-yellow-100">
              We&apos;re refreshing your purchase...
            </p>
          ) : null}

          <button
            type="button"
            disabled={ctaDisabled}
            onClick={() => {
              if (canReveal) {
                onReveal?.();
                return;
              }
              if (cta === "Close") {
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
              available && !canReveal && !closed && !noPlay
                ? "bg-yellow-300 text-black shadow-[0_0_26px_rgba(250,204,21,0.28)]"
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
