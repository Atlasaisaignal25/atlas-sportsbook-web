import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("nba_top5_history");
}
