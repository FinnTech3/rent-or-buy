/**
 * The calculator's input shape and defaults, in one place so both the UI and
 * the URL codec agree on it. Dollar fields are strings (they pass through
 * `dollarsToCents` at the boundary); everything else is a number.
 */

import { dollarsToCents } from "../lib/money.js";
import type { Currency } from "../lib/money.js";
import type { Inputs } from "../lib/model.js";
import { stampDuty } from "../lib/sdlt.js";
import { PROFILES, UK_ASSUMPTIONS, resolveProfile } from "../lib/ukData.js";
import type { UkLocation, UkProfile } from "../lib/ukData.js";

export type Region = "US" | "UK";

export interface FormState {
  /** Which country's rules the engine applies (currency, purchase tax,
   *  recurring property tax, mortgage-interest relief). */
  region: Region;
  /** UK only: which market the example profiles read rent/council tax from. */
  ukLocation: UkLocation;
  /** UK only: flat annual council tax (a banded charge, not a % of value). */
  councilTaxAnnual: string;
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
  filingStatus: "single" | "married";
  stateLocalTaxAnnual: string;
  otherItemizedAnnual: string;
  pmiRatePct: number;
  horizonYears: number;
}

/** Approximate current-year federal standard deductions. The mortgage
 *  deduction only helps to the extent itemizing beats these. */
export const STANDARD_DEDUCTION: Record<FormState["filingStatus"], number> = {
  single: 15000,
  married: 30000,
};

export const DEFAULTS: FormState = {
  region: "US",
  ukLocation: "London",
  councilTaxAnnual: "0",
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
  filingStatus: "married",
  stateLocalTaxAnnual: "0",
  otherItemizedAnnual: "0",
  pmiRatePct: 0.5,
  horizonYears: 10,
};

/** Fields carried as strings; every other field is coerced to a number. */
export const STRING_KEYS: ReadonlySet<keyof FormState> = new Set([
  "region",
  "ukLocation",
  "councilTaxAnnual",
  "homePrice",
  "homeInsuranceAnnual",
  "hoaMonthly",
  "monthlyRent",
  "rentersInsuranceMonthly",
  "filingStatus",
  "stateLocalTaxAnnual",
  "otherItemizedAnnual",
]);

/** The currency the current region transacts in. */
export function currencyOf(region: Region): Currency {
  return region === "UK" ? "GBP" : "USD";
}

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
  const uk = f.region === "UK";

  // The two regimes differ in exactly three places, all of them money the
  // buyer can't get back or an ongoing charge on the home:
  //  - purchase tax: US flat closing-cost %, UK banded Stamp Duty (+ legal);
  //  - recurring property tax: US % of value, UK flat council tax;
  //  - mortgage-interest relief: US itemized deduction, UK none (abolished for
  //    owner-occupiers), so the whole SALT/standard-deduction apparatus is off.
  const closingCostsBuy = uk
    ? stampDuty(homePrice) + UK_ASSUMPTIONS.legalAndSurveyGBP * 100
    : Math.round(homePrice * (f.closingCostsBuyPct / 100));

  return {
    horizonMonths: Math.max(1, Math.round(f.horizonYears * 12)),
    inputs: {
      homePrice,
      downPayment,
      mortgageRatePct: f.mortgageRatePct,
      termYears: f.termYears,
      closingCostsBuy,
      sellingCostsPct: f.sellingCostsPct,
      propertyTaxPct: uk ? 0 : f.propertyTaxPct,
      councilTaxAnnual: uk ? centsOr(f.councilTaxAnnual, 0) : 0,
      homeInsuranceAnnual: centsOr(f.homeInsuranceAnnual, 0),
      maintenancePct: f.maintenancePct,
      hoaMonthly: centsOr(f.hoaMonthly, 0),
      homeAppreciationPct: f.homeAppreciationPct,
      monthlyRent: centsOr(f.monthlyRent, 0),
      rentGrowthPct: f.rentGrowthPct,
      rentersInsuranceMonthly: centsOr(f.rentersInsuranceMonthly, 0),
      investmentReturnPct: f.investmentReturnPct,
      inflationPct: f.inflationPct,
      // UK owner-occupiers get no mortgage-interest relief, so the deduction
      // machinery is switched off entirely rather than fed UK-shaped numbers.
      marginalTaxRatePct: uk ? 0 : f.marginalTaxRatePct,
      standardDeduction: centsOr(String(STANDARD_DEDUCTION[f.filingStatus] ?? STANDARD_DEDUCTION.married), 30000),
      otherSaltAnnual: uk ? 0 : centsOr(f.stateLocalTaxAnnual, 0),
      otherItemizedAnnual: uk ? 0 : centsOr(f.otherItemizedAnnual, 0),
      pmiRatePct: uk ? 0 : f.pmiRatePct,
    },
  };
}

/** One-click example scenarios, chosen so the verdict genuinely differs
 *  between them - the point being that the answer is a function of the
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

// ─────────────────────────── UK example profiles ──────────────────────────

/** Build a complete UK scenario from a profile and a city. Rent and council
 *  tax come from the sourced data in ukData; the macro assumptions are the
 *  shared UK defaults. Everything is real or a labelled assumption - nothing
 *  is hand-typed per profile. */
export function ukProfileForm(profile: UkProfile, location: UkLocation): FormState {
  const r = resolveProfile(profile, location);
  const a = UK_ASSUMPTIONS;
  return {
    ...DEFAULTS,
    region: "UK",
    ukLocation: location,
    homePrice: String(profile.priceGBP),
    downPaymentPct: a.downPaymentPct,
    mortgageRatePct: a.mortgageRatePct,
    termYears: a.termYears,
    sellingCostsPct: a.sellingCostsPct,
    maintenancePct: a.maintenancePct,
    homeInsuranceAnnual: String(a.buildingsInsuranceAnnualGBP),
    hoaMonthly: "0", // Leasehold service charge - user adds it if a flat.
    councilTaxAnnual: String(r.councilTaxAnnualGBP),
    homeAppreciationPct: a.homeAppreciationPct,
    monthlyRent: String(r.monthlyRentGBP),
    rentGrowthPct: a.rentGrowthPct,
    rentersInsuranceMonthly: "12",
    investmentReturnPct: a.investmentReturnPct,
    inflationPct: a.inflationPct,
    horizonYears: a.horizonYears,
  };
}

/** When the city toggle flips, re-derive the rent and council tax for the same
 *  price/profile in the new city, leaving everything the user may have edited
 *  untouched. If the current price isn't one of the profile price points, only
 *  the location label changes. */
export function rederiveForLocation(f: FormState, location: UkLocation): FormState {
  const price = Number(f.homePrice);
  const profile = PROFILES.find((p) => p.priceGBP === price);
  if (!profile) return { ...f, ukLocation: location };
  const r = resolveProfile(profile, location);
  return {
    ...f,
    ukLocation: location,
    monthlyRent: String(r.monthlyRentGBP),
    councilTaxAnnual: String(r.councilTaxAnnualGBP),
  };
}

/** The default UK scenario when someone switches the tool to UK mode: the
 *  family-home profile in London. */
export function ukDefaults(location: UkLocation = "London"): FormState {
  const family = PROFILES.find((p) => p.id === "family-home") ?? PROFILES[0]!;
  return ukProfileForm(family, location);
}
