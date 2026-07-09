import { buildRecordResponse } from "../../recordUtils";

export async function GET(req: Request) {
  return buildRecordResponse("soccer_top5_history", req);
}
