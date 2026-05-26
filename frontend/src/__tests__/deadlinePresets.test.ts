import { resolvePreset } from "@/lib/deadlinePresets";

// Inject a fixed "now" so the math is deterministic regardless of the real clock.
// Reference dates (all 2026):
//   Wed May 20  (dow 3)
//   Sat May 23  (dow 6)
//   Sun May 24  (dow 0)
//   Mon May 25  (dow 1)
const WED = new Date(2026, 4, 20);
const SAT = new Date(2026, 4, 23);
const SUN = new Date(2026, 4, 24);
const MON = new Date(2026, 4, 25);

describe("resolvePreset", () => {
  test("today returns the given day", () => {
    expect(resolvePreset("today", WED)).toBe("2026-05-20");
  });

  test("tomorrow returns +1 day", () => {
    expect(resolvePreset("tomorrow", WED)).toBe("2026-05-21");
  });

  test("none returns null (clear)", () => {
    expect(resolvePreset("none", WED)).toBeNull();
  });

  test("weekend from a weekday returns the upcoming Saturday", () => {
    expect(resolvePreset("weekend", WED)).toBe("2026-05-23");
  });

  test("weekend on Saturday returns the same Saturday", () => {
    expect(resolvePreset("weekend", SAT)).toBe("2026-05-23");
  });

  test("weekend on Sunday returns the next Saturday (6 days out)", () => {
    expect(resolvePreset("weekend", SUN)).toBe("2026-05-30");
  });

  test("next-week from a weekday returns the upcoming Monday", () => {
    expect(resolvePreset("next-week", WED)).toBe("2026-05-25");
  });

  test("next-week on Monday returns the following Monday (+7)", () => {
    expect(resolvePreset("next-week", MON)).toBe("2026-06-01");
  });

  test("next-week on Sunday returns the next day (Monday)", () => {
    expect(resolvePreset("next-week", SUN)).toBe("2026-05-25");
  });

  test("tomorrow rolls over month boundary", () => {
    expect(resolvePreset("tomorrow", new Date(2026, 4, 31))).toBe("2026-06-01");
  });
});
