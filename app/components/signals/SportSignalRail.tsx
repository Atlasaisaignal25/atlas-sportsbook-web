"use client";

import { SportCode, SportSignalCard, SportSignalViewModel } from "./SportSignalCard";

export function SportSignalRail({
  signals,
  onAction,
  onOpen,
}: {
  signals: SportSignalViewModel[];
  onAction?: (sport: SportCode) => void;
  onOpen?: (sport: SportCode) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-1.5">
      {signals.map((signal) => (
        <SportSignalCard
          key={`sport-signal-${signal.sport}`}
          signal={signal}
          onAction={onAction}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
