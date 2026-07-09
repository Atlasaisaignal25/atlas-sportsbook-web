import {
  CANDIDATE_MARKETS,
  CANDIDATE_SPORTS,
  SUPPORTED_CANDIDATE_MARKETS,
} from "./constants";
import type { CandidateMarket, CandidateSport } from "./types";
import { normalizeTeamName } from "./normalizers";

export function isCandidateSport(value: unknown): value is CandidateSport {
  return (CANDIDATE_SPORTS as readonly string[]).includes(String(value));
}

export function isCandidateMarket(value: unknown): value is CandidateMarket {
  return (CANDIDATE_MARKETS as readonly string[]).includes(String(value));
}

export function isSupportedCandidateMarket(value: unknown): value is CandidateMarket {
  return (SUPPORTED_CANDIDATE_MARKETS as readonly string[]).includes(String(value));
}

export function isGameStarted(commenceTime: unknown, now = new Date()): boolean {
  const time = new Date(String(commenceTime ?? ""));
  if (Number.isNaN(time.getTime())) return false;

  return time.getTime() <= now.getTime();
}

export function hasValidOdds(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const odds = Number(value);

  return Number.isFinite(odds) && odds !== 0;
}

export function hasValidTeams(homeTeam: unknown, awayTeam: unknown): boolean {
  const home = normalizeTeamName(homeTeam);
  const away = normalizeTeamName(awayTeam);

  return home.length > 0 && away.length > 0 && home.toLowerCase() !== away.toLowerCase();
}

export function hasValidCommenceTime(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;

  return !Number.isNaN(new Date(String(value)).getTime());
}
