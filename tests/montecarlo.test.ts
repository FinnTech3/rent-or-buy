import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import type { Inputs } from "../src/lib/model.js";
import { simulate } from "../src/lib/montecarlo.js";

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
  pmiRatePct: 0.5,
};

describe("simulate", () => {
  it("is deterministic for a given seed", () => {
    const a = simulate(BASE, 120, { seed: 42, trials: 400 });
    const b = simulate(BASE, 120, { seed: 42, trials: 400 });
    expect(a).toEqual(b);
  });

  it("returns a probability in [0, 1] and ordered percentiles", () => {
    const r = simulate(BASE, 120, { trials: 500 });
    expect(r.pBuyWins).toBeGreaterThanOrEqual(0);
    expect(r.pBuyWins).toBeLessThanOrEqual(1);
    expect(r.p10).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.p90);
  });

  it("a strongly buy-favorable scenario wins most of the time", () => {
    const r = simulate({
      ...BASE,
      monthlyRent: dollarsToCents("3800"),
      homeAppreciationPct: 5,
      mortgageRatePct: 4,
    }, 240, { trials: 600 });
    expect(r.pBuyWins).toBeGreaterThan(0.8);
  });

  it("a strongly rent-favorable scenario loses most of the time", () => {
    const r = simulate({
      ...BASE,
      monthlyRent: dollarsToCents("1300"),
      homeAppreciationPct: 1,
      investmentReturnPct: 8,
      sellingCostsPct: 8,
    }, 36, { trials: 600 });
    expect(r.pBuyWins).toBeLessThan(0.2);
  });

  it("uncertainty (the 10–90 spread) narrows with a longer horizon", () => {
    const short = simulate(BASE, 36, { seed: 7, trials: 600 });
    const long = simulate(BASE, 300, { seed: 7, trials: 600 });
    // Per dollar-year the spread should be tighter far out; compare the raw
    // spread scaled by years to reflect the √years shrinkage in the average.
    const shortSpreadPerYear = (short.p90 - short.p10) / 3;
    const longSpreadPerYear = (long.p90 - long.p10) / 25;
    expect(longSpreadPerYear).toBeLessThan(shortSpreadPerYear);
  });
});
