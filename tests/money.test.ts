import { describe, expect, it } from "vitest";
import {
  applyRate,
  centsToDollars,
  dollarsToCents,
  formatUSD,
  formatUSD0,
  roundToCents,
} from "../src/lib/money.js";

describe("dollarsToCents", () => {
  it("parses whole and fractional dollars exactly", () => {
    expect(dollarsToCents("1200")).toBe(120_000);
    expect(dollarsToCents("1200.50")).toBe(120_050);
    expect(dollarsToCents("0.01")).toBe(1);
    expect(dollarsToCents("0.1")).toBe(10);
  });

  it("handles negatives", () => {
    expect(dollarsToCents("-42.42")).toBe(-4_242);
  });

  it("survives the 0.1 + 0.2 problem", () => {
    // In floats, 0.1 + 0.2 = 0.30000000000000004. In cents it's exact.
    expect(dollarsToCents("0.1") + dollarsToCents("0.2")).toBe(dollarsToCents("0.3"));
  });

  it("rejects sub-cent precision instead of rounding it away", () => {
    expect(() => dollarsToCents("1200.005")).toThrow(/precision/);
  });

  it("rejects nonsense", () => {
    expect(() => dollarsToCents("abc")).toThrow();
    expect(() => dollarsToCents("1e6")).toThrow();
    expect(() => dollarsToCents("$1200")).toThrow();
  });

  it("round-trips through centsToDollars", () => {
    for (const s of ["0", "1200", "1200.50", "999999.99"]) {
      expect(centsToDollars(dollarsToCents(s))).toBeCloseTo(Number(s), 10);
    }
  });
});

describe("roundToCents / applyRate", () => {
  it("rounds ties away from zero", () => {
    expect(roundToCents(10.005)).toBe(1001); // 1000.5 cents → 1001
    expect(roundToCents(-10.005)).toBe(-1001);
  });

  it("applyRate multiplies a balance by a period rate to whole cents", () => {
    // $300,000 at 0.5% monthly = $1,500.00 interest.
    expect(applyRate(30_000_000, 0.005)).toBe(150_000);
  });
});

describe("formatting", () => {
  it("formats cents as USD", () => {
    expect(formatUSD(120_050)).toBe("$1,200.50");
    expect(formatUSD0(179_865)).toBe("$1,799");
  });
});
