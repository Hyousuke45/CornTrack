/** Philippine peso formatting, e.g. ₱15,000 / ₱14.50 */
export function peso(amount: number, decimals?: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const fraction = decimals ?? (value % 1 !== 0 ? 2 : 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(value);
}

/** Compact peso for chart axes: ₱15k */
export function pesoCompact(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(value) >= 1000) return `₱${Math.round(value / 1000)}k`;
  return peso(value);
}

/** Today in Philippine time as YYYY-MM-DD (UTC+8). */
export function todayInPhilippines(): string {
  const now = new Date();
  const ph = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return ph.toISOString().slice(0, 10);
}

/** "2026-10-05" → "Oct 5, 2026"; falls back to the raw string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** "2026-10-05" → "Oct 5"; falls back to the raw string. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** "2026-10-31T09:15:00+00:00" → "Oct 31, 2026" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** Relative label: "2 days ago", "3 weeks ago"... */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return String(iso);
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

/** "YYYY-MM" key → "Oct 2026" label, used by the Reports trend chart. */
export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

export function monthKey(isoDate: string): string {
  return String(isoDate).slice(0, 7);
}

export function kg(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toLocaleString("en-PH")} kg`;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "F"
  );
}
