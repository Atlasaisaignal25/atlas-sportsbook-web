import { NextResponse } from "next/server";
import {
  automationSports,
  currentHourET,
  generateDailyTop5ForSport,
  generatePublicSignalsForSport,
} from "../automationUtils";
import { snapshotTop5, snapshotTopSignal } from "../historyUtils";

const historyTables = {
  MLB: {
    top5: "mlb_top5_history",
    topSignal: "mlb_top_signal_history",
  },
  NBA: {
    top5: "nba_top5_history",
    topSignal: "nba_top_signal_history",
  },
  NHL: {
    top5: "nhl_top5_history",
    topSignal: "nhl_top_signal_history",
  },
  SOCCER: {
    top5: "soccer_top5_history",
    topSignal: "soccer_top_signal_history",
  },
} as const;

function cronErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unexpected cron error";
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";

    if (!force && currentHourET() !== 7) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Daily Top 5 generation only runs at 7:00 AM ET.",
      });
    }

    const results = [];

    for (const config of automationSports) {
      const publicSignals = await generatePublicSignalsForSport(config);
      const generated = await generateDailyTop5ForSport(config);
      const tables = historyTables[config.sport];

      const topSignalInserted = await snapshotTopSignal({
        sport: config.sport,
        liveTable: config.liveTable,
        historyTable: tables.topSignal,
      });

      const top5Inserted = await snapshotTop5({
        sport: config.sport,
        liveTable: config.liveTable,
        historyTable: tables.top5,
      });

      results.push({
        publicSignals,
        ...generated,
        topSignalInserted,
        top5Inserted,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: cronErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
