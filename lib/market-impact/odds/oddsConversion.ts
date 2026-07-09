export function americanOddsToImpliedProbability(price?: number) {
  if (price === undefined || !Number.isFinite(price) || price === 0) return undefined;
  return price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100);
}

export function impliedProbabilityDelta(previousPrice?: number, currentPrice?: number) {
  const previous = americanOddsToImpliedProbability(previousPrice);
  const current = americanOddsToImpliedProbability(currentPrice);
  if (previous === undefined || current === undefined) return undefined;
  return current - previous;
}

export function formatAmericanPrice(price?: number) {
  if (price === undefined || !Number.isFinite(price)) return "N/A";
  return price > 0 ? `+${price}` : `${price}`;
}

export function formatPoint(point?: number) {
  if (point === undefined || !Number.isFinite(point)) return undefined;
  return Number.isInteger(point) ? `${point.toFixed(0)}` : `${point}`;
}
