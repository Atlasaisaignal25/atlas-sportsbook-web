"use client";

import type { SportCode } from "./SportSignalCard";
import { SportLineIcon } from "./sportVisuals";

export type OfficialSelectedSport = "all" | "baseball" | "basketball" | "football" | "ice_hockey" | "soccer";

export const officialSelectedSportToSportCode: Record<Exclude<OfficialSelectedSport, "all">, SportCode> = {
  baseball: "MLB",
  basketball: "NBA",
  football: "NFL",
  ice_hockey: "NHL",
  soccer: "SOCCER",
};

export const officialSportCodeToSelectedSport: Record<SportCode, Exclude<OfficialSelectedSport, "all">> = {
  MLB: "baseball",
  NBA: "basketball",
  NFL: "football",
  NHL: "ice_hockey",
  SOCCER: "soccer",
};

const officialSportOptions: Array<{ sport: OfficialSelectedSport; label: string }> = [
  { sport: "all", label: "TOP" },
  { sport: "baseball", label: "Baseball" },
  { sport: "basketball", label: "Basketball" },
  { sport: "ice_hockey", label: "Hockey" },
  { sport: "football", label: "Football" },
  { sport: "soccer", label: "Soccer" },
];

function OfficialTrophyIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-hidden="true">
      <path d="M19 14h18v6.5c0 6.6-3.6 11.4-9 12.4-5.4-1-9-5.8-9-12.4V14Z" fill="url(#officialSportTrophyGradient)" stroke="#ffcf55" strokeWidth="1.4" />
      <path d="M19 18h-5c0 5 2.4 8.4 6.1 9.4M37 18h5c0 5-2.4 8.4-6.1 9.4M28 33v6M22 42h12M20 46h16" stroke="#ffcf55" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="officialSportTrophyGradient" x1="18" y1="14" x2="38" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe58b" />
          <stop offset="0.45" stopColor="#ffb81c" />
          <stop offset="1" stopColor="#a86500" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function OfficialSportSelectorRow({
  selectedSport,
  onSelectSport,
  className = "",
  framed = true,
}: {
  selectedSport: OfficialSelectedSport;
  onSelectSport: (sport: OfficialSelectedSport) => void;
  className?: string;
  framed?: boolean;
}) {
  return (
    <div className={`pointer-events-auto ${className}`}>
      {framed ? <div className="absolute -inset-x-2 -top-3 -bottom-6 rounded-[15px] bg-[#030814]/[0.99] shadow-[0_-10px_22px_rgba(3,8,20,0.92),0_12px_24px_rgba(3,8,20,0.95)]" /> : null}
      <div className="relative grid grid-cols-6 gap-[5px]">
        {officialSportOptions.map((option) => {
          const active = selectedSport === option.sport;
          const sportCode = option.sport === "all" ? null : officialSelectedSportToSportCode[option.sport];

          return (
            <button
              key={option.sport}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectSport(option.sport)}
              className={`grid h-[40px] place-items-center rounded-[8px] border px-1 py-0.5 transition ${
                active
                  ? "border-cyan-300 bg-cyan-400/8 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.16)]"
                  : "border-white/18 bg-[#050b16]/95 text-white/78"
              }`}
            >
              <span className={active ? "text-cyan-300" : "text-white/80"}>
                {option.sport === "all" ? (
                  <OfficialTrophyIcon className="h-[22px] w-[22px]" />
                ) : (
                  <SportLineIcon sport={sportCode as SportCode} className="h-[22px] w-[22px]" alt="" />
                )}
              </span>
              <span className="mt-0.5 max-w-full truncate text-center text-[7.5px] font-bold leading-none">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
