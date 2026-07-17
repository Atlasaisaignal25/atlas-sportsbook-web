export type MyAtlasAccessPlan = "free" | "exclusive" | "premium" | "elite" | "unlimited" | "admin";

export type MyAtlasAccessProduct =
  | "signals_detected"
  | "exclusive_top3"
  | "premium_top3"
  | "top_signal"
  | "analytics"
  | "history";

export type MyAtlasAccessInput = {
  plan: MyAtlasAccessPlan;
  sport: string;
  userSports: readonly string[];
  product: MyAtlasAccessProduct;
};

function normalizeSport(value: string) {
  return value.trim().toUpperCase();
}

function hasSport(userSports: readonly string[], sport: string) {
  const normalizedSport = normalizeSport(sport);
  return userSports.map(normalizeSport).includes(normalizedSport);
}

export function canViewMyAtlasProduct(input: MyAtlasAccessInput) {
  if (input.plan === "admin") return true;
  if (input.plan === "unlimited" || input.plan === "elite") return true;

  if (input.plan === "free") {
    return input.product === "signals_detected";
  }

  if (input.plan === "exclusive") {
    return input.product === "exclusive_top3" && hasSport(input.userSports, input.sport);
  }

  if (input.plan === "premium") {
    return (
      (input.product === "top_signal" || input.product === "premium_top3") &&
      hasSport(input.userSports, input.sport)
    );
  }

  return false;
}

export function describeMyAtlasLockedAccess(plan: MyAtlasAccessPlan, sportLabel: string) {
  if (plan === "free") {
    return `Upgrade your membership to unlock ranked ${sportLabel} boards.`;
  }

  if (plan === "exclusive") {
    return `Your Exclusive membership only unlocks Top 3 for your selected sport.`;
  }

  if (plan === "premium") {
    return `Your Premium membership only unlocks Top Signal and Premium Top 3 for your selected sport.`;
  }

  return `This ${sportLabel} board is not available for the current membership.`;
}
