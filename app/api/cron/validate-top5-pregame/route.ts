import { NextResponse } from "next/server";
import {
  automationSports,
  validatePregameTop5ForSport,
} from "../automationUtils";

export async function GET() {
  try {
    const results = [];

    for (const config of automationSports) {
      results.push(await validatePregameTop5ForSport(config));
    }

    return NextResponse.json({ success: true, results });
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
