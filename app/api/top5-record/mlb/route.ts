import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("mlb_top5_history");
}
