import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import { project } from "../src/lib/model.js";
import type { Inputs } from "../src/lib/model.js";
import { analyse } from "../src/lib/sensitivity.js";
import { simulatePaths } from "../src/lib/montecarloPaths.js";
import { mulberry32 } from "../src/lib/random.js";

/**
 * Property-based hardening: throw hundreds of random-but-plausible scenarios
 * at the engine and assert the invariants that must hold no matter what — no
 * NaNs, money stays integer cents, the loan only ever shrinks, and the
 * derived figures stay finite. Financial code earns trust by surviving inputs
 * nobody hand-picked, not by passing a few tidy examples.
 */

const rng = mulberry32(0x5f3759df);
const pick = (lo: number, hi: number): number => lo + rng() * (hi - lo);
const pickInt = (lo: number, hi: number): number => Math.floor(pick(lo, hi + 1));

function randomScenario(): { inputs: Inputs; horizonMonths: number } {
  const homePrice = dollarsToCents(String(pickInt(80_000, 2_000_000)));
  const downPct = pick(0, 1); // 0%–100% down
  return {
    horizonMonths: pickInt(12, 360),
    inputs: {
      homePrice,
      downPayment: Math.round(homePrice * downPct),
      mortgageRatePct: pick(0, 12),
      termYears: [15, 20, 30][pickInt(0, 2)]!,
      closingCostsBuy: dollarsToCents(String(pickInt(0, 30_000))),
      sellingCostsPct: pick(0, 10),
      propertyTaxPct: pick(0, 3),
      homeInsuranceAnnual: dollarsToCents(String(pickInt(0, 6_000))),
      maintenancePct: pick(0, 3),
      hoaMonthly: dollarsToCents(String(pickInt(0, 1_500))),
      homeAppreciationPct: pick(-5, 12),
      monthlyRent: dollarsToCents(String(pickInt(500, 12_000))),
      rentGrowthPct: pick(-2, 10),
      rentersInsuranceMonthly: dollarsToCents(String(pickInt(0, 60))),
      investmentReturnPct: pick(-3, 15),
      inflationPct: pick(0, 8),
      marginalTaxRatePct: pickInt(0, 4) === 0 ? pick(10, 40) : 0,
      standardDeduction: dollarsToCents(String([15_000, 30_000][pickInt(0, 1)]!)),
      otherSaltAnnual: dollarsToCents(String(pickInt(0, 25_000))),
      otherItemizedAnnual: dollarsToCents(String(pickInt(0, 20_000))),
      pmiRatePct: pick(0, 1.5),
    },
  };
}

const isInt = (n: number): boolean => Number.isInteger(n);

describe("engine invariants over random scenarios", () => {
  it("holds across 300 fuzzed scenarios", () => {
    for (let trial = 0; trial < 300; trial++) {
      const { inputs, horizonMonths } = randomScenario();
      const proj = project(inputs, horizonMonths);
      expect(proj.months).toHaveLength(horizonMonths);

      let prevBalance = Infinity;
      for (const m of proj.months) {
        // Money is always finite integer cents.
        expect(isInt(m.buyerNetWorth) && isInt(m.renterNetWorth)).toBe(true);
        expect(isInt(m.loanBalance) && isInt(m.homeValue)).toBe(true);
        expect(Number.isFinite(m.difference)).toBe(true);
        // A home never becomes worthless or negative here.
        expect(m.homeValue).toBeGreaterThan(0);
        // The loan only ever shrinks, and never below zero.
        expect(m.loanBalance).toBeGreaterThanOrEqual(0);
        expect(m.loanBalance).toBeLessThanOrEqual(prevBalance + 1);
        prevBalance = m.loanBalance;
        // The difference is exactly buyer minus renter.
        expect(m.difference).toBe(m.buyerNetWorth - m.renterNetWorth);
      }

      // Break-even, if reported, is a real month in range.
      if (proj.breakEvenMonth !== null) {
        expect(proj.breakEvenMonth).toBeGreaterThanOrEqual(1);
        expect(proj.breakEvenMonth).toBeLessThanOrEqual(horizonMonths);
      }
    }
  });

  it("sensitivity and Monte Carlo stay well-formed on fuzzed inputs", () => {
    for (let trial = 0; trial < 60; trial++) {
      const { inputs, horizonMonths } = randomScenario();

      const s = analyse(inputs, horizonMonths);
      expect(s.worst).toBeLessThanOrEqual(s.best);
      expect(s.buyWinFraction).toBeGreaterThanOrEqual(0);
      expect(s.buyWinFraction).toBeLessThanOrEqual(1);
      for (const t of s.tornado) expect(t.swing).toBeGreaterThanOrEqual(0);

      const mc = simulatePaths(inputs, horizonMonths, { trials: 120, seed: trial });
      expect(mc.pBuyWins).toBeGreaterThanOrEqual(0);
      expect(mc.pBuyWins).toBeLessThanOrEqual(1);
      expect(mc.p10).toBeLessThanOrEqual(mc.median);
      expect(mc.median).toBeLessThanOrEqual(mc.p90);
      expect(Number.isFinite(mc.mean)).toBe(true);
    }
  });
});
