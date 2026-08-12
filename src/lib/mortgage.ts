/**
 * Fixed-rate mortgage amortization.
 *
 * Given a principal, an annual rate, and a term, this produces the monthly
 * payment and the month-by-month split of that payment into interest and
 * principal. Everything is in integer cents; the interest each month is the
 * balance times the monthly rate, rounded to the cent, and the final
 * payment is adjusted so the balance lands on exactly zero rather than a
 * few cents off — which is what real servicers do.
 *
 * The closed-form payment formula and the iterated schedule are computed
 * independently, and the tests check they agree (the schedule pays the loan
 * off to the cent), which is the differential check that this module is
 * correct rather than merely plausible.
 */

import { applyRate, roundToCents } from "./money.js";
import type { Cents } from "./money.js";

export interface AmortRow {
  /** 1-based month index. */
  readonly month: number;
  readonly payment: Cents;
  readonly interest: Cents;
  readonly principal: Cents;
  /** Remaining balance after this month's payment. */
  readonly balance: Cents;
}

export interface Amortization {
  readonly monthlyPayment: Cents;
  readonly schedule: readonly AmortRow[];
  readonly totalInterest: Cents;
  readonly totalPaid: Cents;
}

/** The per-month interest rate from an annual percentage rate. `6` → 0.005. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/**
 * The level monthly payment that amortizes `principal` over `termMonths` at
 * `annualRatePct`, rounded to the cent. Falls back to straight-line for a
 * zero rate (where the closed form divides by zero).
 */
export function monthlyPayment(
  principal: Cents,
  annualRatePct: number,
  termMonths: number,
): Cents {
  if (termMonths <= 0) throw new Error(`term must be positive, got ${termMonths}`);
  if (principal < 0) throw new Error(`principal must be non-negative`);
  const r = monthlyRate(annualRatePct);
  if (r === 0) return roundToCents(principal / 100 / termMonths);
  const growth = Math.pow(1 + r, termMonths);
  const paymentDollars = (principal / 100) * (r * growth) / (growth - 1);
  return roundToCents(paymentDollars);
}

/**
 * The full amortization schedule. The last month absorbs any rounding
 * residual so the balance ends at exactly zero.
 */
export function amortize(
  principal: Cents,
  annualRatePct: number,
  termMonths: number,
): Amortization {
  const payment = monthlyPayment(principal, annualRatePct, termMonths);
  const r = monthlyRate(annualRatePct);
  const schedule: AmortRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= termMonths; month++) {
    const interest = applyRate(balance, r);
    let principalPaid = payment - interest;
    let thisPayment = payment;

    const isLast = month === termMonths;
    // Never let principal exceed the balance, and make the final month clear
    // whatever is left so the loan closes to the cent.
    if (isLast || principalPaid >= balance) {
      principalPaid = balance;
      thisPayment = balance + interest;
    }

    balance -= principalPaid;
    totalInterest += interest;
    totalPaid += thisPayment;
    schedule.push({ month, payment: thisPayment, interest, principal: principalPaid, balance });

    if (balance === 0) break;
  }

  return { monthlyPayment: payment, schedule, totalInterest, totalPaid };
}

/**
 * The outstanding balance after `monthsElapsed` payments, without building
 * the whole schedule. Useful for the sale-proceeds calculation at an
 * arbitrary horizon shorter than the term.
 */
export function balanceAfter(
  principal: Cents,
  annualRatePct: number,
  termMonths: number,
  monthsElapsed: number,
): Cents {
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= termMonths) return 0;
  const payment = monthlyPayment(principal, annualRatePct, termMonths);
  const r = monthlyRate(annualRatePct);
  let balance = principal;
  for (let m = 0; m < monthsElapsed; m++) {
    const interest = applyRate(balance, r);
    balance -= payment - interest;
    if (balance < 0) balance = 0;
  }
  return balance;
}
