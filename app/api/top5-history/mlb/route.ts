import { NextResponse } from "next/server";
import mlbTop5 from "@/data/mlb-top5.json";

export async function GET() {
  try {
    const data = mlbTop5 as { top5?: any[] };

    return NextResponse.json({
      success: true,
      history: Array.isArray(data.top5) ? data.top5 : [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}