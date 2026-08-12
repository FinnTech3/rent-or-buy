/**
 * The buy-vs-rent net-worth model.
 *
 * The dishonest version of this calculator compares a mortgage payment to a
 * rent cheque and declares a winner. That is not the decision. The decision
 * is: which path leaves you wealthier at the moment you'd sell, once you
 * account for the money the buyer sinks into a down payment (which the renter
 * gets to invest), the transaction costs on both ends, and the fact that the
 * cheaper-each-month party can invest the difference.
 *
 * So both sides are put on identical cash-flow footing. Each month, whoever
 * spends less on housing invests the surplus at the same market return; the
 * renter additionally invests, from day one, the down payment and closing
 * costs the buyer had to sink. At any horizon the buyer could sell, we net
 * their home equity (after selling costs and the remaining loan) against
 * their side investments, and compare to the renter's portfolio. The output
 * is the difference at every horizon — which is what makes the break-even
 * point fall out of a single pass rather than a guess.
 *
 * Conventions, stated because they change the answer:
 *  - Home value and the investment portfolios compound monthly at the
 *    month-equivalent of the annual rate, so annual figures are exact.
 *  - Rent, property tax, maintenance, insurance and HOA step once a year,
 *    the way real leases and assessments do — not smoothly.
 *  - Property tax and maintenance are a percentage of the *current* home
 *    value; insurance and HOA grow with general inflation.
 *  - The optional tax benefit is a simple marginal-rate deduction on
 *    mortgage interest plus property tax. It deliberately ignores the SALT
 *    cap and the standard-deduction crossover — see the README limitation —
 *    and defaults to off so the base case never flatters buying.
 */

import { applyRate, roundToCents } from "./money.js";
import type { Cents } from "./money.js";
import { monthlyPayment, monthlyRate } from "./mortgage.js";

export interface Inputs {
  readonly homePrice: Cents;
  readonly downPayment: Cents;
  readonly mortgageRatePct: number;
  readonly termYears: number;
  /** Buyer's one-time closing costs (sunk; not recoverable as equity). */
  readonly closingCostsBuy: Cents;
  /** Selling costs as a percentage of the eventual sale price. */
  readonly sellingCostsPct: number;

  /** Annual property tax as a percentage of current home value. */
  readonly propertyTaxPct: number;
  /** First-year homeowner's insurance; grows with inflation. */
  readonly homeInsuranceAnnual: Cents;
  /** Annual maintenance as a percentage of current home value. */
  readonly maintenancePct: number;
  /** First-year monthly HOA; grows with inflation. */
  readonly hoaMonthly: Cents;
  readonly homeAppreciationPct: number;

  readonly monthlyRent: Cents;
  readonly rentGrowthPct: number;
  readonly rentersInsuranceMonthly: Cents;

  /** Return on invested surplus / opportunity cost of the down payment. */
  readonly investmentReturnPct: number;
  /** Drives insurance and HOA growth. */
  readonly inflationPct: number;
  /** Marginal rate applied to the *incremental* itemized benefit over the
   *  standard deduction. 0 models no deduction at all. */
  readonly marginalTaxRatePct: number;
  /** Federal standard deduction for the household. The mortgage-interest /
   *  SALT write-off is only worth anything to the extent itemizing beats
   *  this — which, post-2018, it usually doesn't. */
  readonly standardDeduction: Cents;
  /** State/local income (and other) taxes that share the $10k SALT cap with
   *  property tax. */
  readonly otherSaltAnnual: Cents;
  /** Other itemizable deductions (charitable, etc.) the household already
   *  has, which help clear the standard-deduction bar. */
  readonly otherItemizedAnnual: Cents;
  /** Annual PMI as a percentage of the original loan, charged while the
   *  balance sits above 80% of the original price (i.e. when the down
   *  payment was under 20%). 0 disables it. */
  readonly pmiRatePct: number;
}

/** The federal cap on deductible state and local taxes (property + income),
 *  in cents. The single biggest reason the mortgage deduction is worth far
 *  less than folk wisdom assumes. */
export const SALT_CAP: Cents = 1_000_000;

/**
 * The honest monthly value of the mortgage-interest + SALT deduction: the
 * marginal rate applied only to the amount by which itemizing *beats* the
 * standard deduction. Property tax and other state/local taxes are capped at
 * the SALT limit first. Interest is annualized from the month (a fine
 * approximation as it declines slowly within a year). Returns 0 — as it
 * usually should post-2018 — whenever the standard deduction already wins.
 */
export function monthlyTaxBenefit(
  inputs: Inputs, monthlyInterest: Cents, monthlyPropertyTax: Cents,
): Cents {
  if (inputs.marginalTaxRatePct <= 0) return 0;
  const saltDeductible = Math.min(SALT_CAP, monthlyPropertyTax * 12 + inputs.otherSaltAnnual);
  const itemizable = monthlyInterest * 12 + saltDeductible + inputs.otherItemizedAnnual;
  const excess = Math.max(0, itemizable - inputs.standardDeduction);
  return roundToCents((inputs.marginalTaxRatePct / 100) * (excess / 100) / 12);
}

export interface MonthPoint {
  readonly month: number;
  readonly homeValue: Cents;
  readonly loanBalance: Cents;
  /** Buyer's all-in housing outlay this month (net of any tax benefit). */
  readonly buyerOutlay: Cents;
  readonly renterOutlay: Cents;
  /** Buyer's side-investment portfolio (surplus when buying is cheaper). */
  readonly buyerInvestments: Cents;
  readonly renterInvestments: Cents;
  /** Net worth if the buyer sold at the end of this month. */
  readonly buyerNetWorth: Cents;
  readonly renterNetWorth: Cents;
  /** buyerNetWorth − renterNetWorth. Positive → buying is ahead. */
  readonly difference: Cents;
}

