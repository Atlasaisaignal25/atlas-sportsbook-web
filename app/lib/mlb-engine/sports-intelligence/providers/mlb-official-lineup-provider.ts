import {
  MlbOfficialPitcherProvider,
  type MlbOfficialPitcherProviderHealth,
} from "./mlb-official-pitcher-provider";
import type { MlbOfficialClient } from "./mlb-official-client";
import {
  cachedMlbOfficialGameClient,
  type MlbOfficialGameClient,
} from "./mlb-official-game-client";
import {
  normalizeTeamLineup,
  verifyOfficialStarter,
} from "../lineup-normalizer";
import type {
  LineupStrengthFeatures,
  MlbGameContext,
  StartingPitcherFeatures,
} from "../types";
import { UnavailableMlbSportsIntelligenceProvider } from "../provider";

export type MlbOfficialLineupProviderHealth = MlbOfficialPitcherProviderHealth & {
  gamesInspected: number;
  bothLineupsConfirmed: number;
  oneLineupConfirmed: number;
  zeroLineupsConfirmed: number;
  partialLineups: number;
  probableStarters: number;
  confirmedStarters: number;
  changedStarters: number;
};

const unavailableProvider = new UnavailableMlbSportsIntelligenceProvider();

export class MlbOfficialSportsIntelligenceProvider extends MlbOfficialPitcherProvider {
  name = "MlbOfficialSportsIntelligenceProvider";
  private lineupHealth = {
    gamesInspected: 0,
    bothLineupsConfirmed: 0,
    oneLineupConfirmed: 0,
    zeroLineupsConfirmed: 0,
    partialLineups: 0,
    probableStarters: 0,
    confirmedStarters: 0,
    changedStarters: 0,
  };

  constructor(
    private readonly options: {
      enablePitcher: boolean;
      enableLineup: boolean;
      pitcherClient?: MlbOfficialClient;
      gameClient?: MlbOfficialGameClient;
    },
  ) {
    super(options.pitcherClient);
  }

  override async getStartingPitcherFeatures(context: MlbGameContext): Promise<StartingPitcherFeatures> {
    if (!this.options.enablePitcher) {
      return unavailableProvider.getStartingPitcherFeatures(context);
    }

    const features = await super.getStartingPitcherFeatures(context);
    if (!this.options.enableLineup) return features;

    try {
      const resolved = await this.resolveGame(context);
      if (!resolved.mapping.matched || !resolved.mapping.officialGameId) return features;
      const gameClient = this.options.gameClient ?? cachedMlbOfficialGameClient;
      const [feed, boxscore] = await Promise.all([
        gameClient.getLiveFeed(resolved.mapping.officialGameId),
        gameClient.getBoxscore(resolved.mapping.officialGameId),
      ]);
      const homeVerification = verifyOfficialStarter({
        team: "HOME",
        sideBoxscore: boxscore.teams?.home,
        liveFeed: feed,
      });
      const awayVerification = verifyOfficialStarter({
        team: "AWAY",
        sideBoxscore: boxscore.teams?.away,
        liveFeed: feed,
      });

      if (homeVerification.status === "MATCHED" && features.homeStarter) {
        features.homeStarter.status = "CONFIRMED";
        features.homeStarter.confirmed = true;
      }
      if (awayVerification.status === "MATCHED" && features.awayStarter) {
        features.awayStarter.status = "CONFIRMED";
        features.awayStarter.confirmed = true;
      }

      features.metadata.warnings = [
        ...(features.metadata.warnings ?? []),
        ...homeVerification.warnings,
        ...awayVerification.warnings,
      ];
    } catch (error) {
      features.metadata.warnings = [
        ...(features.metadata.warnings ?? []),
        error instanceof Error ? error.message : "Starter verification failed.",
      ];
    }

    return features;
  }

