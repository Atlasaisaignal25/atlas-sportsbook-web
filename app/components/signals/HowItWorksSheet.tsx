"use client";

import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";

const timelineSteps = [
  "Scanning",
  "Validating",
  "Strong Candidate",
  "Final Review",
  "Available Now",
  "Closed",
];

function SectionBlock({
  title,
  children,
  sectionRef,
}: {
  title: string;
  children: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}) {
  return (
    <section ref={sectionRef} className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
      <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-cyan-300">
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-[13px] leading-5 text-white/70">
        {children}
      </div>
    </section>
  );
}

export function HowItWorksSheet({
  open,
  onClose,
  initialSection,
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: "top-signal";
}) {
  const [rendered, setRendered] = useState(open);
  const dragStartY = useRef<number | null>(null);
  const topSignalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useEffect(() => {
    if (!open || initialSection !== "top-signal") return;

    const frame = requestAnimationFrame(() => {
      topSignalRef.current?.scrollIntoView({ block: "start" });
    });

    return () => cancelAnimationFrame(frame);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-3 backdrop-blur-sm transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      onTransitionEnd={() => {
        if (!open) setRendered(false);
      }}
    >
      <div
        className={`max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-[30px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_34%),#07101f] shadow-[0_-22px_70px_rgba(34,211,238,0.18)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-atlas-signals-title"
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
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Powered by Atlas Precision Engine
            </p>
            <h2
              id="how-atlas-signals-title"
              className="mt-2 text-[24px] font-black leading-none tracking-[-0.03em] text-white"
            >
              How Atlas Signals Works
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xl font-light text-white/75 transition hover:border-cyan-300/40 hover:text-cyan-200"
            aria-label="Close How Atlas Signals Works"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-94px)] space-y-3 overflow-y-auto px-5 py-4">
          <SectionBlock title="Signal Detected">
            <p>Signal Detected identifies potential market opportunities during the day.</p>
            <p>These signals are completely free and may change as the market evolves.</p>
          </SectionBlock>

          <SectionBlock title="Top Signal" sectionRef={topSignalRef}>
            <p>Top Signal is the strongest opportunity found for a specific sport.</p>
            <p>It becomes available exactly one hour before the game begins.</p>
            <p>Top Signal is a separate daily purchase.</p>
            <p>It is NOT included in Exclusive, Premium or Elite.</p>
          </SectionBlock>

          <SectionBlock title="Top Signal">
            <p>Top Signal is the single strongest opportunity across every sport available that day.</p>
            <p>Only one Top Signal can exist.</p>
            <p>If Atlas does not find enough value, no Top Signal is released.</p>
          </SectionBlock>

          <SectionBlock title="Subscriptions">
            <div className="grid gap-2">
              <p><span className="font-bold text-white">Exclusive</span> — Top 5</p>
              <p><span className="font-bold text-white">Premium</span> — Top 3 + History + Stats</p>
              <p><span className="font-bold text-white">Elite</span> — Premium access across every available sport.</p>
              <p>Top Signal and Top Signal are always sold separately.</p>
            </div>
          </SectionBlock>

          <SectionBlock title="Timeline">
            <div className="grid gap-2">
              {timelineSteps.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-[10px] font-black text-cyan-200">
                    {index + 1}
                  </span>
                  <span className="text-sm font-bold text-white/82">{step}</span>
                  {index < timelineSteps.length - 1 ? (
                    <span className="ml-auto text-cyan-300/55">↓</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="pt-1">
              Atlas continuously evaluates the market before releasing premium signals.
            </p>
          </SectionBlock>
        </div>
      </div>
    </div>
  );
}
