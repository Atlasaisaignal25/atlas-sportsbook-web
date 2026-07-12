const MLB_SLATE_TIME_ZONE = "America/New_York";

function etDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MLB_SLATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
  };
}

export function resolveMlbSlateDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: MLB_SLATE_TIME_ZONE });
}

export function resolveMlbSlateWindow(date = new Date()) {
  const { year, month, day } = etDateParts(date);
  const start = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    slateDate: resolveMlbSlateDate(date),
    startUtc: start.toISOString(),
    endUtc: next.toISOString(),
  };
}

export function timestampBelongsToMlbSlate(value: string | null | undefined, slateDate = resolveMlbSlateDate()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return resolveMlbSlateDate(date) === slateDate;
}

export function isFreshForMlbSlate(value: string | null | undefined, slateDate = resolveMlbSlateDate()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return resolveMlbSlateDate(date) === slateDate;
}
