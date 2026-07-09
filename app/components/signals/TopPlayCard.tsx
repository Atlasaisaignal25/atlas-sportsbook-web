"use client";

export type TopPlayViewModel = {
  status: string;
  progressPercent: number;
  helperText: string;
  actionLabel: string;
  actionTone: "notify" | "unlock" | "view" | "closed";
  pickLabel?: string | null;
  pickMeta?: string | null;
};

function TrophyIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-8 w-8" fill="none" aria-hidden="true">
      <path
        d="M18 12h28v8c0 10.5-5.7 18.5-14 21.2C23.7 38.5 18 30.5 18 20v-8Z"
        fill="url(#topPlayTrophy)"
        stroke="#fde68a"
        strokeWidth="2"
      />
      <path d="M18 17H9c.5 9.5 5.8 15 13 16.6M46 17h9c-.5 9.5-5.8 15-13 16.6" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 41v8M24 52h16M20 57h24" stroke="#fde68a" strokeWidth="3" strokeLinecap="round" />
      <defs>
        <linearGradient id="topPlayTrophy" x1="18" x2="46" y1="12" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff7ad" />
          <stop offset="0.48" stopColor="#facc15" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
      <path d="M6.5 10.4a5.5 5.5 0 0 1 11 0v3.1l1.5 2.7H5l1.5-2.7v-3.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 18.2a2.3 2.3 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function TopPlayCard({
  data,
  onAction,
  onOpen,
}: {
  data: TopPlayViewModel;
  onAction?: () => void;
  onOpen?: () => void;
}) {
  const progress = Math.max(0, Math.min(100, Math.round(data.progressPercent)));
  const activeCommerce = data.actionTone === "unlock" || data.actionTone === "view";
  const closed = data.actionTone === "closed";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      aria-label="Open Top Play details"
      className={`h-[112px] cursor-pointer rounded-[20px] border bg-[radial-gradient(circle_at_48px_50%,rgba(250,204,21,0.20),rgba(250,204,21,0.05)_36%,rgba(5,8,22,0.94)_72%)] p-2 shadow-[0_0_22px_rgba(234,179,8,0.12)] transition-all duration-200 active:scale-[0.995] ${
        activeCommerce
          ? "border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.22)]"
          : closed
            ? "border-white/14 opacity-90"
            : "border-yellow-400/80"
      }`}
    >
      <div className="grid h-full grid-cols-[54px_minmax(0,1fr)_102px] items-center gap-2.5">
        <div className="grid h-[54px] w-[54px] place-items-center rounded-full border border-yellow-300/25 bg-yellow-300/10 shadow-[0_0_26px_rgba(250,204,21,0.24)]">
          <TrophyIcon />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[18px] font-black uppercase tracking-[-0.03em] text-white">Top Play</h3>
            <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-[8px] font-black uppercase tracking-[0.06em] text-cyan-300">
              All Sports
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] leading-4 text-white/68">
            {data.pickLabel ?? "Atlas is comparing every sport"}
          </p>
          {data.pickMeta ? (
            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-yellow-200/70">
              {data.pickMeta}
            </p>
          ) : null}
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
              <div
                className="atlas-progress-stripes h-full rounded-full bg-yellow-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-9 text-right text-[13px] font-black text-yellow-300">{progress}%</span>
          </div>
        </div>

        <div className="h-full border-l border-white/10 pl-3">
          <p className="truncate text-[11px] font-black text-yellow-300">{data.status}</p>
          <p className="mt-2 text-[10px] leading-3 text-white/58">{data.helperText}</p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAction?.();
            }}
            disabled={closed}
            aria-label={data.actionLabel}
            className={`mt-2.5 inline-flex h-[28px] w-full items-center justify-center gap-1 rounded-full border px-2 text-[9px] font-black transition-all ${
              data.actionTone === "unlock"
                ? "animate-pulse border-yellow-300/40 bg-yellow-300 text-black shadow-[0_0_14px_rgba(250,204,21,0.28)]"
                : data.actionTone === "view"
                  ? "border-cyan-300/35 bg-cyan-300 text-black"
                  : data.actionTone === "closed"
                    ? "cursor-not-allowed border-white/10 bg-white/[0.035] text-white/42"
                    : "border-white/14 bg-white/[0.04] text-white/82"
            }`}
          >
            {data.actionTone === "notify" ? <BellIcon /> : null}
            {data.actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
