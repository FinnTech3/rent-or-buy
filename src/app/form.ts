/**
 * The calculator's input shape and defaults, in one place so both the UI and
 * the URL codec agree on it. Dollar fields are strings (they pass through
 * `dollarsToCents` at the boundary); everything else is a number.
 */

export interface FormState {
  homePrice: string;
  downPaymentPct: number;
  mortgageRatePct: number;
  termYears: number;
  closingCostsBuyPct: number;
  sellingCostsPct: number;
  propertyTaxPct: number;
  homeInsuranceAnnual: string;
  maintenancePct: number;
  hoaMonthly: string;
  homeAppreciationPct: number;
  monthlyRent: string;
  rentGrowthPct: number;
  rentersInsuranceMonthly: string;
  investmentReturnPct: number;
  inflationPct: number;
  marginalTaxRatePct: number;
  pmiRatePct: number;
  horizonYears: number;
}

export const DEFAULTS: FormState = {
  homePrice: "400000",
  downPaymentPct: 20,
  mortgageRatePct: 6.5,
  termYears: 30,
  closingCostsBuyPct: 3,
  sellingCostsPct: 6,
  propertyTaxPct: 1.1,
  homeInsuranceAnnual: "1800",
  maintenancePct: 1,
  hoaMonthly: "0",
  homeAppreciationPct: 3.5,
  monthlyRent: "2200",
  rentGrowthPct: 3,
  rentersInsuranceMonthly: "15",
  investmentReturnPct: 6,
  inflationPct: 2.5,
  marginalTaxRatePct: 0,
  pmiRatePct: 0.5,
  horizonYears: 10,
};

/** Fields carried as strings; every other field is coerced to a number. */
export const STRING_KEYS: ReadonlySet<keyof FormState> = new Set([
  "homePrice",
  "homeInsuranceAnnual",
  "hoaMonthly",
  "monthlyRent",
  "rentersInsuranceMonthly",
]);
