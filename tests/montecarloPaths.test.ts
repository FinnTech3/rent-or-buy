import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import { project, terminal } from "../src/lib/model.js";
import type { Inputs } from "../src/lib/model.js";
import { simulatePaths } from "../src/lib/montecarloPaths.js";

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

describe("simulatePaths", () => {
  it("with zero volatility reproduces the deterministic model", () => {
    // This is the correctness anchor: strip the randomness and the
    // path engine must land on the same number as project(). A small
    // tolerance covers home-value rounding done monthly here vs. once
    // in the model.
    const det = terminal(project(BASE, 120)).difference;
    const path = simulatePaths(BASE, 120, {
      trials: 1, seed: 1, apprAnnualVol: 0, investAnnualVol: 0, rentAnnualVol: 0,
    });
    expect(Math.abs(path.median - det)).toBeLessThan(dollarsToCents("1500"));
  });

  it("is deterministic for a given seed", () => {
    const a = simulatePaths(BASE, 120, { seed: 5, trials: 300 });
    const b = simulatePaths(BASE, 120, { seed: 5, trials: 300 });
    expect(a).toEqual(b);
  });

  it("returns a probability in [0,1] and ordered percentiles", () => {
    const r = simulatePaths(BASE, 120, { trials: 500 });
    expect(r.pBuyWins).toBeGreaterThanOrEqual(0);
    expect(r.pBuyWins).toBeLessThanOrEqual(1);
    expect(r.p10).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.p90);
  });

  it("produces a non-trivial spread of outcomes", () => {
    const r = simulatePaths(BASE, 120, { trials: 500 });
    expect(r.p90).toBeGreaterThan(r.p10);
  });

  it("moves the right way: buy-favorable wins often, rent-favorable rarely", () => {
    const buyFav = simulatePaths({
      ...BASE, monthlyRent: dollarsToCents("3800"), homeAppreciationPct: 5, mortgageRatePct: 4,
    }, 240, { trials: 500 });
    const rentFav = simulatePaths({
      ...BASE, monthlyRent: dollarsToCents("1300"), homeAppreciationPct: 1, investmentReturnPct: 8, sellingCostsPct: 8,
    }, 36, { trials: 500 });
    expect(buyFav.pBuyWins).toBeGreaterThan(0.75);
    expect(rentFav.pBuyWins).toBeLessThan(0.25);
  });
});
