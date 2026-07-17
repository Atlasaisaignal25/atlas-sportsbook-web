import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeAtlasProductSignal, normalizeProductStatus } from "../app/lib/product-normalization";

const root = process.cwd();

const publicSurfaceFiles = [
  "app/page.tsx",
  "app/components/signals/SignalDetectedFeed.tsx",
  "app/components/signals/SignalsHomePage.tsx",
  "app/lib/bankroll/package-engine.ts",
];

const forbiddenPublicStatusTokens = [
  "INTERNAL_CANDIDATE",
  "CORE_PICK",
  "ENGINE_READY",
  "RAW_SIGNAL",
  "VALIDATED",
  "CONFIRMED",
  "DOWNGRADED",
  "REMOVED",
];

const forbiddenRawMappingPatterns = [
  /status:\s*g\.status/g,
  /gameId:\s*g\.game_id/g,
  /awayTeam:\s*g\.away_team/g,
  /homeTeam:\s*g\.home_team/g,
  /pick:\s*g\.pick/g,
];

const failures: string[] = [];

for (const file of publicSurfaceFiles) {
  const source = readFileSync(join(root, file), "utf8");

  for (const token of forbiddenPublicStatusTokens) {
    if (source.includes(token)) {
      failures.push(`${file} exposes or depends on forbidden public status token: ${token}`);
    }
  }

  for (const pattern of forbiddenRawMappingPatterns) {
    if (pattern.test(source)) {
      failures.push(`${file} contains raw sport-feed mapping pattern: ${pattern}`);
    }
  }
}

const sportSamples = ["MLB", "NBA", "NFL", "NHL", "SOCCER", "NCAAB", "NCAAF"];
const normalizedSamples = sportSamples.map((sport, index) =>
  normalizeAtlasProductSignal(
    {
      sport,
      game_id: `${sport.toLowerCase()}-sample`,
      away_team: "Away",
      home_team: "Home",
      pick: "Home ML",
      market: "Moneyline",
      odds: -110,
      status: index % 2 === 0 ? "INTERNAL_CANDIDATE" : "CONFIRMED",
    },
    { sport, product: "top5", index },
  ),
);

for (const sample of normalizedSamples) {
  const keys = Object.keys(sample).sort();
  const expectedKeys = [
    "awayTeam",
    "confidence",
    "eventId",
    "homeTeam",
    "internalScore",
    "isTopSignal",
    "league",
    "line",
    "market",
    "odds",
    "product",
    "rank",
    "selection",
    "signalId",
    "sport",
    "status",
    "timestamp",
  ].sort();

  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    failures.push(`${sample.sport} does not normalize to the AtlasProductSignal public key set.`);
  }

  if (sample.status !== "PENDING") {
    failures.push(`${sample.sport} leaked an internal lifecycle status instead of PENDING.`);
  }
}

const statusExpectations: Array<[string, ReturnType<typeof normalizeProductStatus>]> = [
  ["INTERNAL_CANDIDATE", "PENDING"],
  ["CORE_PICK", "PENDING"],
  ["ENGINE_READY", "PENDING"],
  ["RAW_SIGNAL", "PENDING"],
  ["VALIDATED", "PENDING"],
  ["CONFIRMED", "PENDING"],
  ["WIN", "WON"],
  ["LOST", "LOSS"],
  ["PUSH", "PUSH"],
  ["CANCELLED", "CANCELLED"],
];

for (const [input, expected] of statusExpectations) {
  const actual = normalizeProductStatus(input);
  if (actual !== expected) {
    failures.push(`normalizeProductStatus(${input}) returned ${actual}; expected ${expected}.`);
  }
}

if (failures.length > 0) {
  console.error("Product normalization architecture validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Product normalization architecture validation passed.");
