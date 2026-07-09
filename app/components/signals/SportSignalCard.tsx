"use client";

export type SportCode = "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER";

export type SportSignalViewModel = {
  sport: SportCode;
  status: string;
  progressPercent: number;
  helperText: string;
  actionLabel: string;
  actionTone: "notify" | "unlock" | "view" | "closed";
  pickLabel?: string | null;
  pickMeta?: string | null;
};

import { getAtlasSportDisplayName, SportLineIcon } from "./sportVisuals";

const sportAccentMap: Record<
  SportCode,
  { border: string; text: string; fill: string; glow: string }
> = {
  MLB: {
    border: "border-lime-400/70",
    text: "text-lime-300",
    fill: "bg-lime-400",
    glow: "shadow-[0_0_18px_rgba(74,222,128,0.12)]",
  },
  NBA: {
    border: "border-cyan-400/70",
    text: "text-cyan-300",
    fill: "bg-cyan-300",
    glow: "shadow-[0_0_18px_rgba(34,211,238,0.12)]",
  },
  NFL: {
    border: "border-fuchsia-400/60",
    text: "text-fuchsia-300",
    fill: "bg-fuchsia-400",
    glow: "shadow-[0_0_18px_rgba(217,70,239,0.10)]",
  },
  NHL: {
    border: "border-yellow-400/70",
    text: "text-yellow-300",
    fill: "bg-yellow-300",
    glow: "shadow-[0_0_18px_rgba(250,204,21,0.12)]",
  },
  SOCCER: {
    border: "border-cyan-400/70",
    text: "text-cyan-300",
    fill: "bg-cyan-300",
    glow: "shadow-[0_0_18px_rgba(34,211,238,0.12)]",
  },
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
      <path d="M6.5 10.4a5.5 5.5 0 0 1 11 0v3.1l1.5 2.7H5l1.5-2.7v-3.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 18.2a2.3 2.3 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SportSignalCard({
  signal,
  onAction,
  onOpen,
}: {
  signal: SportSignalViewModel;
  onAction?: (sport: SportCode) => void;
  onOpen?: (sport: SportCode) => void;
}) {
  const accent = sportAccentMap[signal.sport];
  const progress = Math.max(0, Math.min(100, Math.round(signal.progressPercent)));
  const activeCommerce = signal.actionTone === "unlock" || signal.actionTone === "view";
  const closed = signal.actionTone === "closed";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(signal.sport)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(signal.sport);
        }
      }}
      aria-label={`Open ${signal.sport} Top Signal details`}
      className={`relative h-[138px] min-w-0 cursor-pointer overflow-hidden rounded-[15px] border bg-[radial-gradient(circle_at_center_top,rgba(0,229,255,0.08),rgba(255,255,255,0.025)_44%,rgba(0,0,0,0.08))] px-1.5 py-2 text-center transition-all duration-200 active:scale-[0.995] ${accent.glow} ${
        activeCommerce ? `${accent.border} shadow-[0_0_24px_rgba(34,211,238,0.18)]` : closed ? "border-white/10 opacity-80" : accent.border
      }`}
    >
      <p className="absolute inset-x-1 top-2 text-[10px] font-black uppercase tracking-[-0.02em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
        {getAtlasSportDisplayName(signal.sport)}
      </p>
      <div className="absolute inset-x-0 top-[30px] mx-auto grid h-[42px] place-items-center">
        <SportLineIcon
          sport={signal.sport}
          className="h-[42px] w-[42px] drop-shadow-[0_0_12px_rgba(255,255,255,0.20)]"
        />
      </div>
      <p className={`absolute inset-x-1 top-[80px] truncate text-[9px] font-black leading-none ${accent.text}`}>
        {signal.status}
      </p>
      <div className="absolute inset-x-1.5 top-[96px] flex items-center gap-0.5">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/35">
          <div
            className={`atlas-progress-stripes h-full rounded-full ${accent.fill}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`w-6 text-right text-[9px] font-black ${accent.text}`}>{progress}%</span>
      </div>
      <p className="absolute inset-x-1 top-[112px] truncate text-[8px] font-black leading-none text-white/70">
        {signal.pickLabel ?? signal.helperText}
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onAction?.(signal.sport);
        }}
        disabled={closed}
        aria-label={`${signal.actionLabel} for ${signal.sport} Top Signal`}
        className={`absolute inset-x-1.5 bottom-2 inline-flex h-[22px] items-center justify-center gap-0.5 truncate rounded-full border px-1 text-[7px] font-bold ${
          signal.actionTone === "unlock"
            ? "animate-pulse border-cyan-300/40 bg-cyan-300 text-black shadow-[0_0_12px_rgba(34,211,238,0.25)]"
            : signal.actionTone === "view"
              ? "border-lime-300/40 bg-lime-300 text-black"
              : signal.actionTone === "closed"
                ? "border-white/10 bg-white/[0.035] text-white/40"
                : "border-white/10 bg-black/20 text-white/82"
        }`}
      >
        {signal.actionTone === "notify" ? <BellIcon /> : null}
        {signal.actionLabel}
      </button>
    </article>
  );
}
