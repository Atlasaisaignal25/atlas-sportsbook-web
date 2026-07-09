"use client";

import type { SportCode } from "./SportSignalCard";

const atlasSportIconMap: Record<SportCode, string> = {
  MLB: "/assets/sports/atlas/baseball.png",
  NBA: "/assets/sports/atlas/basketball.png",
  NFL: "/assets/sports/atlas/football.png",
  NHL: "/assets/sports/atlas/hockey.png",
  SOCCER: "/assets/sports/atlas/soccer.png",
};

const atlasSportDisplayNameMap: Record<SportCode, string> = {
  MLB: "BASEBALL",
  NBA: "BASKETBALL",
  NFL: "FOOTBALL",
  NHL: "HOCKEY",
  SOCCER: "SOCCER",
};

export function getAtlasSportDisplayName(sport: SportCode) {
  return atlasSportDisplayNameMap[sport];
}

export function SportLineIcon({
  sport,
  className = "",
  alt,
}: {
  sport: SportCode;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={atlasSportIconMap[sport]}
      alt={alt ?? `${getAtlasSportDisplayName(sport)} icon`}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
