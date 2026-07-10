import type {
  OffensiveLeagueBaseline,
  OffensiveMetricKey,
  VerifiedOffensiveRollingStats,
} from "./offensive-form-engine";

type MetricSamples = Partial<Record<OffensiveMetricKey, number[]>>;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  if (!isNumber(mean) || values.length < 2) return undefined;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pushSample(samples: MetricSamples, key: OffensiveMetricKey, value: unknown) {
  if (!isNumber(value)) return;
  const current = samples[key] ?? [];
  current.push(value);
  samples[key] = current;
}

export function buildStatcastLeagueBaseline(input: {
  teamWindows: VerifiedOffensiveRollingStats[];
  asOf: string;
}): OffensiveLeagueBaseline {
  const samples: MetricSamples = {};
  let plateAppearances = 0;
  let battedBallEvents = 0;

  input.teamWindows.forEach((team) => {
    const window = team.windows.last30 ?? team.windows.last14 ?? team.windows.last7;
    if (!window) return;
    plateAppearances += window.plateAppearances ?? 0;
    battedBallEvents += window.battedBallEvents ?? 0;
    pushSample(samples, "hardHitRate", window.hardHitRate);
    pushSample(samples, "barrelRate", window.barrelRate);
    pushSample(samples, "exitVelocity", window.exitVelocity ?? window.averageExitVelocity);
    pushSample(samples, "walkRate", window.walkRate);
    pushSample(samples, "strikeoutRate", window.strikeoutRate);
    pushSample(samples, "expectedBAOnContact", window.expectedBAOnContact);
    pushSample(samples, "expectedSLGOnContact", window.expectedSLGOnContact);
    pushSample(samples, "expectedWOBAOnContact", window.expectedWOBAOnContact);
  });

  const metrics: OffensiveLeagueBaseline["metrics"] = {};
  (Object.keys(samples) as OffensiveMetricKey[]).forEach((key) => {
    const values = samples[key] ?? [];
    const mean = average(values);
    const sd = standardDeviation(values);
    if (isNumber(mean) && isNumber(sd) && sd > 0) {
      metrics[key] = { mean, standardDeviation: sd };
    }
  });

  const warnings = Object.keys(metrics).length === 0
    ? ["League baseline unavailable because source sample was insufficient."]
    : [];

  return {
    source: "BASEBALL_SAVANT",
    asOf: input.asOf,
    sampleSize: { plateAppearances, battedBallEvents },
    metrics,
    warnings,
  };
}