export interface Projection {
  readonly months: readonly MonthPoint[];
  /** First month at which buying pulls ahead and stays ahead through the
   *  end of the projection, or null if it never does. */
  readonly breakEvenMonth: number | null;
}

const annualToMonthly = (annualPct: number): number =>
  Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/**
 * Project both paths month by month out to `horizonMonths`. Every month's
 * point already contains the net worth each side would have if the buyer
 * sold then, so the break-even horizon is read off the series rather than
 * recomputed.
 */
export function project(inputs: Inputs, horizonMonths: number): Projection {
  if (horizonMonths <= 0) throw new Error(`horizon must be positive`);
  const loan = Math.max(0, inputs.homePrice - inputs.downPayment);
  const termMonths = Math.round(inputs.termYears * 12);
  const payment = loan > 0 ? monthlyPayment(loan, inputs.mortgageRatePct, termMonths) : 0;
  const mRate = monthlyRate(inputs.mortgageRatePct);

  const apprMonthly = annualToMonthly(inputs.homeAppreciationPct);
  const investMonthly = annualToMonthly(inputs.investmentReturnPct);
  const homePriceDollars = inputs.homePrice / 100;

  // PMI is charged monthly on the original loan while the balance is above
  // 80% of the original price — i.e. only when the down payment was under
  // 20%, and only until amortization (or a lump payment) crosses that line.
  const pmiThreshold = roundToCents(homePriceDollars * 0.8);
  const pmiMonthlyAmount = loan > 0
    ? roundToCents((loan / 100) * (inputs.pmiRatePct / 100) / 12)
    : 0;

  // The renter invests, from day one, exactly the cash the buyer sinks and
  // cannot get back: the down payment plus the buyer's closing costs.
  let renterInv: Cents = inputs.downPayment + inputs.closingCostsBuy;
  let buyerInv: Cents = 0;
  let balance: Cents = loan;

  const months: MonthPoint[] = [];

  for (let t = 1; t <= horizonMonths; t++) {
    const yearIndex = Math.floor((t - 1) / 12);
    const inflFactor = Math.pow(1 + inputs.inflationPct / 100, yearIndex);
    const rentFactor = Math.pow(1 + inputs.rentGrowthPct / 100, yearIndex);

    const homeValue = roundToCents(homePriceDollars * Math.pow(1 + apprMonthly, t));

    // Mortgage: interest on the running balance, then the rest is principal.
    const withinTerm = t <= termMonths && balance > 0;
    const mortgagePay = withinTerm ? Math.min(payment, balance + applyRate(balance, mRate)) : 0;
    const interest = withinTerm ? applyRate(balance, mRate) : 0;
    const principalPaid = withinTerm ? mortgagePay - interest : 0;

    const propertyTax = roundToCents((homeValue / 100) * (inputs.propertyTaxPct / 100) / 12);
    const maintenance = roundToCents((homeValue / 100) * (inputs.maintenancePct / 100) / 12);
    const insurance = roundToCents((inputs.homeInsuranceAnnual / 100) * inflFactor / 12);
    const hoa = roundToCents((inputs.hoaMonthly / 100) * inflFactor);
    const taxBenefit = monthlyTaxBenefit(inputs, interest, propertyTax);

    const pmi = balance > pmiThreshold ? pmiMonthlyAmount : 0;
    const buyerOutlay = mortgagePay + propertyTax + maintenance + insurance + hoa + pmi - taxBenefit;

    const rent = roundToCents((inputs.monthlyRent / 100) * rentFactor);
    const rentersIns = roundToCents((inputs.rentersInsuranceMonthly / 100) * inflFactor);
    const renterOutlay = rent + rentersIns;

    // Both portfolios earn the market return; the month's cheaper party
    // invests the surplus so the two paths stay cash-flow equivalent.
    renterInv += applyRate(renterInv, investMonthly);
    buyerInv += applyRate(buyerInv, investMonthly);
    if (buyerOutlay > renterOutlay) renterInv += buyerOutlay - renterOutlay;
    else if (renterOutlay > buyerOutlay) buyerInv += renterOutlay - buyerOutlay;

    balance -= principalPaid;
    if (balance < 0) balance = 0;

    const saleProceeds = roundToCents((homeValue / 100) * (1 - inputs.sellingCostsPct / 100)) - balance;
    const buyerNetWorth = buyerInv + saleProceeds;
    const renterNetWorth = renterInv;

    months.push({
      month: t,
      homeValue,
      loanBalance: balance,
      buyerOutlay,
      renterOutlay,
      buyerInvestments: buyerInv,
      renterInvestments: renterInv,
      buyerNetWorth,
      renterNetWorth,
      difference: buyerNetWorth - renterNetWorth,
    });
  }

  return { months, breakEvenMonth: findBreakEven(months) };
}

/** The first month after which buying is ahead for the rest of the
 *  projection. Requiring it to *stay* ahead avoids reporting a fleeting
 *  early crossing that a later rent spike or sale-cost drag reverses. */
function findBreakEven(months: readonly MonthPoint[]): number | null {
  let candidate: number | null = null;
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i]!.difference >= 0) candidate = months[i]!.month;
    else break;
  }
  return candidate;
}

/** Convenience: the terminal comparison at the projection's horizon. */
export function terminal(projection: Projection): MonthPoint {
  const last = projection.months[projection.months.length - 1];
  if (!last) throw new Error("empty projection");
  return last;
}
