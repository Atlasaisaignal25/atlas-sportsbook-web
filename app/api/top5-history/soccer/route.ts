import { NextResponse } from "next/server";
import soccerTop5 from "@/data/soccer-top5.json";

export async function GET() {
  try {
    const data = soccerTop5 as { top5?: any[] };

    return NextResponse.json({
      success: true,
      history: Array.isArray(data.top5) ? data.top5 : [],
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}