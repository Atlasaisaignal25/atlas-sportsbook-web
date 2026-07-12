export const atlasOperationalSports = ["MLB"] as const;
export const atlasSupportedSports = ["MLB", "NBA", "NFL", "NHL", "SOCCER"] as const;

export type AtlasSport = (typeof atlasSupportedSports)[number];
export type CommercialPlan = "free" | "exclusive" | "premium" | "unlimited" | "admin";
export type StoredPlanCode = "exclusive" | "premium" | "elite" | "unlimited";
export type ProductCode =
  | "signals_detected"
  | "exclusive_detected_top3"
  | "premium_sport_top5"
  | "atlas_unlimited_all_sports"
  | "top_signal_by_sport"
  | "nrfi_yrfi";

export type AtlasEntitlement = {
  plan: CommercialPlan;
  selectedSport: AtlasSport | null;
  canViewSignalsDetected: boolean;
  canViewExclusiveTop3: boolean;
  canViewOfficialTop5: boolean;
  canViewAllSports: boolean;
  canViewTopSignal: boolean;
  canViewSignalStatuses: boolean;
  sports: AtlasSport[];
  topSignalSports: AtlasSport[];
};

export const activeSubscriptionStatuses = ["active", "trialing"] as const;

export function isNewProductModelEnabled() {
  return process.env.ATLAS_NEW_PRODUCT_MODEL_ENABLED !== "false";
}

export function isSignalDeliveryV2Enabled() {
  return process.env.ATLAS_SIGNAL_DELIVERY_V2_ENABLED !== "false";
}

export const productCopy: Record<ProductCode, { name: string; description: string }> = {
  signals_detected: {
    name: "FREE",
    description: "Follow every Signal Detected across all available sports.",
  },
  exclusive_detected_top3: {
    name: "EXCLUSIVE PACK",
    description: "Top 3 ranked Signals Detected across all available sports, with live status updates.",
  },
  premium_sport_top5: {
    name: "PREMIUM PACK",
    description: "Up to 5 official ranked Atlas Signals for one selected sport.",
  },
  atlas_unlimited_all_sports: {
    name: "ATLAS UNLIMITED",
    description: "Up to 5 official ranked Atlas Signals for every available sport.",
  },
  top_signal_by_sport: {
    name: "TOP SIGNAL",
    description: "The strongest Atlas Signal of the day for your selected sport.",
  },
  nrfi_yrfi: {
    name: "NRFI/YRFI",
    description: "Specialized first-inning Signals.",
  },
};

export function normalizeAtlasSport(value: unknown): AtlasSport | null {
  const sport = String(value ?? "").trim().toUpperCase();
  return atlasSupportedSports.includes(sport as AtlasSport) ? (sport as AtlasSport) : null;
}

export function normalizeStoredPlan(value: unknown): CommercialPlan {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "elite" || normalized === "unlimited") return "unlimited";
  if (normalized === "exclusive" || normalized === "premium") return normalized;
  return "free";
}

export function storedPlanForCheckout(value: unknown): StoredPlanCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "unlimited") return "elite";
  if (normalized === "elite" || normalized === "exclusive" || normalized === "premium") {
    return normalized as StoredPlanCode;
  }
  return null;
}

export function productCodeFromPlan(plan: CommercialPlan): ProductCode | null {
  if (plan === "exclusive") return "exclusive_detected_top3";
  if (plan === "premium") return "premium_sport_top5";
  if (plan === "unlimited" || plan === "admin") return "atlas_unlimited_all_sports";
  return null;
}

export function planDisplayName(plan: CommercialPlan) {
  if (plan === "admin") return "ADMIN";
  if (plan === "unlimited") return "ATLAS UNLIMITED";
  return plan.toUpperCase();
}

export function getEntitlement(params: {
  planCode?: unknown;
  selectedSport?: unknown;
  topSignalSports?: unknown[];
  admin?: boolean;
}): AtlasEntitlement {
  if (params.admin) {
    return {
      plan: "admin",
      selectedSport: null,
      canViewSignalsDetected: true,
      canViewExclusiveTop3: true,
      canViewOfficialTop5: true,
      canViewAllSports: true,
      canViewTopSignal: true,
      canViewSignalStatuses: true,
      sports: [...atlasOperationalSports],
      topSignalSports: [...atlasOperationalSports],
    };
  }

  const plan = normalizeStoredPlan(params.planCode);
  const selectedSport = normalizeAtlasSport(params.selectedSport) ?? "MLB";
  const topSignalSports = (params.topSignalSports ?? [])
    .map(normalizeAtlasSport)
    .filter((sport): sport is AtlasSport => Boolean(sport));

  if (plan === "unlimited") {
    return {
      plan,
      selectedSport: null,
      canViewSignalsDetected: true,
      canViewExclusiveTop3: true,
      canViewOfficialTop5: true,
      canViewAllSports: true,
      canViewTopSignal: topSignalSports.length > 0,
      canViewSignalStatuses: true,
      sports: [...atlasOperationalSports],
      topSignalSports,
    };
  }

  if (plan === "premium") {
    return {
      plan,
      selectedSport,
      canViewSignalsDetected: true,
      canViewExclusiveTop3: false,
      canViewOfficialTop5: true,
      canViewAllSports: false,
      canViewTopSignal: topSignalSports.length > 0,
      canViewSignalStatuses: true,
      sports: atlasOperationalSports.includes(selectedSport as any) ? [selectedSport] : [],
      topSignalSports,
    };
  }

  if (plan === "exclusive") {
    return {
      plan,
      selectedSport: null,
      canViewSignalsDetected: true,
      canViewExclusiveTop3: true,
      canViewOfficialTop5: false,
      canViewAllSports: true,
      canViewTopSignal: topSignalSports.length > 0,
      canViewSignalStatuses: true,
      sports: [...atlasOperationalSports],
      topSignalSports,
    };
  }

  return {
    plan: "free",
    selectedSport: null,
    canViewSignalsDetected: true,
    canViewExclusiveTop3: false,
    canViewOfficialTop5: false,
    canViewAllSports: false,
    canViewTopSignal: topSignalSports.length > 0,
    canViewSignalStatuses: false,
    sports: [...atlasOperationalSports],
    topSignalSports,
  };
}

export function presentationStatus(status: unknown, product: ProductCode) {
  if (product === "top_signal_by_sport") {
    return { label: "READY", description: "Top Signal is ready." };
  }

  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "CONFIRMED") return { label: "CONFIRMED", description: "Signal confirmed." };
  if (normalized === "DOWNGRADED") return { label: "DOWNGRADED", description: "Signal conditions weakened." };
  if (normalized === "REMOVED" || normalized === "WITHDRAWN") return { label: "WITHDRAWN", description: "Signal no longer meets Atlas standards." };
  return { label: "UNDER REVIEW", description: "Atlas is still validating this Signal." };
}
