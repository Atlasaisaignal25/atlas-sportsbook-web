import { NextResponse } from "next/server";
import { gradePendingHistory, scoreKeysBySport, snapshotTop5 } from "../historyUtils";

export async function GET() {
  try {
    const inserted = await snapshotTop5({
      sport: "NHL",
      liveTable: "nhl_top5_live",
      historyTable: "nhl_top5_history",
    });

    const updated = await gradePendingHistory({
      historyTable: "nhl_top5_history",
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
