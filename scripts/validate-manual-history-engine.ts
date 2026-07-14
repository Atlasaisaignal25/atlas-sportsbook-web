import assert from "node:assert/strict";
import {
  createManualTracking,
  createTrackedPick,
  filterPicksByMembership,
  getTrackingDay,
  loadTrackingHistory,
} from "../app/lib/bankroll";
import { validationAtlasSources } from "./bankroll-validation-sources";

const now = new Date("2026-07-14T12:00:00.000Z");
const membership = {
  package: "premium" as const,
  selectedSport: "MLB" as const,
  availableSports: ["MLB" as const],
};
const picks = filterPicksByMembership(membership, now.toISOString(), validationAtlasSources);

const todayTracking = createTrackedPick(
  createManualTracking(now.toISOString(), 500),
  picks[0],
  { atlasPickId: picks[0].id, riskAmount: "$25", notes: "Today pick." },
  500,
  "2026-07-14T10:00:00.000Z",
);
const yesterdayTracking = createTrackedPick(
  todayTracking,
  picks[1],
  { atlasPickId: picks[1].id, riskAmount: "$20", notes: "Yesterday pick." },
  500,
  "2026-07-13T10:00:00.000Z",
);
const lastWeekTracking = createTrackedPick(
  yesterdayTracking,
  picks[2],
  { atlasPickId: picks[2].id, riskAmount: "$15", notes: "Last week pick." },
  500,
  "2026-07-07T10:00:00.000Z",
);

const todayHistory = loadTrackingHistory(lastWeekTracking, "today", "2026-07-14", now);
assert.equal(todayHistory.groups.length, 1);
assert.equal(todayHistory.groups[0].label, "TODAY");
assert.equal(todayHistory.groups[0].picks.length, 1);
assert.equal(todayHistory.groups[0].picks[0].pick.selection, picks[0].selection);

const yesterdayHistory = loadTrackingHistory(lastWeekTracking, "yesterday", "2026-07-14", now);
assert.equal(yesterdayHistory.groups.length, 1);
assert.equal(yesterdayHistory.groups[0].label, "YESTERDAY");
assert.equal(yesterdayHistory.groups[0].picks[0].pick.selection, picks[1].selection);

const thisWeekHistory = loadTrackingHistory(lastWeekTracking, "this_week", "2026-07-14", now);
assert.equal(thisWeekHistory.picks.length, 2);
assert.equal(thisWeekHistory.groups.map((group) => group.label).join(","), "TODAY,YESTERDAY");

const lastWeekHistory = loadTrackingHistory(lastWeekTracking, "last_week", "2026-07-14", now);
assert.equal(lastWeekHistory.picks.length, 1);
assert.equal(lastWeekHistory.groups[0].label, "LAST WEEK");

const monthHistory = loadTrackingHistory(lastWeekTracking, "this_month", "2026-07-14", now);
assert.equal(monthHistory.picks.length, 3);

const calendarDay = getTrackingDay(lastWeekTracking, "2026-07-13", now);
assert.equal(calendarDay.picks.length, 1);
assert.equal(calendarDay.picks[0].pick.selection, picks[1].selection);

const timeline = todayHistory.picks[0].timeline;
assert.equal(timeline[0].description, "Manual Pick Created");
assert.equal(timeline[1].description, "Tracking Started");
assert.equal(timeline.every((event) => event.time.length > 0), true);

const corruptDateHistory = loadTrackingHistory({
  ...lastWeekTracking,
  picks: [
    {
      ...lastWeekTracking.picks[0],
      createdAt: "not-a-date",
      updatedAt: "also-bad",
      eventDate: "",
    },
  ],
}, "all_time", "2026-07-14", now);
assert.equal(corruptDateHistory.picks.length, 1);
assert.equal(corruptDateHistory.groups[0].key, "1970-01-01");

console.log("Manual History engine validation OK");
