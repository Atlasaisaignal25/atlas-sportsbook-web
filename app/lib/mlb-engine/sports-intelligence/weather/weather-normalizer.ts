const CARDINAL_TO_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export function round(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseWindSpeed(value: string | undefined) {
  const warnings: string[] = [];
  if (!value) return { warnings: ["Wind speed missing."] };
  const lower = value.trim().toLowerCase();
  if (lower === "calm") return { windSpeedMph: 0, warnings };
  const gustMatch = lower.match(/gusts?\s+(?:as high as\s+)?(\d+)/);
  const numbers = Array.from(lower.matchAll(/(\d+)/g)).map((match) => Number(match[1])).filter(Number.isFinite);
  if (numbers.length === 0) {
    warnings.push(`Unable to parse NWS wind speed: ${value}`);
    return { warnings };
  }
  const sustained = lower.includes(" to ") && numbers.length >= 2 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
  return {
    windSpeedMph: round(sustained, 1),
    windGustMph: gustMatch ? Number(gustMatch[1]) : undefined,
    sourceText: value,
    warnings,
  };
}

export function normalizeWindDirection(cardinal: string | undefined) {
  if (!cardinal) return { warnings: ["Wind direction missing."] };
  const normalized = cardinal.trim().toUpperCase();
  const degrees = CARDINAL_TO_DEGREES[normalized];
  return {
    windDirectionCardinal: normalized,
    windDirectionDegrees: degrees,
    warnings: degrees === undefined ? [`Unknown wind direction cardinal: ${cardinal}`] : [],
  };
}

export function minutesBetween(a: string, b: string) {
  const first = new Date(a).getTime();
  const second = new Date(b).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.POSITIVE_INFINITY;
  return Math.round((first - second) / 60000);
}

export function absoluteMinutesBetween(a: string, b: string) {
  return Math.abs(minutesBetween(a, b));
}

export function localIso(value: string, timeZone?: string) {
  if (!timeZone) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(" ", "T");
}

