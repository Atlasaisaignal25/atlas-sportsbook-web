import { buildRecordResponse } from "../../recordUtils";

export async function GET(req: Request) {
  return buildRecordResponse("mlb_top5_history", req);
}
