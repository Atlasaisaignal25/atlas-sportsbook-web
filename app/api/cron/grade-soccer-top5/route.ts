import { NextResponse } from "next/server";
import { gradePendingHistory, scoreKeysBySport, snapshotTop5 } from "../historyUtils";

export async function GET() {
  try {
    const inserted = await snapshotTop5({
      sport: "SOCCER",
      liveTable: "soccer_top5_live",
      historyTable: "soccer_top5_history",
    });

    const updated = await gradePendingHistory({
      historyTable: "soccer_top5_history",
      scoreKeys: scoreKeysBySport.SOCCER,
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
