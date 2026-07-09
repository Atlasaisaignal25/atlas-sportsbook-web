import { NextResponse } from "next/server";
import {
  gradePendingHistory,
  scoreKeysBySport,
  snapshotTopSignal,
} from "../historyUtils";

export async function GET() {
  try {
    const inserted = await snapshotTopSignal({
      sport: "MLB",
      liveTable: "mlb_top5_live",
      historyTable: "mlb_top_signal_history",
    });

    const updated = await gradePendingHistory({
      historyTable: "mlb_top_signal_history",
      liveTable: "mlb_top5_live",
      sport: "MLB",
      scoreKeys: scoreKeysBySport.MLB,
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
