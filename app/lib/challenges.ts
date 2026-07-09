import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export type ChallengeType = "daily_streak" | "triple_play" | "mega_5";
export type ChallengeStatus = "active" | "completed" | "failed" | "expired";
export type AttemptStatus = "pending" | "won" | "lost" | "push" | "void";
export type RewardType = "premium_sport_30_days" | "elite_30_days";
type ChallengeParticipant = { userId?: string | null; guestId?: string | null };

export const challengeConfigs: Record<
  ChallengeType,
  {
    name: string;
    difficulty: string;
    description: string;
    requiredPicks: number;
    targetWins: number;
    reward: string;
  }
> = {
  daily_streak: {
    name: "Daily Streak",
    difficulty: "Starter",
    description: "Select 1 Signal Detected pick daily and build a 7-day streak.",
    requiredPicks: 1,
    targetWins: 7,
    reward: "Premium Pack free for 30 days for 1 sport.",
  },
  triple_play: {
    name: "Triple Play",
    difficulty: "Advanced",
    description: "Build a 3-pick parlay from Signal Detected and win 3 parlays in 7 days.",
    requiredPicks: 3,
    targetWins: 3,
    reward: "Premium Pack free for 30 days for 1 sport.",
  },
  mega_5: {
    name: "Mega 5",
    difficulty: "Elite",
    description: "Build a 5-pick parlay from Signal Detected and win 2 parlays in 7 days.",
    requiredPicks: 5,
    targetWins: 2,
    reward: "Premium Pack free for 30 days for 1 sport.",
  },
};

const challengeTypes = Object.keys(challengeConfigs) as ChallengeType[];
const challengeSports = ["MLB", "NBA", "NHL", "SOCCER", "NFL"] as const;
const sportTables: Record<string, { publicTable: string; top5Table: string }> = {
  MLB: { publicTable: "mlb_public_signals", top5Table: "mlb_top5_live" },
  NBA: { publicTable: "nba_public_signals", top5Table: "nba_top5_live" },
  NHL: { publicTable: "nhl_public_signals", top5Table: "nhl_top5_live" },
  SOCCER: { publicTable: "soccer_public_signals", top5Table: "soccer_top5_live" },
};

export function isChallengeType(value: unknown): value is ChallengeType {
  return challengeTypes.includes(String(value) as ChallengeType);
}

export function normalizeChallengeSport(value: unknown) {
  const sport = String(value ?? "").trim().toUpperCase();
  return challengeSports.includes(sport as any) ? sport : null;
}

export function normalizeChallengeGuestId(value: unknown) {
  const guestId = String(value ?? "").trim();
  if (/^guest_[a-zA-Z0-9-]{12,80}$/.test(guestId)) return guestId;
  return null;
}

function normalizeParticipant(participant?: string | null | ChallengeParticipant) {
  if (typeof participant === "string" || participant === null || participant === undefined) {
    return { userId: participant ?? null, guestId: null };
  }

  return {
    userId: participant.userId ?? null,
    guestId: normalizeChallengeGuestId(participant.guestId) ?? null,
  };
}

function requireParticipant(participant: ChallengeParticipant) {
  if (participant.userId) return { user_id: participant.userId, guest_id: null };
  if (participant.guestId) return { user_id: null, guest_id: participant.guestId };
  throw new Error("Challenge participant is required.");
}

function applyParticipantFilter(query: any, participant: ChallengeParticipant) {
  if (participant.userId) return query.eq("user_id", participant.userId);
  if (participant.guestId) return query.eq("guest_id", participant.guestId);
  return query.is("user_id", null).is("guest_id", null);
}

export function todayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function top5Identity(row: any) {
  const gameId = row.game_id ?? row.gameId;
  if (gameId) return `id:${String(gameId)}`;

  return [
    normalizeName(row.away_team ?? row.awayTeam),
    normalizeName(row.home_team ?? row.homeTeam),
    String(row.date ?? "").slice(0, 10),
  ]
    .filter(Boolean)
    .join("|");
}

