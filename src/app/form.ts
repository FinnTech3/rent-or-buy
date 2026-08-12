/**
 * The calculator's input shape and defaults, in one place so both the UI and
 * the URL codec agree on it. Dollar fields are strings (they pass through
 * `dollarsToCents` at the boundary); everything else is a number.
 */

import { dollarsToCents } from "../lib/money.js";
import type { Inputs } from "../lib/model.js";

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

/** Convert the string/number form into the engine's integer-cents Inputs.
 *  A bad dollar string falls back rather than throwing so a half-typed field
 *  never blanks the whole page. */
function centsOr(value: string, fallback: number): number {
  try {
    return dollarsToCents(value.trim() === "" ? String(fallback) : value);
  } catch {
    return fallback * 100;
  }
}

export function buildInputs(f: FormState): { inputs: Inputs; horizonMonths: number } {
  const homePrice = centsOr(f.homePrice, 0);
  const downPayment = Math.round(homePrice * (f.downPaymentPct / 100));
  const closingCostsBuy = Math.round(homePrice * (f.closingCostsBuyPct / 100));
  return {
    horizonMonths: Math.max(1, Math.round(f.horizonYears * 12)),
    inputs: {
      homePrice,
      downPayment,
      mortgageRatePct: f.mortgageRatePct,
      termYears: f.termYears,
      closingCostsBuy,
      sellingCostsPct: f.sellingCostsPct,
      propertyTaxPct: f.propertyTaxPct,
      homeInsuranceAnnual: centsOr(f.homeInsuranceAnnual, 0),
      maintenancePct: f.maintenancePct,
      hoaMonthly: centsOr(f.hoaMonthly, 0),
      homeAppreciationPct: f.homeAppreciationPct,
      monthlyRent: centsOr(f.monthlyRent, 0),
      rentGrowthPct: f.rentGrowthPct,
      rentersInsuranceMonthly: centsOr(f.rentersInsuranceMonthly, 0),
      investmentReturnPct: f.investmentReturnPct,
      inflationPct: f.inflationPct,
      marginalTaxRatePct: f.marginalTaxRatePct,
      pmiRatePct: f.pmiRatePct,
    },
  };
}

/** One-click example scenarios, chosen so the verdict genuinely differs
 *  between them — the point being that the answer is a function of the
 *  situation, not a universal "buying builds wealth" slogan. */
export interface Preset {
  readonly name: string;
  readonly form: FormState;
}

export const PRESETS: readonly Preset[] = [
  { name: "Balanced", form: DEFAULTS },
  {
    name: "High-cost metro",
    form: {
      ...DEFAULTS,
      homePrice: "950000",
      downPaymentPct: 20,
      monthlyRent: "3800",
      propertyTaxPct: 1.2,
      homeAppreciationPct: 4,
      rentGrowthPct: 3.5,
      hoaMonthly: "450",
    },
  },
  {
    name: "Low-rate era",
    form: {
      ...DEFAULTS,
      mortgageRatePct: 3,
      homeAppreciationPct: 4,
      monthlyRent: "2000",
      investmentReturnPct: 6,
    },
  },
  {
    name: "Starter home, 10% down",
    form: {
      ...DEFAULTS,
      homePrice: "280000",
      downPaymentPct: 10,
      monthlyRent: "1600",
      homeAppreciationPct: 3,
      pmiRatePct: 0.6,
    },
  },
  {
    name: "Renting looks smart",
    form: {
      ...DEFAULTS,
      homePrice: "600000",
      monthlyRent: "2100",
      homeAppreciationPct: 2,
      investmentReturnPct: 8,
      sellingCostsPct: 7,
    },
  },
];
