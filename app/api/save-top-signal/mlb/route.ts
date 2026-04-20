import { NextResponse } from "next/server";
import { appendMlbTopSignalIfNotExists } from "@/app/lib/mlbTopSignalHistory";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    appendMlbTopSignalIfNotExists(body);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error saving MLB top signal:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}