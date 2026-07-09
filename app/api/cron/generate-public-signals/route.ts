import { NextResponse } from "next/server";
import {
  automationSports,
  currentHourET,
  generatePublicSignalsForSport,
} from "../automationUtils";

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
        reason: "Public signals generation only runs at 7:00 AM ET.",
      });
    }

    const results = [];

    for (const config of automationSports) {
      results.push(await generatePublicSignalsForSport(config));
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
