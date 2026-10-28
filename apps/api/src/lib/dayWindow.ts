/**
 * Converts a local calendar day in an IANA timezone into a half-open UTC range
 * [start, end). Uses Intl offset resolution so DST days come out 23 or 25 hours long.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseIsoDate(date: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** Offset of `tz` from UTC at `instant`, in milliseconds (local = utc + offset). */
function tzOffsetMs(tz: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** UTC instant of local midnight for the given calendar day in `tz`. */
function localMidnightUtc(year: number, month: number, day: number, tz: string): number {
  const naive = Date.UTC(year, month - 1, day);
  const firstGuess = naive - tzOffsetMs(tz, naive);
  const corrected = naive - tzOffsetMs(tz, firstGuess);
  return corrected;
}

export function dayWindow(date: string, tz: string): { start: Date; end: Date } {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new RangeError(`Invalid date: ${date}`);
  if (!isValidTimeZone(tz)) throw new RangeError(`Invalid timezone: ${tz}`);
  const { year, month, day } = parsed;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: new Date(localMidnightUtc(year, month, day, tz)),
    end: new Date(localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz)),
  };
}
