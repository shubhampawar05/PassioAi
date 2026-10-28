import { describe, expect, it } from "vitest";
import { dayWindow, isValidTimeZone, parseIsoDate } from "../src/lib/dayWindow.js";

const hours = (w: { start: Date; end: Date }) => (w.end.getTime() - w.start.getTime()) / 3_600_000;

describe("dayWindow", () => {
  it("returns UTC midnight bounds for UTC", () => {
    const w = dayWindow("2026-10-28", "UTC");
    expect(w.start.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });

  it("shifts bounds for a negative-offset zone", () => {
    const w = dayWindow("2026-10-28", "America/New_York"); // EDT, UTC-4
    expect(w.start.toISOString()).toBe("2026-10-28T04:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-29T04:00:00.000Z");
  });

  it("includes 23:30 local time that is already the next day in UTC", () => {
    const w = dayWindow("2026-10-28", "America/New_York");
    const t = new Date("2026-10-29T03:30:00Z");
    expect(t >= w.start && t < w.end).toBe(true);
  });

  it("handles positive and half-hour offsets", () => {
    const w = dayWindow("2026-10-28", "Asia/Kolkata"); // UTC+5:30
    expect(w.start.toISOString()).toBe("2026-10-27T18:30:00.000Z");
    expect(hours(w)).toBe(24);
  });

  it("produces a 25-hour day when DST ends (US fall back)", () => {
    const w = dayWindow("2026-11-01", "America/New_York");
    expect(w.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(hours(w)).toBe(25);
  });

  it("produces a 23-hour day when DST starts (EU spring forward)", () => {
    const w = dayWindow("2026-03-29", "Europe/Berlin");
    expect(w.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(hours(w)).toBe(23);
  });

  it("rolls over month and year ends", () => {
    const w = dayWindow("2026-12-31", "UTC");
    expect(w.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects invalid input", () => {
    expect(() => dayWindow("2026-13-40", "UTC")).toThrow(RangeError);
    expect(() => dayWindow("2026-02-30", "UTC")).toThrow(RangeError);
    expect(() => dayWindow("2026-10-28", "Not/AZone")).toThrow(RangeError);
    expect(parseIsoDate("28-10-2026")).toBeNull();
    expect(isValidTimeZone("Europe/London")).toBe(true);
  });
});
