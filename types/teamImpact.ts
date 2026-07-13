import type { PulseImpact, PulseSport } from "./marketImpact";

export type TeamImpactSport = Extract<PulseSport, "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER">;

export type TeamImpactConfidence = PulseImpact;

export type TeamImpactEventType =
  | "Starting Pitcher Change"
  | "Bullpen Change"
  | "Lineup Confirmed"
  | "Player Scratched"
  | "Player Out"
  | "Player Questionable"
  | "Player Activated"
  | "Player Placed on IL"
  | "Starting Lineup Change"
  | "Minutes Restriction"
  | "Starting QB Change"
  | "Injury Report"
  | "Starter Out"
  | "Active / Inactive List"
  | "Starting Goalie Change"
  | "Line Changes"
  | "Defense Pair Changes"
  | "Starting XI"
  | "Injury"
  | "Suspension"
  | "Formation Change";

export type TeamImpactEventStatus = "ACTIVE" | "UPDATED" | "RESOLVED";

export type TeamImpactEvent = {
  id?: string;
  sport: TeamImpactSport;
  eventId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  playerName: string | null;
  eventType: TeamImpactEventType;
  confidence: TeamImpactConfidence;
  why: string;
  impact: string;
  publishedAt: string;
  source: string;
  sourceUrl: string | null;
  status: TeamImpactEventStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type TeamImpactCaptureResult = {
  events: TeamImpactEvent[];
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  source: "gnews" | "supabase" | "unavailable";
};
