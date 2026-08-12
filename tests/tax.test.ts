import { describe, expect, it } from "vitest";
import { dollarsToCents, formatUSD } from "../src/lib/money.js";
import { SALT_CAP, monthlyTaxBenefit } from "../src/lib/model.js";
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
  marginalTaxRatePct: 32,
  standardDeduction: dollarsToCents("30000"),
  otherSaltAnnual: dollarsToCents("0"),
  otherItemizedAnnual: dollarsToCents("0"),
  pmiRatePct: 0.5,
};

// A representative early-loan month: ~$1,700 interest, ~$370 property tax.
const interest = dollarsToCents("1700");
const propertyTax = dollarsToCents("370");

describe("monthlyTaxBenefit", () => {
  it("is zero when the marginal rate is zero", () => {
    expect(monthlyTaxBenefit({ ...BASE, marginalTaxRatePct: 0 }, interest, propertyTax)).toBe(0);
  });

  it("is zero when the standard deduction beats itemizing", () => {
    // ~$20.4k interest + ~$4.4k SALT = ~$24.8k < $30k standard → no benefit,
    // even at a 32% marginal rate.
    expect(monthlyTaxBenefit(BASE, interest, propertyTax)).toBe(0);
  });

  it("kicks in once itemizing clears the standard deduction", () => {
    const single = { ...BASE, standardDeduction: dollarsToCents("15000") };
    expect(monthlyTaxBenefit(single, interest, propertyTax)).toBeGreaterThan(0);
  });

  it("caps state-and-local taxes at the SALT limit", () => {
    // Property tax alone already exceeds the cap here; piling on state tax
    // must not increase the deductible SALT further.
    const bigTax = { ...BASE, standardDeduction: dollarsToCents("15000") };
    const withoutState = monthlyTaxBenefit(
      { ...bigTax, propertyTaxPct: 0 }, interest, dollarsToCents("1200"), // $14.4k/yr property tax > $10k cap
    );
    const withState = monthlyTaxBenefit(
      { ...bigTax, otherSaltAnnual: dollarsToCents("20000") }, interest, dollarsToCents("1200"),
    );
    expect(withState).toBe(withoutState);
  });

  it("the SALT cap is $10,000", () => {
    expect(formatUSD(SALT_CAP)).toBe("$10,000.00");
  });
});