  override async getLineupStrengthFeatures(context: MlbGameContext): Promise<LineupStrengthFeatures> {
    if (!this.options.enableLineup) {
      return unavailableProvider.getLineupStrengthFeatures(context);
    }

    try {
      const resolved = await this.resolveGame(context);
      this.lineupHealth.gamesInspected += 1;
      if (!resolved.mapping.matched || !resolved.mapping.officialGameId) {
        return {
          metadata: {
            availability: "UNAVAILABLE",
            source: "MLB_OFFICIAL",
            observedAt: new Date().toISOString(),
            confidence: Math.round(resolved.mapping.confidence * 100),
            warnings: resolved.mapping.warnings,
          },
        };
      }

      const gameClient = this.options.gameClient ?? cachedMlbOfficialGameClient;
      const [feed, boxscore] = await Promise.all([
        gameClient.getLiveFeed(resolved.mapping.officialGameId),
        gameClient.getBoxscore(resolved.mapping.officialGameId),
      ]);
      const confirmedAt = feed.gameData?.datetime?.dateTime ?? new Date().toISOString();
      const homeLineup = normalizeTeamLineup({
        side: "HOME",
        team: boxscore.teams?.home,
        confirmedAt,
      });
      const awayLineup = normalizeTeamLineup({
        side: "AWAY",
        team: boxscore.teams?.away,
        confirmedAt,
      });
      const homeStarter = verifyOfficialStarter({
        team: "HOME",
        sideBoxscore: boxscore.teams?.home,
        liveFeed: feed,
      });
      const awayStarter = verifyOfficialStarter({
        team: "AWAY",
        sideBoxscore: boxscore.teams?.away,
        liveFeed: feed,
      });
      const confirmedLineups = Number(homeLineup.confirmed) + Number(awayLineup.confirmed);
      if (confirmedLineups === 2) this.lineupHealth.bothLineupsConfirmed += 1;
      else if (confirmedLineups === 1) this.lineupHealth.oneLineupConfirmed += 1;
      else this.lineupHealth.zeroLineupsConfirmed += 1;
      if (!homeLineup.battingOrderComplete || !awayLineup.battingOrderComplete) this.lineupHealth.partialLineups += 1;
      [homeStarter, awayStarter].forEach((starter) => {
        if (starter.status === "MATCHED") this.lineupHealth.confirmedStarters += 1;
        if (starter.status === "CHANGED") this.lineupHealth.changedStarters += 1;
        if (starter.status === "PROBABLE_ONLY") this.lineupHealth.probableStarters += 1;
      });

      const warnings = [
        ...homeLineup.warnings,
        ...awayLineup.warnings,
        ...homeStarter.warnings,
        ...awayStarter.warnings,
        ...(feed.gameData?.status?.detailedState?.toLowerCase().includes("postponed")
          ? ["Official game postponed."]
          : []),
      ];
      const availability =
        homeLineup.confirmed && awayLineup.confirmed
          ? "AVAILABLE"
          : homeLineup.players.length > 0 || awayLineup.players.length > 0
            ? "PARTIAL"
            : "UNAVAILABLE";

      return {
        metadata: {
          availability,
          source: "MLB_OFFICIAL",
          observedAt: new Date().toISOString(),
          updatedAt: confirmedAt,
          confidence: Math.round(resolved.mapping.confidence * 100),
          warnings,
        },
        homeConfirmed: homeLineup.confirmed,
        awayConfirmed: awayLineup.confirmed,
        homeLineup,
        awayLineup,
      };
    } catch (error) {
      return {
        metadata: {
          availability: "ERROR",
          source: "MLB_OFFICIAL",
          observedAt: new Date().toISOString(),
          warnings: [error instanceof Error ? error.message : "Official lineup provider failed."],
        },
      };
    }
  }

  override getHealth(): MlbOfficialLineupProviderHealth {
    return {
      ...super.getHealth(),
      ...this.lineupHealth,
    };
  }
}

export function getMlbOfficialSportsIntelligenceProviderWhenEnabled(flags: {
  sportsIntelligenceEnabled: boolean;
  pitcherModelEnabled: boolean;
  lineupModelEnabled: boolean;
}) {
  if (!flags.sportsIntelligenceEnabled) return unavailableProvider;
  if (!flags.pitcherModelEnabled && !flags.lineupModelEnabled) return unavailableProvider;

  return new MlbOfficialSportsIntelligenceProvider({
    enablePitcher: flags.pitcherModelEnabled,
    enableLineup: flags.lineupModelEnabled,
  });
}
