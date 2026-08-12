import { describe, expect, it } from "vitest";
import { dollarsToCents, formatUSD } from "../src/lib/money.js";
import { amortize, balanceAfter, monthlyPayment } from "../src/lib/mortgage.js";

describe("monthlyPayment", () => {
  it("matches the textbook figure for a 30-year loan", () => {
    // $300,000 at 6% APR over 360 months is a widely published $1,798.65.
    const p = monthlyPayment(dollarsToCents("300000"), 6, 360);
    expect(formatUSD(p)).toBe("$1,798.65");
  });

  it("matches a 15-year loan", () => {
    // $300,000 at 4% over 180 months → $2,219.06.
    const p = monthlyPayment(dollarsToCents("300000"), 4, 180);
    expect(formatUSD(p)).toBe("$2,219.06");
  });

  it("handles a zero-rate loan as straight-line", () => {
    // $120,000 at 0% over 120 months → exactly $1,000.00.
    const p = monthlyPayment(dollarsToCents("120000"), 0, 120);
    expect(formatUSD(p)).toBe("$1,000.00");
  });

  it("rejects a non-positive term", () => {
    expect(() => monthlyPayment(dollarsToCents("100000"), 5, 0)).toThrow();
  });
});

describe("amortize", () => {
  it("pays the loan off to exactly zero", () => {
    const loan = amortize(dollarsToCents("300000"), 6, 360);
    expect(loan.schedule).toHaveLength(360);
    expect(loan.schedule[359]!.balance).toBe(0);
  });

  it("conserves cents: principal paid sums to the original loan", () => {
    const principal = dollarsToCents("284350"); // deliberately un-round
    const loan = amortize(principal, 5.375, 360);
    const principalSum = loan.schedule.reduce((a, r) => a + r.principal, 0);
    expect(principalSum).toBe(principal);
  });

  it("total paid equals principal plus total interest", () => {
    const principal = dollarsToCents("300000");
    const loan = amortize(principal, 6, 360);
    expect(loan.totalPaid).toBe(principal + loan.totalInterest);
  });

  it("interest dominates early and principal dominates late", () => {
    const loan = amortize(dollarsToCents("300000"), 6, 360);
    const first = loan.schedule[0]!;
    const last = loan.schedule[359]!;
    expect(first.interest).toBeGreaterThan(first.principal);
    expect(last.principal).toBeGreaterThan(last.interest);
  });

  it("first month interest is exactly one month's rate on the whole balance", () => {
    const loan = amortize(dollarsToCents("300000"), 6, 360);
    // 0.5% of $300,000 = $1,500.00.
    expect(formatUSD(loan.schedule[0]!.interest)).toBe("$1,500.00");
  });

  it("total interest on the canonical loan is about $347,515", () => {
    const loan = amortize(dollarsToCents("300000"), 6, 360);
    // 360 × 1,798.65 − 300,000 = 347,514. The exact figure lands within a
    // dollar of that once the final payment is trued up.
    const dollars = loan.totalInterest / 100;
    expect(dollars).toBeGreaterThan(347_510);
    expect(dollars).toBeLessThan(347_520);
  });
});

describe("balanceAfter", () => {
  it("agrees with the full schedule at every checkpoint", () => {
    const principal = dollarsToCents("300000");
    const loan = amortize(principal, 6, 360);
    for (const m of [1, 12, 60, 120, 240, 359]) {
      expect(balanceAfter(principal, 6, 360, m)).toBe(loan.schedule[m - 1]!.balance);
    }
  });

  it("is the full principal at month zero and zero at term", () => {
    const principal = dollarsToCents("300000");
    expect(balanceAfter(principal, 6, 360, 0)).toBe(principal);
    expect(balanceAfter(principal, 6, 360, 360)).toBe(0);
  });
});