function signalIdentity(row: any) {
  return top5Identity(row);
}

function normalizeSignalPick(row: any, sport: string) {
  const rawId = row.id ?? row.signal_id ?? row.game_id;
  const signalId = `${sport}:${String(rawId ?? `${row.away_team}-${row.home_team}-${row.pick}`)}`;

  return {
    signalId,
    sport,
    gameId: row.game_id ? String(row.game_id) : null,
    awayTeam: row.away_team ?? row.awayTeam ?? "",
    homeTeam: row.home_team ?? row.homeTeam ?? "",
    pickLabel: row.pick ?? "",
    market: row.market ?? null,
    selection: row.selection ?? row.pick ?? null,
    line: row.line ?? null,
    odds: row.odds ?? null,
    startTime: row.start_time ?? row.commence_time ?? null,
    status: row.status ?? "PENDING",
  };
}

export async function getChallengeAvailablePicks(date = todayET()) {
  const supabase = getSupabaseAdmin();
  const picks: any[] = [];

  for (const sport of Object.keys(sportTables)) {
    const config = sportTables[sport];
    const [{ data: publicRows, error: publicError }, { data: top5Rows, error: top5Error }] =
      await Promise.all([
        supabase
          .from(config.publicTable)
          .select("*")
          .eq("sport", sport)
          .eq("date", date)
          .order("start_time", { ascending: true }),
        supabase
          .from(config.top5Table)
          .select("game_id,away_team,home_team,date")
          .eq("sport", sport)
          .eq("date", date),
      ]);

    if (publicError) throw publicError;
    if (top5Error) throw top5Error;

    const top5Set = new Set((top5Rows ?? []).map(top5Identity));

    for (const row of publicRows ?? []) {
      const normalizedStatus = String(row.status ?? "PENDING").toUpperCase();
      if (normalizedStatus !== "PENDING" && normalizedStatus !== "CONFIRMED") continue;
      if (top5Set.has(signalIdentity(row))) continue;

      picks.push(normalizeSignalPick(row, sport));
    }
  }

  return picks;
}

export async function getChallengeSnapshot(participantInput?: string | null | ChallengeParticipant) {
  const supabase = getSupabaseAdmin();
  const availablePicks = await getChallengeAvailablePicks();
  const participant = normalizeParticipant(participantInput);

  if (!participant.userId && !participant.guestId) {
    return {
      authenticated: false,
      runs: [],
      attempts: [],
      rewards: [],
      availablePicks,
      configs: challengeConfigs,
    };
  }

  const runsQuery = applyParticipantFilter(
    supabase
      .from("challenge_runs")
      .select("*")
      .order("created_at", { ascending: false }),
    participant
  );
  const attemptsQuery = applyParticipantFilter(
    supabase
      .from("challenge_attempts")
      .select("*,challenge_attempt_picks(*)")
      .order("created_at", { ascending: false }),
    participant
  );
  const rewardsQuery = applyParticipantFilter(
    supabase
      .from("challenge_rewards")
      .select("*")
      .order("created_at", { ascending: false }),
    participant
  );

  const [{ data: runs, error: runsError }, { data: attempts, error: attemptsError }, { data: rewards, error: rewardsError }] =
    await Promise.all([
      runsQuery,
      attemptsQuery,
      rewardsQuery,
    ]);

  if (runsError) throw runsError;
  if (attemptsError) throw attemptsError;
  if (rewardsError) throw rewardsError;

  return {
    authenticated: Boolean(participant.userId),
    guest: Boolean(participant.guestId && !participant.userId),
    runs: runs ?? [],
    attempts: attempts ?? [],
    rewards: rewards ?? [],
    availablePicks,
    configs: challengeConfigs,
  };
}

