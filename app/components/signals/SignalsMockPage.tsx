"use client";

import { useState } from "react";

type MockNavSection = "bankroll" | "scores" | "signals" | "alerts" | "more";

function MockBottomNavIcon({ section }: { section: MockNavSection }) {
  if (section === "bankroll") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M4.5 8.5h15v9h-15z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 8.5V6.8c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 12.2h5.2M8 15h3.4M17 13.6h.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (section === "scores") {
    return <span className="text-[10px] font-black leading-none">0:0</span>;
  }

  if (section === "signals") {
    return (
      <img
        src="/signals-nav-logo.png"
        alt=""
        className="h-full w-full object-cover object-center"
      />
    );
  }

  if (section === "alerts") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M6.5 10.4a5.5 5.5 0 0 1 11 0v3.1l1.5 2.7H5l1.5-2.7v-3.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M10 18.2a2.3 2.3 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MockBottomNav() {
  const items: Array<{ section: MockNavSection; label: string }> = [
    { section: "bankroll", label: "Bankroll" },
    { section: "scores", label: "Scores" },
    { section: "signals", label: "Signals" },
    { section: "alerts", label: "Alerts" },
    { section: "more", label: "More" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-white/10 bg-[#050816]/95 px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
      <div className="grid grid-cols-5 text-[11px]">
        {items.map((item) => {
          const active = item.section === "signals";

          return (
            <button
              key={item.section}
              type="button"
              aria-label={`Open ${item.label}`}
              className={`flex flex-col items-center rounded-2xl px-2 font-semibold transition-all ${
                item.section === "signals" ? "-mt-2 gap-0.5 py-1" : "gap-1 py-2"
              } ${
                active
                  ? "bg-cyan-400/10 text-cyan-300"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              <span
                className={`flex items-center justify-center overflow-hidden rounded-full text-[10px] font-black ${
                  item.section === "signals"
                    ? "h-12 w-12 border border-cyan-300/30 bg-[#020916] shadow-[0_0_20px_rgba(34,211,238,0.22)] ring-2 ring-cyan-300/40"
                    : `h-6 w-6 ${active ? "bg-cyan-400 text-black" : "bg-white/10"}`
                }`}
              >
                <MockBottomNavIcon section={item.section} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MockModeSwitch() {
  const [mode, setMode] = useState<"signals" | "live">("signals");

  return (
    <div className="absolute left-[3.3%] right-[3.3%] top-[28.1%] z-20 rounded-[18px] border border-white/10 bg-[#070d18]/82 p-1.5 shadow-[0_0_18px_rgba(0,204,255,0.08)] backdrop-blur-md">
      <div className="grid grid-cols-2 gap-1.5">
        {(["signals", "live"] as const).map((item) => {
          const active = mode === item;

          return (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`h-9 rounded-[14px] text-[13px] font-black transition-all ${
                active
                  ? "bg-cyan-400 text-black shadow-[0_0_16px_rgba(34,211,238,0.28)]"
                  : "bg-transparent text-white/55"
              }`}
            >
              {item === "signals" ? "Signals" : "Live"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MockHeaderActions() {
  return (
    <div className="pointer-events-auto absolute right-[4.2%] top-[5.7%] z-20 flex flex-col items-end gap-3">
      <button
        type="button"
        aria-label="Guest account"
        className="flex h-9 items-center gap-2 rounded-[11px] border border-[#f5b400]/80 bg-black/18 px-3 text-[12px] font-black tracking-wide text-white shadow-[0_0_12px_rgba(245,180,0,0.16)] backdrop-blur-md"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
          <circle cx="12" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5.5 20c.8-4 3.1-6 6.5-6s5.7 2 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        GUEST
      </button>

      <button
        type="button"
        aria-label="How it works"
        className="mt-10 flex h-9 items-center gap-2 rounded-[11px] border border-cyan-300/80 bg-black/18 px-3 text-[11px] font-black text-white shadow-[0_0_12px_rgba(34,211,238,0.14)] backdrop-blur-md"
      >
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/80 text-[11px] font-black">
          i
        </span>
        How It Works
      </button>
    </div>
  );
}

function MockSportSelectorOverlay() {
  const sports = [
    { label: "TOP", icon: "top" },
    { label: "Baseball", icon: "baseball" },
    { label: "Basketball", icon: "basketball" },
    { label: "Ice Hockey", icon: "hockey" },
    { label: "Football", icon: "football" },
    { label: "Soccer", icon: "soccer" },
  ];

  return (
    <div className="pointer-events-auto absolute left-[3%] right-[3%] top-[20.05%] z-20">
      <div
        aria-hidden="true"
        className="absolute inset-x-[-4px] top-[-10px] h-[76px] rounded-[18px] bg-[#030814]/95 shadow-[0_0_26px_rgba(3,8,20,0.96)] backdrop-blur-[2px]"
      />
      <div className="relative grid grid-cols-6 gap-2">
        {sports.map((sport) => (
          <button
            key={sport.label}
            type="button"
            aria-label={`${sport.label} mode`}
            className="flex h-[54px] flex-col items-center justify-center rounded-[10px] border border-white/18 bg-black/16 text-white/82 shadow-[inset_0_0_14px_rgba(255,255,255,0.02)] transition hover:border-cyan-300/55 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
          >
            {sport.icon === "top" ? (
              <svg viewBox="0 0 64 64" className="h-6 w-6" fill="none" aria-hidden="true">
                <path
                  d="m32 8 6.8 14 15.4 2.2-11.1 10.9 2.6 15.3L32 43.1 18.3 50.4l2.6-15.3L9.8 24.2 25.2 22 32 8Z"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <SportLineIcon type={sport.icon} className="h-8 w-8" />
            )}
            <span className="mt-1 text-[8px] font-black leading-none">{sport.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const topSignalCards = [
  {
    sport: "BASEBALL",
    accent: "lime",
    color: "#9cff22",
    icon: "baseball",
  },
  {
    sport: "BASKETBALL",
    accent: "cyan",
    color: "#20d9ee",
    icon: "basketball",
  },
  {
    sport: "FOOTBALL",
    accent: "pink",
    color: "#f169df",
    icon: "football",
  },
  {
    sport: "ICE HOCKEY",
    accent: "gold",
    color: "#ffc400",
    icon: "hockey",
  },
  {
    sport: "SOCCER",
    accent: "cyan",
    color: "#20d9ee",
    icon: "soccer",
  },
];

const signalRows = [
  {
    sport: "BASEBALL",
    matchup: "Giants vs Rockies",
    pick: "Colorado Rockies (+1.5)",
    time: "8:11 PM",
    icon: "baseball",
  },
  {
    sport: "BASKETBALL",
    matchup: "Lakers vs Celtics",
    pick: "Lakers -2.5",
    time: "9:00 PM",
    icon: "basketball",
  },
  {
    sport: "FOOTBALL",
    matchup: "Chiefs vs Raiders",
    pick: "Kansas City Chiefs -3.0",
    time: "8:15 PM",
    icon: "football",
  },
  {
    sport: "ICE HOCKEY",
    matchup: "Oilers vs Canucks",
    pick: "Edmonton Oilers -1.5",
    time: "9:30 PM",
    icon: "hockey",
  },
  {
    sport: "SOCCER",
    matchup: "Real Madrid vs Barcelona",
    pick: "Real Madrid ML",
    time: "3:00 PM",
    icon: "soccer",
  },
];

function SportLineIcon({
  type,
  className = "",
}: {
  type: string;
  className?: string;
}) {
  const assetMap: Record<string, string> = {
    baseball: "/assets/sports/atlas/baseball.png",
    basketball: "/assets/sports/atlas/basketball.png",
    football: "/assets/sports/atlas/football.png",
    hockey: "/assets/sports/atlas/hockey.png",
    soccer: "/assets/sports/atlas/soccer.png",
  };

  if (assetMap[type]) {
    return (
      <img
        src={assetMap[type]}
        alt=""
        className={`${className} object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.16)]`}
        draggable={false}
      />
    );
  }

  if (type === "baseball") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="2.4" />
        <path d="M21 12c7.5 10.5 7.5 29.5 0 40M43 12c-7.5 10.5-7.5 29.5 0 40" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "basketball") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="2.4" />
        <path d="M7 32h50M32 7v50M14 15c13 8 22 25 22 42M50 15c-13 8-22 25-22 42" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "football") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <path d="M10 42c5-18 19-29 44-31-2 24-13 39-31 44-7-2-11-6-13-13Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M25 25l14 14M31 23l-5 5M37 25l-7 7M43 29l-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "hockey") {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
        <path d="M17 9l17 43c1 3-1 5-4 5H14M47 9 30 52c-1 3 1 5 4 5h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx="32" cy="49" rx="6" ry="3" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="2.4" />
      <path d="m32 16 11 8-4 13H25l-4-13 11-8ZM25 37l-8 9M39 37l8 9M21 24l-11 2M43 24l11 2" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <path d="M21 12h22v9c0 12-4 21-11 21s-11-9-11-21v-9Z" fill="currentColor" opacity=".92" />
      <path d="M24 44h16M28 42v9h8v-9M23 51h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M21 17H11c0 10 5 16 13 17M43 17h10c0 10-5 16-13 17" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M3 5h2l2.2 10.2h10.4l2-7.2H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  );
}

function TopPlayMockCard() {
  return (
    <section className="rounded-[16px] border border-[#f5b400] bg-[#030b16]/78 p-2 shadow-[0_0_18px_rgba(245,180,0,0.12)] backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-[#f5c400]/80 bg-[#120d04] text-[#ffc400] shadow-[0_0_16px_rgba(255,196,0,0.18)]">
          <TrophyIcon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-black leading-none tracking-wide">TOP PLAY</h2>
            <span className="rounded-full bg-cyan-500/14 px-2 py-1 text-[10px] font-black tracking-wide text-cyan-300">
              ALL SPORTS
            </span>
          </div>
          <p className="mt-1.5 text-[12px] font-medium text-white/88">Atlas is comparing every sport</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-[#ffd321] via-[#ffc02d] to-[#f4a900] shadow-[0_0_12px_rgba(255,202,35,0.5)]" />
            </div>
            <span className="text-[18px] font-black text-[#ffc400]">100%</span>
          </div>
        </div>
        <div className="ml-1 flex w-[88px] shrink-0 flex-col border-l border-white/22 pl-3">
          <span className="text-[12px] font-black text-[#ffc400]">Market Scan</span>
          <span className="mt-1.5 text-[10px] text-white/72">Coming Soon</span>
          <button
            type="button"
            className="mt-2 flex h-7 items-center justify-center gap-1.5 rounded-[10px] border border-[#ffc400] bg-black/18 text-[9px] font-black text-[#ffc400]"
          >
            <CartIcon className="h-3.5 w-3.5" />
            BUY NOW
          </button>
        </div>
      </div>
    </section>
  );
}

function TopSignalMockCard({
  sport,
  color,
  icon,
}: {
  sport: string;
  color: string;
  icon: string;
}) {
  return (
    <article
      className="flex h-[108px] min-w-0 flex-1 flex-col rounded-[12px] border bg-[#030b16]/76 px-1.5 py-1.5 backdrop-blur-md"
      style={{
        borderColor: color,
        boxShadow: `0 0 15px ${color}18`,
      }}
    >
      <h3 className="text-center text-[8px] font-black leading-tight text-white">{sport}</h3>
      <div className="mt-px flex justify-center text-white">
        <SportLineIcon type={icon} className="h-11 w-11" />
      </div>
      <p className="text-center text-[8px] font-bold" style={{ color }}>
        Top Signal
      </p>
      <div className="mt-1 flex items-center gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${color}, ${color}cc)`,
              boxShadow: `0 0 9px ${color}88`,
            }}
          />
        </div>
        <span className="text-[9px] font-black" style={{ color }}>
          100%
        </span>
      </div>
      <button
        type="button"
        className="mt-auto flex h-5 items-center justify-center gap-1 rounded-[7px] border bg-black/20 text-[7px] font-black"
        style={{ borderColor: color, color }}
      >
        <CartIcon className="h-3 w-3" />
        BUY NOW
      </button>
    </article>
  );
}

function SignalInfoBar() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[12px] border border-white/18 bg-[#030b16]/80 px-2.5 py-1.5 text-[10px] text-white/76 backdrop-blur-md">
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-cyan-300 text-[10px] font-black text-cyan-300">
        i
      </span>
      <span>
        <b className="font-black text-white">Top Signal</b> releases 1 hour before each game
      </span>
      <span className="h-5 w-px bg-white/24" />
      <span className="text-white/70">Picks remain locked after kickoff</span>
    </div>
  );
}

function SignalDetectedPanel() {
  return (
    <section className="overflow-hidden rounded-[17px] border border-white/16 bg-[#030b16]/78 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/12 px-3 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-black tracking-[0.16em] text-cyan-300">SIGNAL DETECTED</h2>
          <span className="rounded-full bg-cyan-500/12 px-2.5 py-1 text-[11px] font-bold text-cyan-300">
            All · 10 Signals
          </span>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-bold text-white/88">
          View All
          <span className="text-xl leading-none">›</span>
        </button>
      </div>
      <div className="max-h-[120px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {signalRows.map((row) => (
          <button
            key={`${row.sport}-${row.matchup}`}
            type="button"
            className="grid w-full grid-cols-[52px_1fr_66px_40px_14px] items-center gap-2 border-b border-white/10 px-3 py-1.5 text-left last:border-b-0"
          >
            <div className="flex flex-col items-center gap-0.5 text-white">
              <SportLineIcon type={row.icon} className="h-7 w-7" />
              <span className="text-[8px] font-bold text-white/70">{row.sport}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-white">{row.matchup}</p>
              <p className="truncate text-[12px] font-medium text-cyan-300">{row.pick}</p>
            </div>
            <span className="justify-self-end rounded-[8px] border border-cyan-400/70 px-2 py-1 text-[9px] font-black text-cyan-300">
              PENDING
            </span>
            <span className="text-right text-[11px] font-medium text-white/62">{row.time}</span>
            <span className="text-2xl leading-none text-white/62">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TodayActivityPanel() {
  const metrics = [
    { label: "Signals\nDetected", value: "10", color: "#9cff22", icon: "clock" },
    { label: "In Review", value: "5", color: "#35b7ff", icon: "search" },
    { label: "Strong\nCandidates", value: "0", color: "#c058ff", icon: "trend" },
    { label: "Final Review", value: "0", color: "#ff6fd8", icon: "target" },
    { label: "Top Play", value: "0", color: "#ffc400", icon: "trophy" },
  ];

  return (
    <section className="rounded-[14px] border border-white/16 bg-[#030b16]/78 px-2 py-1.5 backdrop-blur-md">
      <h2 className="mb-0.5 text-[10px] font-black tracking-[0.16em] text-cyan-300">TODAY’S ACTIVITY</h2>
      <div className="grid grid-cols-5">
        {metrics.map((metric, index) => (
          <div key={metric.label} className={`flex flex-col items-center px-1 text-center ${index ? "border-l border-white/18" : ""}`}>
            <div className="text-[12px] font-black leading-none" style={{ color: metric.color }}>
              {metric.icon === "trophy" ? "♕" : metric.icon === "trend" ? "↗" : metric.icon === "search" ? "⌕" : metric.icon === "target" ? "◴" : "◷"}
            </div>
            <div className="mt-px text-[12px] font-black leading-none text-white">{metric.value}</div>
            <div className="mt-px whitespace-pre-line text-[7px] leading-[1.02] text-white/66">{metric.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalsMockContent() {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[112px] top-[33.1%] z-20 overflow-y-auto px-3 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="space-y-2">
        <h2 className="pb-1.5 pt-2 text-[15px] font-black tracking-[0.16em] text-cyan-300">TOP PLAY</h2>
        <TopPlayMockCard />

        <h2 className="pt-0.5 text-[15px] font-black tracking-[0.16em] text-cyan-300">TOP SIGNALS</h2>
        <div className="grid grid-cols-5 gap-1.5">
          {topSignalCards.map((card) => (
            <TopSignalMockCard
              key={card.sport}
              sport={card.sport}
              color={card.color}
              icon={card.icon}
            />
          ))}
        </div>

        <SignalInfoBar />
        <TodayActivityPanel />
        <SignalDetectedPanel />
      </div>
    </div>
  );
}

export function SignalsMockPage() {
  return (
    <main className="min-h-screen bg-[#030814] text-white">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#030814]">
        <section className="relative mx-auto min-h-screen w-full overflow-hidden bg-[#030814]">
          <img
            src="/mockups/signals-frame-v2.jpg"
            alt="Atlas Signals frame mockup"
            className="block h-screen w-full select-none object-cover object-top"
            draggable={false}
          />

          <div aria-hidden="true" className="pointer-events-none absolute inset-0" />

          <MockSportSelectorOverlay />
          <MockHeaderActions />
          <MockModeSwitch />
          <SignalsMockContent />
          <MockBottomNav />
        </section>
      </div>
    </main>
  );
}
