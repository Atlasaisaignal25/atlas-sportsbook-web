"use client";

export type ActivityMetric = {
  label: string;
  value: number;
  tone: "green" | "cyan" | "blue" | "purple" | "gold";
};

function MetricIcon({ tone }: { tone: ActivityMetric["tone"] }) {
  const color =
    tone === "green"
      ? "text-lime-300"
      : tone === "purple"
        ? "text-fuchsia-300"
        : tone === "gold"
          ? "text-yellow-300"
          : "text-cyan-300";

  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${color}`} fill="none" aria-hidden="true">
      {tone === "green" ? (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : tone === "purple" ? (
        <>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 12l5-5M16 6h2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : tone === "gold" ? (
        <>
          <path d="M8 5h8v4c0 4-1.8 7-4 7S8 13 8 9V5Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 7H5c0 3 1.3 5.1 4 5.8M16 7h3c0 3-1.3 5.1-4 5.8M10 20h4M12 16v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : tone === "blue" ? (
        <>
          <path d="M4 17l5-5 3 3 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 7h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M15 15l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function TodayActivityCard({ metrics }: { metrics: ActivityMetric[] }) {
  return (
    <section
      className="mt-2.5 rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),rgba(255,255,255,0.025)_50%)] px-3 py-2.5"
      aria-label="Today's Activity"
    >
      <p className="text-[12px] font-black uppercase tracking-[0.13em] text-cyan-300">
        Today&apos;s Activity
      </p>
      <div className="mt-2 grid grid-cols-5 divide-x divide-white/10 text-center">
        {metrics.map((metric) => (
          <div key={metric.label} className="px-1">
            <div className="mx-auto grid h-6 place-items-center">
              <MetricIcon tone={metric.tone} />
            </div>
            <p className="mt-0.5 text-[17px] font-black leading-none text-white">{metric.value}</p>
            <p className="mt-0.5 text-[9px] leading-3 text-white/58">{metric.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
