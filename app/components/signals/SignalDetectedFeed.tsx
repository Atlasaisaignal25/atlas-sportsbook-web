"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { SportCode } from "./SportSignalCard";
import { getAtlasSportDisplayName, SportLineIcon } from "./sportVisuals";

export type SignalDetectedRow = {
  id: string;
  sport: SportCode;
  matchup: string;
  pick: string;
  status: string;
  time: string;
  startTime?: string | null;
  detectedAt?: string | null;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SportFilter = "ALL" | SportCode;
type StatusFilter = "ALL" | "PENDING" | "CONFIRMED" | "REMOVED" | "DOWNGRADED";

const sportFilters: Array<{ label: string; value: SportFilter }> = [
  { label: "All", value: "ALL" },
  { label: "MLB", value: "MLB" },
  { label: "NBA", value: "NBA" },
  { label: "NFL", value: "NFL" },
  { label: "NHL", value: "NHL" },
  { label: "Soccer", value: "SOCCER" },
];

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Removed", value: "REMOVED" },
  { label: "Downgraded", value: "DOWNGRADED" },
];

const statusRank: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  DOWNGRADED: 2,
  REMOVED: 3,
};

function normalizeStatus(status: string) {
  const value = status.trim().toUpperCase();
  if (value.includes("CONFIRM") || value === "WON") return "CONFIRMED";
  if (value.includes("REMOVE")) return "REMOVED";
  if (value.includes("DOWNGRADE")) return "DOWNGRADED";
  return "PENDING";
}

function parseTimeValue(time: string) {
  const parsed = Date.parse(`2000-01-01 ${time}`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function getFilterLabel(sportFilter: SportFilter) {
  if (sportFilter === "ALL") return "All";
  if (sportFilter === "SOCCER") return "Soccer";
  return sportFilter;
}

function FilterButton({
  active,
  children,
  onClick,
  label,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] transition ${
        active
          ? "border-cyan-300/55 bg-cyan-300 text-black shadow-[0_0_18px_rgba(34,211,238,0.24)]"
          : "border-white/10 bg-white/[0.055] text-white/62 hover:border-cyan-300/25 hover:text-cyan-200"
      }`}
    >
      {children}
    </button>
  );
}

export function SignalDetectedFeed({
  rows,
  onRowOpen,
  loading = false,
  errorMessage,
  onRetry,
  initialExpanded = false,
}: {
  rows: SignalDetectedRow[];
  onRowOpen?: (row: SignalDetectedRow) => void;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filteredRows = useMemo(() => {
    return [...rows]
      .filter((row) => sportFilter === "ALL" || row.sport === sportFilter)
      .filter((row) => statusFilter === "ALL" || normalizeStatus(row.status) === statusFilter)
      .sort((a, b) => {
        const timeDiff = parseTimeValue(a.time) - parseTimeValue(b.time);
        if (timeDiff !== 0) return timeDiff;

        const statusDiff = (statusRank[normalizeStatus(a.status)] ?? 99) - (statusRank[normalizeStatus(b.status)] ?? 99);
        if (statusDiff !== 0) return statusDiff;

        const aDetected = a.detectedAt ? Date.parse(a.detectedAt) : Number.MAX_SAFE_INTEGER;
        const bDetected = b.detectedAt ? Date.parse(b.detectedAt) : Number.MAX_SAFE_INTEGER;
        if (!Number.isNaN(aDetected) && !Number.isNaN(bDetected) && aDetected !== bDetected) {
          return aDetected - bDetected;
        }

        return a.id.localeCompare(b.id);
      });
  }, [rows, sportFilter, statusFilter]);

  const visibleRows = expanded ? filteredRows : filteredRows.slice(0, 5);
  const activeFilterLabel = getFilterLabel(sportFilter);
  const countLabel = loading ? "Checking Market" : `${filteredRows.length} Signals`;

  return (
    <section className="mt-2.5 overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),rgba(255,255,255,0.028)_48%)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="shrink-0 text-[12px] font-black uppercase tracking-[0.12em] text-cyan-300">
            Signal Detected
          </p>
          <span className="truncate rounded-full bg-cyan-400/10 px-2 py-1 text-[8px] font-bold text-cyan-300">
            {activeFilterLabel} · {countLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer Signal Detected rows" : "View all Signal Detected rows"}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/8 px-2.5 py-1.5 text-[9px] font-bold text-white/76"
        >
          {expanded ? "Show Less" : "View All"}
          <ArrowIcon />
        </button>
      </div>

      {expanded && !loading && !errorMessage && rows.length > 0 ? (
        <div className="space-y-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sportFilters.map((filter) => (
              <FilterButton
                key={filter.value}
                active={sportFilter === filter.value}
                onClick={() => setSportFilter(filter.value)}
                label={`Filter Signal Detected by ${filter.label}`}
              >
                {filter.label}
              </FilterButton>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusFilters.map((filter) => (
              <FilterButton
                key={filter.value}
                active={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
                label={`Filter Signal Detected by ${filter.label} status`}
              >
                {filter.label}
              </FilterButton>
            ))}
          </div>
        </div>
      ) : null}

      <div className="divide-y divide-white/8">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`signal-skeleton-${index}`}
              className="grid min-h-[64px] w-full grid-cols-[76px_1fr_64px_42px_12px] items-center gap-2 px-3 py-2"
            >
              <span className="h-6 w-6 rounded-full bg-white/8" />
              <span className="h-2 w-7 rounded-full bg-white/8" />
              <span className="space-y-1.5">
                <span className="block h-2.5 w-28 rounded-full bg-white/8" />
                <span className="block h-2.5 w-20 rounded-full bg-cyan-300/10" />
              </span>
              <span className="h-5 rounded-[8px] bg-cyan-300/10" />
              <span className="h-2.5 rounded-full bg-white/8" />
              <span />
            </div>
          ))
        ) : errorMessage ? (
          <div className="px-4 py-7 text-center">
            <p className="text-[13px] font-black text-white">Unable to load market data.</p>
            <p className="mt-1 text-[12px] font-semibold text-white/48">Please try again.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/15"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : visibleRows.length > 0 ? visibleRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onRowOpen?.(row)}
            aria-label={`Open Signal Detected details for ${row.matchup}`}
            className="grid min-h-[64px] w-full grid-cols-[76px_1fr_64px_42px_12px] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
          >
            <span className="grid place-items-center gap-1 text-cyan-300">
              <SportLineIcon
                sport={row.sport}
                className="h-9 w-9 drop-shadow-[0_0_8px_rgba(34,211,238,0.16)]"
              />
              <span className="text-[7px] font-black uppercase text-white/72">{getAtlasSportDisplayName(row.sport)}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-white">{row.matchup}</span>
              <span className="block truncate text-[12px] font-semibold text-cyan-300">{row.pick}</span>
            </span>
            <span className="justify-self-end rounded-[8px] border border-cyan-400/25 bg-cyan-400/10 px-2 py-1.5 text-[8px] font-black uppercase text-cyan-300">
              {row.status}
            </span>
            <span className="text-right text-[10px] font-medium text-white/52">{row.time}</span>
            <span className="text-white/42">
              <ArrowIcon />
            </span>
          </button>
        )) : (
          <div className="px-4 py-7 text-center">
            <p className="text-[13px] font-black text-white">
              {rows.length === 0 ? "No signals detected yet." : "No signals match this filter."}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-white/48">
              {rows.length === 0
                ? "Atlas continues monitoring today's market."
                : "Adjust filters to continue exploring."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
