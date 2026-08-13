import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, formatMoney0 } from "../src/lib/money.js";

describe("currency-aware formatting", () => {
  it("formats pounds and dollars from the same integer minor units", () => {
    expect(formatMoney(1_234_56, "GBP")).toBe("£1,234.56");
    expect(formatMoney(1_234_56, "USD")).toBe("$1,234.56");
  });

  it("rounds to whole units for headline figures", () => {
    expect(formatMoney0(1_500_49, "GBP")).toBe("£1,500");
    expect(formatMoney0(1_500_50, "USD")).toBe("$1,501");
  });

  it("exposes the bare symbol for inline prefixes", () => {
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("USD")).toBe("$");
  });
});
