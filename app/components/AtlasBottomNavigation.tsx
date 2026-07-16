"use client";

export type AtlasBottomNavSection = "bankroll" | "news" | "signals" | "alerts" | "more";
export type AtlasBottomNavActiveSection = AtlasBottomNavSection | "scores";

function AtlasBottomNavIcon({ section }: { section: AtlasBottomNavSection }) {
  if (section === "bankroll") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M4.3 8.4h15.4a1.8 1.8 0 0 1 1.8 1.8v6.7a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V7.6c0-1 .7-1.8 1.7-2l10.3-1.7c1-.2 1.9.6 1.9 1.6v2.9" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M15.8 13.6h5.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M7 11.7h4.9M7 15h3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M18.2 13.6h.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (section === "news") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M13 2.8 4.8 13h6.1L9.7 21.2 19.2 9h-6.4L13 2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (section === "signals") {
    return (
      <img
        src="/signals-nav-logo.png"
        alt=""
        className="h-full w-full object-cover object-center"
        aria-hidden="true"
      />
    );
  }

  if (section === "alerts") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AtlasBottomNavigation({
  activeSection,
  onNavigate,
  placement = "sticky",
  zIndexClass = "z-40",
}: {
  activeSection: AtlasBottomNavActiveSection;
  onNavigate?: (section: AtlasBottomNavSection) => void;
  placement?: "sticky" | "fixed";
  zIndexClass?: string;
}) {
  const items: Array<{ section: AtlasBottomNavSection; label: string }> = [
    { section: "bankroll", label: "Bankroll" },
    { section: "news", label: "Market" },
    { section: "signals", label: "Home" },
    { section: "alerts", label: "My Atlas" },
    { section: "more", label: "More" },
  ];
  const navPositionClass = placement === "fixed" ? `fixed inset-x-0 ${zIndexClass}` : "sticky";

  return (
    <nav className={`${navPositionClass} bottom-0 border-t border-white/10 bg-[#050816]/95 backdrop-blur-xl`}>
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 py-3 text-[11px]">
        {items.map((item) => {
          const active = activeSection === item.section;

          return (
            <button
              key={item.section}
              type="button"
              aria-label={item.label}
              onClick={() => onNavigate?.(item.section)}
              className={`flex flex-col items-center rounded-2xl px-2 font-semibold transition-all ${
                item.section === "signals" ? "-mt-2 gap-0.5 py-1" : "gap-1 py-2"
              } ${active ? "bg-cyan-400/10 text-cyan-300" : "text-white/45"}`}
            >
              <span
                className={`flex items-center justify-center overflow-hidden rounded-full text-[10px] font-black ${
                  item.section === "signals"
                    ? `h-12 w-12 border border-cyan-300/30 bg-[#020916] shadow-[0_0_20px_rgba(34,211,238,0.22)] ${
                        active ? "ring-2 ring-cyan-300/40" : ""
                      }`
                    : `h-6 w-6 ${active ? "bg-cyan-400 text-black" : "bg-white/10"}`
                }`}
              >
                <AtlasBottomNavIcon section={item.section} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
