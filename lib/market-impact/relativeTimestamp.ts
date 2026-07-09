export function relativeTimestamp(value: string | Date, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = now.getTime() - date.getTime();

  if (!Number.isFinite(diffMs)) return "";
  if (diffMs < 60_000) return "Just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
