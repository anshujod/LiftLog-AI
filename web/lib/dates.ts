/** `isoDate` is a plain `date` string (YYYY-MM-DD) as returned by the API, not a datetime. */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 0) return "Upcoming";
  if (diffDays < 7) return `${diffDays} days ago`;

  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;

  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) return months === 1 ? "1 month ago" : `${months} months ago`;

  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function formatAbsoluteDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
