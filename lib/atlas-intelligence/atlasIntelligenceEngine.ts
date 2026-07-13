import crypto from "crypto";
import { listTodayTeamImpactEvents } from "@/lib/team-impact/teamImpactRepository";
import { listTodayMarketImpactEvents } from "@/lib/market-impact/marketImpactEventsRepository";
import { insertAtlasIntelligenceEventsDeduped } from "@/lib/atlas-intelligence/atlasIntelligenceRepository";
import type { AtlasIntelligenceEvent } from "@/types/atlasIntelligenceEvent";
import type { MarketImpactEvent } from "@/types/marketImpactEvent";
import type { TeamImpactEvent } from "@/types/teamImpact";
import type { PulseImpact } from "@/types/marketImpact";

export const ATLAS_INTELLIGENCE_ENGINE_VERSION = "atlas_intelligence_v1";

function configuredWindowMinutes() {
  const parsed = Number.parseInt(process.env.ATLAS_INTELLIGENCE_WINDOW_MINUTES ?? "30", 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 1) : 30;
}

function minutesBetween(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.POSITIVE_INFINITY;
  return Math.round((endMs - startMs) / 60000);
}

function normalizeTeam(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function relatedTeams(teamEvent: TeamImpactEvent, marketEvent: MarketImpactEvent) {
  const teamTeams = [teamEvent.homeTeam, teamEvent.awayTeam].map(normalizeTeam).filter(Boolean);
  const marketTeams = [marketEvent.homeTeam, marketEvent.awayTeam].map(normalizeTeam).filter(Boolean);
  return teamTeams.some((team) => marketTeams.includes(team));
}

function confidenceForRelation(input: { minutesBetween: number; marketConfidence: PulseImpact; movementSize: number }): PulseImpact {
  if (input.minutesBetween <= 10 && input.marketConfidence === "HIGH") return "HIGH";
  if (input.minutesBetween <= 15 && input.movementSize >= 25) return "HIGH";
  if (input.minutesBetween <= 20 && input.marketConfidence !== "LOW") return "MEDIUM";
  if (input.minutesBetween <= 30 && input.movementSize >= 15) return "MEDIUM";
  return "LOW";
}

function summaryForRelation(teamEvent: TeamImpactEvent, marketEvent: MarketImpactEvent) {
  const teamType = teamEvent.eventType.replaceAll("_", " ");
  return `${teamType} was followed by a significant ${marketEvent.market} movement.`;
}

function relationshipEventId(teamEvent: TeamImpactEvent, marketEvent: MarketImpactEvent) {
  return crypto
    .createHash("sha256")
    .update([
      ATLAS_INTELLIGENCE_ENGINE_VERSION,
      teamEvent.eventId,
      marketEvent.eventId,
      teamEvent.sport,
      marketEvent.market,
    ].join("|"))
    .digest("hex")
    .slice(0, 32);
}

export async function buildAtlasIntelligenceEvents() {
  const windowMinutes = configuredWindowMinutes();
  const [teamEvents, marketEvents] = await Promise.all([
    listTodayTeamImpactEvents({ sport: "ALL", confidence: "ALL", limit: 250 }),
    listTodayMarketImpactEvents({ sport: "ALL", confidence: "ALL", limit: 250 }),
  ]);
  const insights: AtlasIntelligenceEvent[] = [];

  for (const teamEvent of teamEvents) {
    for (const marketEvent of marketEvents) {
      if (teamEvent.sport !== marketEvent.sport) continue;
      if (!relatedTeams(teamEvent, marketEvent)) continue;

      const deltaMinutes = minutesBetween(teamEvent.publishedAt, marketEvent.publishedAt);
      if (deltaMinutes < 0 || deltaMinutes > windowMinutes) continue;

      insights.push({
        sport: teamEvent.sport,
        eventId: relationshipEventId(teamEvent, marketEvent),
        relatedTeamEventId: teamEvent.eventId,
        relatedMarketEventId: marketEvent.eventId,
        insightType: "TEAM_IMPACT_TO_MARKET_IMPACT",
        confidence: confidenceForRelation({
          minutesBetween: deltaMinutes,
          marketConfidence: marketEvent.confidence,
          movementSize: marketEvent.movementSize,
        }),
        summary: summaryForRelation(teamEvent, marketEvent),
        details: {
          awayTeam: marketEvent.awayTeam || teamEvent.awayTeam,
          homeTeam: marketEvent.homeTeam || teamEvent.homeTeam,
          teamEventType: teamEvent.eventType,
          teamEventTime: teamEvent.publishedAt,
          market: marketEvent.market,
          marketMovementType: marketEvent.movementType,
          marketTime: marketEvent.publishedAt,
          movementSize: marketEvent.movementSize,
          minutesBetween: deltaMinutes,
        },
        publishedAt: marketEvent.publishedAt,
      });
    }
  }

  return insights.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function captureAtlasIntelligenceEvents() {
  const insights = await buildAtlasIntelligenceEvents();
  const storage = await insertAtlasIntelligenceEventsDeduped(insights);

  return {
    ok: storage.errors.length === 0,
    engine: ATLAS_INTELLIGENCE_ENGINE_VERSION,
    windowMinutes: configuredWindowMinutes(),
    insightsDetected: insights.length,
    insightsInserted: storage.inserted,
    insightsSkipped: storage.skipped,
    errors: storage.errors,
  };
}
