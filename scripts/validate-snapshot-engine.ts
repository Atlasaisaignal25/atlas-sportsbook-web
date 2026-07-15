import assert from "node:assert/strict";
import {
  activateDemoMode,
  createSnapshot,
  deactivateDemoMode,
  filterPicksByMembership,
  loadLatestSnapshot,
  normalizeBankrollConfig,
  resolveSnapshotMode,
  snapshotToAtlasSources,
  type BankrollConfig,
  type MembershipContext,
} from "../app/lib/bankroll";
import { validationAtlasSources } from "./bankroll-validation-sources";

const now = "2026-07-15T12:00:00.000Z";
const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: now,
  updatedAt: now,
};
const premiumMembership: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};

const livePicks = filterPicksByMembership(premiumMembership, now, validationAtlasSources);
assert.equal(livePicks.length, 5);

const snapshot = createSnapshot(livePicks, {
  snapshotDate: "2026-07-13",
  createdAt: "2026-07-13T12:00:00.000Z",
  package: "premium",
});
assert.ok(snapshot);
assert.equal(snapshot.snapshotDate, "2026-07-13");
assert.equal(snapshot.picks.length, 5);
assert.equal(snapshot.picks[0].confidence, 92);

const liveMode = resolveSnapshotMode(livePicks, snapshot);
assert.equal(liveMode.demoModeEnabled, false);
assert.equal(liveMode.sourceLabel, "live");
assert.equal(liveMode.picks.length, 5);

const demoMode = resolveSnapshotMode([], snapshot);
assert.equal(demoMode.demoModeEnabled, true);
assert.equal(demoMode.sourceLabel, "snapshot");
assert.equal(demoMode.picks.length, 5);
assert.equal(demoMode.picks[0].id.startsWith("snapshot-2026-07-13-"), true);

const emptyMode = resolveSnapshotMode([], null);
assert.equal(emptyMode.demoModeEnabled, false);
assert.equal(emptyMode.sourceLabel, "empty");
assert.equal(emptyMode.picks.length, 0);

const snapshotSources = snapshotToAtlasSources(snapshot);
assert.equal(snapshotSources.top5.length, 5);
assert.equal(snapshotSources.signals.length, 0);

const activeConfig = activateDemoMode(baseConfig, snapshot, now);
assert.equal(activeConfig.demoModeEnabled, true);
assert.equal(activeConfig.lastSnapshotDate, "2026-07-13");
assert.equal(activeConfig.lastAtlasSnapshot?.picks.length, 5);

const inactiveConfig = deactivateDemoMode(activeConfig, snapshot, now);
assert.equal(inactiveConfig.demoModeEnabled, false);
assert.equal(inactiveConfig.lastSnapshotDate, "2026-07-13");

const normalizedConfig = normalizeBankrollConfig(activeConfig);
assert.equal(normalizedConfig.demoModeEnabled, true);
assert.equal(loadLatestSnapshot(normalizedConfig)?.snapshotDate, "2026-07-13");

console.log("validate-snapshot-engine: OK");
