import { describe, expect, it } from "vitest";
import {
  PROFILES,
  YIELDS,
  councilTaxAnnualGBP,
  impliedMonthlyRentGBP,
  resolveProfile,
  yieldFor,
} from "../src/lib/ukData.js";

describe("rent is derived from price and yield, never typed", () => {
  it("computes monthly rent as price × yield ÷ 12", () => {
    // London £600k at the sourced 5.0% gross yield → £2,500/mo.
    expect(impliedMonthlyRentGBP(600_000, 5.0)).toBe(2_500);
    // Winchester £1m at 3.2% → £2,667/mo.
    expect(impliedMonthlyRentGBP(1_000_000, 3.2)).toBe(2_667);
  });

  it("stays in the right neighbourhood of published average rents", () => {
    // Sanity check, not an input: a £600k London flat is above the London
    // average property, so its implied rent should sit above the ONS London
    // average (~£2,290) but not wildly so.
    const londonFirst = impliedMonthlyRentGBP(600_000, yieldFor("London", 600_000));
    expect(londonFirst).toBeGreaterThan(2_290);
    expect(londonFirst).toBeLessThan(3_500);
    // Winchester likewise above its ~£1,504 average.
    const winFirst = impliedMonthlyRentGBP(600_000, yieldFor("Winchester", 600_000));
    expect(winFirst).toBeGreaterThan(1_504);
    expect(winFirst).toBeLessThan(2_500);
  });

  it("prime yields compress: rent-per-pound falls as price rises", () => {
    for (const location of ["London", "Winchester"] as const) {
      const points = YIELDS[location];
      for (let i = 1; i < points.length; i++) {
        // Higher price band → lower gross yield (the whole reason a £3m home
        // doesn't rent for five times a £600k one).
        expect(points[i]!.grossYieldPct).toBeLessThan(points[i - 1]!.grossYieldPct);
      }
    }
  });

  it("London out-rents Winchester at every price point", () => {
    for (const profile of PROFILES) {
      const london = resolveProfile(profile, "London").monthlyRentGBP;
      const winchester = resolveProfile(profile, "Winchester").monthlyRentGBP;
      expect(london).toBeGreaterThan(winchester);
    }
  });
});

describe("council tax scales by the statutory band ratios", () => {
  it("Band H is exactly twice Band D", () => {
    expect(councilTaxAnnualGBP("London", "H")).toBe(2 * councilTaxAnnualGBP("London", "D"));
    expect(councilTaxAnnualGBP("Winchester", "H")).toBe(2 * councilTaxAnnualGBP("Winchester", "D"));
  });

  it("Winchester council tax runs higher than London for the same band", () => {
    // London boroughs are subsidised by business rates; Hampshire isn't. A real,
    // slightly counter-intuitive fact worth surfacing.
    expect(councilTaxAnnualGBP("Winchester", "G")).toBeGreaterThan(councilTaxAnnualGBP("London", "G"));
  });
});

describe("every profile resolves in both cities", () => {
  it("covers all six brief price points with a yield and a rent", () => {
    const prices = PROFILES.map((p) => p.priceGBP);
    expect(prices).toEqual([600_000, 850_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000]);
    for (const profile of PROFILES) {
      for (const location of ["London", "Winchester"] as const) {
        const r = resolveProfile(profile, location);
        expect(r.monthlyRentGBP).toBeGreaterThan(0);
        expect(r.grossYieldPct).toBeGreaterThan(0);
        expect(r.councilTaxAnnualGBP).toBeGreaterThan(0);
      }
    }
  });
});
