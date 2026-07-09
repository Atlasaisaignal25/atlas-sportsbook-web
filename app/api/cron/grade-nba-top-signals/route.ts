import { NextResponse } from "next/server";
import {
  gradePendingHistory,
  scoreKeysBySport,
  snapshotTopSignal,
} from "../historyUtils";

export async function GET() {
  try {
    const inserted = await snapshotTopSignal({
      sport: "NBA",
      liveTable: "nba_top5_live",
      historyTable: "nba_top_signal_history",
    });

    const updated = await gradePendingHistory({
      historyTable: "nba_top_signal_history",
      liveTable: "nba_top5_live",
      sport: "NBA",
      scoreKeys: scoreKeysBySport.NBA,
    });

    return NextResponse.json({ success: true, inserted, updated });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected cron error",
      },
      { status: 500 }
    );
  }
}
