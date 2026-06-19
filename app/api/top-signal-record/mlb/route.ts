import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("mlb_top_signal_history");
}
