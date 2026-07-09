const publisherScores: Record<string, number> = {
  "mlb.com": 100,
  mlb: 100,
  espn: 98,
  "nbc sports": 95,
  cbs: 94,
  "cbs sports": 94,
  yahoo: 90,
  "yahoo sports": 90,
  "the athletic": 96,
  "ap news": 93,
  "associated press": 93,
  rotoworld: 91,
  "heavy.": 78,
  heavy: 78,
};

export function scorePublisher(source?: string) {
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return 70;

  const exact = publisherScores[normalized];
  if (exact) return exact;

  const match = Object.entries(publisherScores).find(([name]) => normalized.includes(name));
  return match?.[1] ?? 70;
}
