/**
 * Path-based Monte Carlo — the honest completion of the uncertainty model.
 *
 * The averages-based simulation in montecarlo.ts draws one horizon-average
 * rate per driver. This one draws a *fresh return every year* and compounds
 * it month by month, so the ordering of good and bad years matters — which
 * it genuinely does here, because both parties dollar-cost-average their
 * monthly surplus into the market, and a crash early in the hold hurts a
 * portfolio that is still being fed differently from a crash late. That is
 * sequence-of-returns risk, the thing the README used to disclaim, and it is
 * exactly what a point estimate and a static band both hide.
 *
 * The deterministic parts (the mortgage schedule, taxes, insurance, PMI) are
 * mirrored from the model in ../model.ts; a test pins the two together by
 * checking that this simulator with zero volatility reproduces the model's
 * terminal number. Only the three uncertain drivers — appreciation, market
 * return, rent growth — are randomized, each with an annual volatility; the
 * √years shrinkage of the average emerges for free from summing independent
 * years rather than being imposed.
 */

import type { Inputs } from "./model.js";
import { monthlyPayment, monthlyRate } from "./mortgage.js";
import { applyRate, roundToCents } from "./money.js";
import type { Cents } from "./money.js";
import { mulberry32, normal } from "./random.js";
import type { MonteCarloResult } from "./montecarlo.js";

export interface PathOptions {
  readonly trials?: number;
  readonly seed?: number;
  readonly apprAnnualVol?: number;
  readonly investAnnualVol?: number;
  readonly rentAnnualVol?: number;
}

const annualToMonthly = (annualPct: number): number =>
  Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** One simulated future: returns the terminal buy − rent difference in cents. */
function simulatePath(
  inputs: Inputs,
  horizonMonths: number,
  rng: () => number,
  vol: { appr: number; invest: number; rent: number },
): Cents {
  const loan = Math.max(0, inputs.homePrice - inputs.downPayment);
  const termMonths = Math.round(inputs.termYears * 12);
  const payment = loan > 0 ? monthlyPayment(loan, inputs.mortgageRatePct, termMonths) : 0;
  const mRate = monthlyRate(inputs.mortgageRatePct);
  const pmiThreshold = roundToCents((inputs.homePrice / 100) * 0.8);
  const pmiMonthlyAmount = loan > 0
    ? roundToCents((loan / 100) * (inputs.pmiRatePct / 100) / 12)
    : 0;

  let renterInv: Cents = inputs.downPayment + inputs.closingCostsBuy;
  let buyerInv: Cents = 0;
  let balance: Cents = loan;
  let homeValue: Cents = inputs.homePrice;
  let rentMonthly: Cents = inputs.monthlyRent;

  // Per-year drawn rates, refreshed each January.
  let apprMonthly = 0;
  let investMonthly = 0;

  for (let t = 1; t <= horizonMonths; t++) {
    const yearIndex = Math.floor((t - 1) / 12);
    if ((t - 1) % 12 === 0) {
      const apprA = Math.max(-60, inputs.homeAppreciationPct + normal(rng) * vol.appr);
      const investA = Math.max(-60, inputs.investmentReturnPct + normal(rng) * vol.invest);
      apprMonthly = annualToMonthly(apprA);
      investMonthly = annualToMonthly(investA);
      if (yearIndex > 0) {
        const rentG = Math.max(-60, inputs.rentGrowthPct + normal(rng) * vol.rent);
        rentMonthly = roundToCents((rentMonthly / 100) * (1 + rentG / 100));
      }
    }
    const inflFactor = Math.pow(1 + inputs.inflationPct / 100, yearIndex);

    // Home value compounds month to month at this year's drawn rate.
    homeValue += applyRate(homeValue, apprMonthly);

    const withinTerm = t <= termMonths && balance > 0;
    const interest = withinTerm ? applyRate(balance, mRate) : 0;
    const mortgagePay = withinTerm ? Math.min(payment, balance + interest) : 0;
    const principalPaid = withinTerm ? mortgagePay - interest : 0;

    const propertyTax = roundToCents((homeValue / 100) * (inputs.propertyTaxPct / 100) / 12);
    const maintenance = roundToCents((homeValue / 100) * (inputs.maintenancePct / 100) / 12);
    const insurance = roundToCents((inputs.homeInsuranceAnnual / 100) * inflFactor / 12);
    const hoa = roundToCents((inputs.hoaMonthly / 100) * inflFactor);
    const taxBenefit = roundToCents((inputs.marginalTaxRatePct / 100) * ((interest + propertyTax) / 100));
    const pmi = balance > pmiThreshold ? pmiMonthlyAmount : 0;
    const buyerOutlay = mortgagePay + propertyTax + maintenance + insurance + hoa + pmi - taxBenefit;

    const rentersIns = roundToCents((inputs.rentersInsuranceMonthly / 100) * inflFactor);
    const renterOutlay = rentMonthly + rentersIns;

    renterInv += applyRate(renterInv, investMonthly);
    buyerInv += applyRate(buyerInv, investMonthly);
    if (buyerOutlay > renterOutlay) renterInv += buyerOutlay - renterOutlay;
    else if (renterOutlay > buyerOutlay) buyerInv += renterOutlay - buyerOutlay;

    balance -= principalPaid;
    if (balance < 0) balance = 0;
  }

  const saleProceeds = roundToCents((homeValue / 100) * (1 - inputs.sellingCostsPct / 100)) - balance;
  return buyerInv + saleProceeds - renterInv;
}

export function simulatePaths(
  inputs: Inputs,
  horizonMonths: number,
  options: PathOptions = {},
): MonteCarloResult {
  const trials = options.trials ?? 1000;
  const rng = mulberry32(options.seed ?? 0x9e3779b9);
  const vol = {
    appr: options.apprAnnualVol ?? 10,
    invest: options.investAnnualVol ?? 16,
    rent: options.rentAnnualVol ?? 4,
  };

  const diffs = new Array<number>(trials);
  let wins = 0;
  let sum = 0;
  for (let i = 0; i < trials; i++) {
    const d = simulatePath(inputs, horizonMonths, rng, vol);
    diffs[i] = d;
    sum += d;
    if (d >= 0) wins++;
  }
  diffs.sort((a, b) => a - b);
  const quantile = (p: number): Cents => {
    const idx = Math.min(trials - 1, Math.max(0, Math.floor(p * trials)));
    return diffs[idx] ?? 0;
  };

  return {
    trials,
    pBuyWins: wins / trials,
    median: quantile(0.5),
    p10: quantile(0.1),
    p90: quantile(0.9),
    mean: Math.round(sum / trials),
  };
}
