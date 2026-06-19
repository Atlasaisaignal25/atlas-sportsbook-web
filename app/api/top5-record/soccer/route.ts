import { buildRecordResponse } from "../../recordUtils";

export async function GET() {
  return buildRecordResponse("soccer_top5_history");
}
