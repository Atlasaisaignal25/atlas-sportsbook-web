import { buildRecordResponse } from "../../recordUtils";

export async function GET(req: Request) {
  return buildRecordResponse("nhl_top5_history", req);
}
