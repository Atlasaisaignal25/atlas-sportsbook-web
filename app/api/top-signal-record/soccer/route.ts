import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("soccer_top_signal_history");
}
