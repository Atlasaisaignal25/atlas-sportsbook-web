import { NextResponse } from "next/server";
import {
  gradePendingHistory,
  scoreKeysBySport,
  snapshotTopSignal,
} from "../historyUtils";

export async function GET() {
  try {
    const inserted = await snapshotTopSignal({
      sport: "NHL",
      liveTable: "nhl_top5_live",
      historyTable: "nhl_top_signal_history",
    });

    const updated = await gradePendingHistory({
      historyTable: "nhl_top_signal_history",
      liveTable: "nhl_top5_live",
      sport: "NHL",
      scoreKeys: scoreKeysBySport.NHL,
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