export async function startChallenge(
  participantInput: string | ChallengeParticipant,
  challengeType: ChallengeType
) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const endsAt = addDays(now, 7).toISOString();
  const participant = normalizeParticipant(participantInput);
  const participantRow = requireParticipant(participant);

  const existingQuery = applyParticipantFilter(
    supabase
      .from("challenge_runs")
      .select("*")
      .eq("challenge_type", challengeType)
      .eq("status", "active"),
    participant
  );

  const { data: existing, error: existingError } = await existingQuery
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("challenge_runs")
    .insert([
      {
        ...participantRow,
        challenge_type: challengeType,
        status: "active",
        started_at: now.toISOString(),
        ends_at: endsAt,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createChallengeAttempt({
  userId,
  guestId,
  challengeType,
  signalIds,
}: {
  userId?: string | null;
  guestId?: string | null;
  challengeType: ChallengeType;
  signalIds: string[];
}) {
  const supabase = getSupabaseAdmin();
  const config = challengeConfigs[challengeType];
  const uniqueSignalIds = Array.from(new Set(signalIds.filter(Boolean)));
  const participant = normalizeParticipant({ userId, guestId });
  const participantRow = requireParticipant(participant);

  if (uniqueSignalIds.length !== config.requiredPicks) {
    throw new Error(`${config.name} requires ${config.requiredPicks} unique picks.`);
  }

  const run = await startChallenge(participant, challengeType);
  const today = todayET();

  const existingAttemptQuery = applyParticipantFilter(
    supabase
      .from("challenge_attempts")
      .select("id")
      .eq("challenge_type", challengeType)
      .eq("attempt_date", today),
    participant
  );

  const { data: existingAttempt, error: existingAttemptError } =
    await existingAttemptQuery.maybeSingle();

  if (existingAttemptError) throw existingAttemptError;
  if (existingAttempt) {
    throw new Error("Only one challenge attempt is allowed per day.");
  }

  const availablePicks = await getChallengeAvailablePicks(today);
  const selectedPicks = uniqueSignalIds.map((signalId) =>
    availablePicks.find((pick) => pick.signalId === signalId)
  );

  if (selectedPicks.some((pick) => !pick)) {
    throw new Error("One or more selected picks are no longer available.");
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("challenge_attempts")
    .insert([
      {
        run_id: run.id,
        ...participantRow,
        challenge_type: challengeType,
        attempt_date: today,
        status: "pending",
        result: "pending",
      },
    ])
    .select("*")
    .single();

  if (attemptError) throw attemptError;

  const rows = selectedPicks.map((pick: any) => ({
    attempt_id: attempt.id,
    signal_id: pick.signalId,
    sport: pick.sport,
    game_id: pick.gameId,
    pick_label: pick.pickLabel,
    market: pick.market,
    selection: pick.selection,
    line: pick.line,
    odds: pick.odds,
    status: "pending",
    result: "pending",
  }));

  const { error: picksError } = await supabase
    .from("challenge_attempt_picks")
    .insert(rows);

  if (picksError) throw picksError;

  return { run, attempt, picks: rows };
}

function normalizeResult(value: unknown): AttemptStatus {
  const result = String(value ?? "").trim().toUpperCase();
  if (result === "WON" || result === "WIN") return "won";
  if (result === "LOST" || result === "LOSS") return "lost";
  if (result === "PUSH") return "push";
  if (result === "VOID" || result === "REMOVED" || result === "DOWNGRADED") return "void";
  return "pending";
}

async function findSignalResult(pick: any) {
  const table = sportTables[String(pick.sport)]?.publicTable;
  if (!table) return "pending" as AttemptStatus;

  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("status,result").limit(1);

  if (pick.game_id) {
    query = query.eq("game_id", pick.game_id);
  } else {
    query = query.eq("pick", pick.pick_label);
  }

  const { data, error } = await query;
  if (error) throw error;

  const row = data?.[0];
  return normalizeResult(row?.result ?? row?.status);
}

async function updateRunProgress(challengeType: ChallengeType, runId: string) {
  const supabase = getSupabaseAdmin();
  const config = challengeConfigs[challengeType];

  const { data: attempts, error } = await supabase
    .from("challenge_attempts")
    .select("status")
    .eq("run_id", runId);

  if (error) throw error;

  const wonCount = (attempts ?? []).filter((attempt: any) => attempt.status === "won").length;
  const lostCount = (attempts ?? []).filter((attempt: any) => attempt.status === "lost").length;
  const updates: any = { updated_at: new Date().toISOString() };

  if (wonCount >= config.targetWins) {
    updates.status = "completed";
    updates.completed_at = new Date().toISOString();
  } else if (challengeType === "daily_streak" && lostCount > 0) {
    updates.status = "failed";
    updates.failed_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("challenge_runs")
    .update(updates)
    .eq("id", runId);

  if (updateError) throw updateError;
}

export async function gradePendingChallenges() {
  const supabase = getSupabaseAdmin();

  const { data: attempts, error } = await supabase
    .from("challenge_attempts")
    .select("*,challenge_attempt_picks(*)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;

  const graded = [];

  for (const attempt of attempts ?? []) {
    const picks = attempt.challenge_attempt_picks ?? [];
    const results = [];

    for (const pick of picks) {
      const result = await findSignalResult(pick);
      results.push(result);

      if (result !== "pending") {
        const { error: pickError } = await supabase
          .from("challenge_attempt_picks")
          .update({ status: result, result })
          .eq("id", pick.id);

        if (pickError) throw pickError;
      }
    }

    if (results.some((result) => result === "pending")) continue;

    const attemptStatus: AttemptStatus = results.every((result) => result === "won")
      ? "won"
      : results.some((result) => result === "lost")
      ? "lost"
      : results.some((result) => result === "push")
      ? "push"
      : "void";

    const { error: attemptError } = await supabase
      .from("challenge_attempts")
      .update({
        status: attemptStatus,
        result: attemptStatus,
        graded_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);

    if (attemptError) throw attemptError;

    await updateRunProgress(attempt.challenge_type, attempt.run_id);
    graded.push({ id: attempt.id, status: attemptStatus });
  }

  return graded;
}

export async function claimChallengeReward({
  userId,
  runId,
  sport,
}: {
  userId: string;
  runId: string;
  sport?: string | null;
}) {
  const supabase = getSupabaseAdmin();

  const { data: run, error: runError } = await supabase
    .from("challenge_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .eq("status", "completed")
    .maybeSingle();

  if (runError) throw runError;
  if (!run) throw new Error("Completed challenge run not found.");
  if (run.reward_granted) throw new Error("Reward already claimed for this challenge.");

  const rewardSport = normalizeChallengeSport(sport);
  if (!rewardSport) throw new Error("Choose a valid sport for this reward.");

  const now = new Date();
  const reward = {
    user_id: userId,
    reward_type: "premium_sport_30_days" as RewardType,
    sport: rewardSport,
    plan_code: "premium_reward",
    starts_at: now.toISOString(),
    expires_at: addDays(now, 30).toISOString(),
    status: "active",
    source_challenge: String(run.challenge_type),
  };

  const { data, error } = await supabase
    .from("challenge_rewards")
    .insert([reward])
    .select("*")
    .single();

  if (error) throw error;

  const { error: runUpdateError } = await supabase
    .from("challenge_runs")
    .update({ reward_granted: true, updated_at: new Date().toISOString() })
    .eq("id", run.id);

  if (runUpdateError) throw runUpdateError;

  return data;
}

export async function getActiveRewardAccess(userId: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("challenge_rewards")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("expires_at", { ascending: false });

  if (error) throw error;

  const rewards = data ?? [];
  const eliteReward = rewards.find((reward: any) => reward.reward_type === "elite_30_days");
  if (eliteReward) {
    return {
      plan: "elite" as const,
      sports: ["MLB", "NBA", "NHL", "SOCCER", "NFL"],
      reward: eliteReward,
    };
  }

  const premiumReward = rewards.find(
    (reward: any) => reward.reward_type === "premium_sport_30_days"
  );

  if (premiumReward) {
    const sport = normalizeChallengeSport(premiumReward.sport);
    return {
      plan: "premium" as const,
      sports: sport ? [sport] : [],
      reward: premiumReward,
    };
  }

  return null;
}
