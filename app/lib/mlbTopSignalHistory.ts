import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "mlb-top-signal-history.json");

function ensureFileExists() {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
  }
}

export function readMlbTopSignalHistory(): any[] {
  try {
    ensureFileExists();

    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log("❌ Error reading MLB top signal history:", err);
    return [];
  }
}

export function saveMlbTopSignalHistory(history: any[]) {
  try {
    ensureFileExists();
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
    console.log("✅ MLB top signal history saved");
  } catch (err) {
    console.log("❌ Error saving MLB top signal history:", err);
  }
}

export function appendMlbTopSignalIfNotExists(entry: any) {
  try {
    const history = readMlbTopSignalHistory();

    const alreadyExists = history.some(
      (item) =>
        item.date === entry.date &&
        item.awayTeam === entry.awayTeam &&
        item.homeTeam === entry.homeTeam &&
        item.pick === entry.pick
    );

    if (alreadyExists) {
      console.log("ℹ️ MLB top signal already exists for this game/date");
      return history;
    }

    const updated = [...history, entry];
    saveMlbTopSignalHistory(updated);
    return updated;
  } catch (err) {
    console.log("❌ Error appending MLB top signal history:", err);
    return [];
  }
}

export function updateMlbTopSignalGrades(
  results: Array<{
    away_team: string;
    home_team: string;
    home_score: number;
    away_score: number;
  }>,
  gradePick: (entry: any, result: any) => "WIN" | "LOSS" | "PUSH" | "PENDING"
) {
  try {
    const history = readMlbTopSignalHistory();

    const updated = history.map((entry) => {
      if (
        entry.result === "WIN" ||
        entry.result === "LOSS" ||
        entry.result === "PUSH"
      ) {
        return entry;
      }

      const result = results.find(
        (r) =>
          r.away_team === entry.awayTeam &&
          r.home_team === entry.homeTeam
      );

      if (!result) {
        return entry;
      }

      const gradedResult = gradePick(
        {
          pick: entry.pick,
          market: entry.market,
        },
        result
      );

      return {
        ...entry,
        result: gradedResult,
        gradedAt: new Date().toISOString(),
        home_score: result.home_score,
        away_score: result.away_score,
      };
    });

    saveMlbTopSignalHistory(updated);
    return updated;
  } catch (err) {
    console.log("❌ Error updating MLB top signal grades:", err);
    return [];
  }
}