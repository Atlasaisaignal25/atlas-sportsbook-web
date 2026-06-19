import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("nhl_top_signal_history");
}
