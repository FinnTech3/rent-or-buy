import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import { project, terminal } from "../src/lib/model.js";
import type { Inputs } from "../src/lib/model.js";

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

const at = (i: Partial<Inputs>, years = 10) =>
  terminal(project({ ...BASE, ...i }, years * 12)).difference;

describe("project — shape and sanity", () => {
  it("produces a point per month with finite money", () => {
    const p = project(BASE, 120);
    expect(p.months).toHaveLength(120);
    for (const m of p.months) {
      expect(Number.isFinite(m.difference)).toBe(true);
      expect(Number.isInteger(m.buyerNetWorth)).toBe(true);
      expect(m.homeValue).toBeGreaterThan(0);
    }
  });

  it("buying then selling immediately loses money to transaction costs", () => {
    // Month 1: the buyer has paid closing costs and would owe ~6% selling
    // costs, so renting is clearly ahead.
    expect(project(BASE, 120).months[0]!.difference).toBeLessThan(0);
  });

  it("the home is worth more at the end than at the start", () => {
    const p = project(BASE, 120);
    expect(p.months[119]!.homeValue).toBeGreaterThan(BASE.homePrice);
  });

  it("the loan is smaller at the end than at the start", () => {
    const p = project(BASE, 120);
    expect(p.months[119]!.loanBalance).toBeLessThan(BASE.homePrice - BASE.downPayment);
  });

  it("finds a break-even somewhere in a normal decade", () => {
    const p = project(BASE, 120);
    expect(p.breakEvenMonth).not.toBeNull();
    expect(p.breakEvenMonth!).toBeGreaterThan(1);
    expect(p.breakEvenMonth!).toBeLessThanOrEqual(120);
  });
});

describe("project — economics move the right way", () => {
  it("faster appreciation favors buying", () => {
    expect(at({ homeAppreciationPct: 6 })).toBeGreaterThan(at({ homeAppreciationPct: 2 }));
  });

  it("a stronger market return favors renting", () => {
    expect(at({ investmentReturnPct: 9 })).toBeLessThan(at({ investmentReturnPct: 3 }));
  });

  it("higher rent favors buying", () => {
    expect(at({ monthlyRent: dollarsToCents("3000") }))
      .toBeGreaterThan(at({ monthlyRent: dollarsToCents("1600") }));
  });

  it("higher selling costs hurt buying", () => {
    expect(at({ sellingCostsPct: 9 })).toBeLessThan(at({ sellingCostsPct: 3 }));
  });

  it("a higher mortgage rate hurts buying", () => {
    expect(at({ mortgageRatePct: 8 })).toBeLessThan(at({ mortgageRatePct: 4 }));
  });

  it("a bigger down payment (less interest) helps buying at the horizon", () => {
    expect(at({ downPayment: dollarsToCents("160000") }))
      .toBeGreaterThan(at({ downPayment: dollarsToCents("40000") }));
  });

  it("the tax deduction is usually worth nothing — the standard deduction wins", () => {
    // The honest finding: for a normal married-filer scenario, itemized
    // interest + capped SALT falls short of the standard deduction, so a
    // 32% marginal rate buys exactly zero benefit.
    expect(at({ marginalTaxRatePct: 32 })).toBe(at({ marginalTaxRatePct: 0 }));
  });

  it("the deduction helps only once itemizing clears the standard deduction", () => {
    // Big loan, high SALT, and a single filer's lower standard deduction:
    // now itemizing wins and the marginal rate actually buys something.
    const heavy = {
      downPayment: dollarsToCents("40000"),
      standardDeduction: dollarsToCents("15000"),
      otherSaltAnnual: dollarsToCents("8000"),
    };
    expect(at({ ...heavy, marginalTaxRatePct: 32 }))
      .toBeGreaterThan(at({ ...heavy, marginalTaxRatePct: 0 }));
  });

  it("PMI hurts buying, and only with under-20% down", () => {
    // A 10%-down buyer pays PMI; charging it can only make buying worse.
    const lowDown = { downPayment: dollarsToCents("40000") };
    expect(at({ ...lowDown, pmiRatePct: 1 })).toBeLessThan(at({ ...lowDown, pmiRatePct: 0 }));
    // A 20%-down buyer is above the line, so PMI never applies and the rate
    // is irrelevant.
    expect(at({ pmiRatePct: 1 })).toBe(at({ pmiRatePct: 0 }));
  });

  it("once ahead, a longer horizon widens buying's lead", () => {
    // Past break-even, forced equity + leverage compound in buying's favor.
    expect(at({}, 20)).toBeGreaterThan(at({}, 12));
  });
});

describe("project — degenerate inputs stay finite", () => {
  it("all-cash purchase (no loan) works", () => {
    const p = project({ ...BASE, downPayment: BASE.homePrice }, 120);
    expect(p.months[119]!.loanBalance).toBe(0);
    expect(Number.isFinite(p.months[119]!.difference)).toBe(true);
  });

  it("zero rates everywhere do not divide by zero", () => {
    const flat = project({
      ...BASE,
      mortgageRatePct: 0,
      homeAppreciationPct: 0,
      investmentReturnPct: 0,
      rentGrowthPct: 0,
      inflationPct: 0,
    }, 120);
    expect(flat.months).toHaveLength(120);
    expect(Number.isFinite(flat.months[119]!.difference)).toBe(true);
  });
});
