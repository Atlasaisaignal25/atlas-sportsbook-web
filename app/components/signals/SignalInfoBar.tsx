"use client";

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 10.8v5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 7.6h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10V7.7a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SignalInfoBar() {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-[14px] border border-white/10 bg-white/[0.025] px-2.5 py-1.5 text-[9px] leading-3 text-white/62">
      <p className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-cyan-300">
          <InfoIcon />
        </span>
        <span className="truncate">
          <span className="font-bold text-white/82">Top Signal</span> releases 1 hour before each game.
        </span>
      </p>
      <span className="h-4 w-px shrink-0 bg-white/10" />
      <p className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-white/45">
          <LockIcon />
        </span>
        <span className="truncate">Picks remain locked after kickoff.</span>
      </p>
    </div>
  );
}
