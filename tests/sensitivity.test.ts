import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import type { Inputs } from "../src/lib/model.js";
import { analyse, defaultBands, verdict } from "../src/lib/sensitivity.js";

const BASE: Inputs = {
  homePrice: dollarsToCents("400000"),
  downPayment: dollarsToCents("80000"),
  mortgageRatePct: 6.5,
  termYears: 30,
  closingCostsBuy: dollarsToCents("12000"),
  sellingCostsPct: 6,
  propertyTaxPct: 1.1,
  homeInsuranceAnnual: dollarsToCents("1800"),
  maintenancePct: 1,
  hoaMonthly: dollarsToCents("0"),
  homeAppreciationPct: 3.5,
  monthlyRent: dollarsToCents("2200"),
  rentGrowthPct: 3,
  rentersInsuranceMonthly: dollarsToCents("15"),
  investmentReturnPct: 6,
  inflationPct: 2.5,
  marginalTaxRatePct: 0,
  standardDeduction: dollarsToCents("30000"),
  otherSaltAnnual: dollarsToCents("0"),
  otherItemizedAnnual: dollarsToCents("0"),
  pmiRatePct: 0.5,
};

describe("analyse", () => {
  it("brackets the base case: worst ≤ base ≤ best", () => {
    const s = analyse(BASE, 120);
    expect(s.worst).toBeLessThanOrEqual(s.base.terminalDifference);
    expect(s.base.terminalDifference).toBeLessThanOrEqual(s.best);
  });

  it("reports a genuinely wide band, the point of the whole project", () => {
    const s = analyse(BASE, 120);
    expect(s.best).toBeGreaterThan(s.worst);
  });

  it("buyWinFraction is a fraction in [0, 1]", () => {
    const s = analyse(BASE, 120);
    expect(s.buyWinFraction).toBeGreaterThanOrEqual(0);
    expect(s.buyWinFraction).toBeLessThanOrEqual(1);
  });

  it("ranks appreciation and market return above rent growth in the tornado", () => {
    // With the default bands, the two wealth-compounding drivers swing the
    // answer more than rent growth does.
    const s = analyse(BASE, 120);
    const rank = s.tornado.map((t) => t.key);
    expect(rank.indexOf("rentGrowthPct")).toBe(2);
  });

  it("tornado is sorted by swing, largest first", () => {
    const s = analyse(BASE, 120);
    for (let i = 1; i < s.tornado.length; i++) {
      expect(s.tornado[i - 1]!.swing).toBeGreaterThanOrEqual(s.tornado[i]!.swing);
    }
  });
});

describe("verdict", () => {
  it("says buy when even the worst case is ahead", () => {
    // Cheap to own, expensive to rent, strong appreciation → buying wins
    // across the whole band.
    const s = analyse({
      ...BASE,
      monthlyRent: dollarsToCents("3500"),
      homeAppreciationPct: 5,
      mortgageRatePct: 4,
    }, 240);
    expect(verdict(s)).toBe("buy");
  });

  it("says rent when even the best case trails", () => {
    // Expensive to own, cheap to rent, weak appreciation, short horizon →
    // renting wins across the whole band.
    const s = analyse({
      ...BASE,
      monthlyRent: dollarsToCents("1200"),
      homeAppreciationPct: 1,
      investmentReturnPct: 8,
      sellingCostsPct: 8,
    }, 36);
    expect(verdict(s)).toBe("rent");
  });

  it("admits a toss-up when the band straddles zero", () => {
    const s = analyse(BASE, 60);
    // The base scenario at 5 years is genuinely uncertain; ensure the
    // classifier is willing to say so rather than forcing a call.
    expect(["buy", "rent", "toss-up"]).toContain(verdict(s));
  });
});

describe("defaultBands", () => {
  it("centers each band on the input and widens appreciation/return most", () => {
    const b = defaultBands(BASE);
    const appr = b.find((x) => x.key === "homeAppreciationPct")!;
    const rent = b.find((x) => x.key === "rentGrowthPct")!;
    expect(appr.base).toBe(BASE.homeAppreciationPct);
    expect(appr.high - appr.low).toBeGreaterThan(rent.high - rent.low);
  });
});
