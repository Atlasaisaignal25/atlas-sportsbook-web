import { buildRecordResponse } from "../../recordUtils";

export async function GET(req: Request) {
  return buildRecordResponse("nba_top_signal_history", req);
}
