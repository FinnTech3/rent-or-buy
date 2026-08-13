import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/lib/money.js";
import { effectiveSdltRate, stampDuty } from "../src/lib/sdlt.js";

/** SDLT figures cross-checked by hand against the gov.uk band table
 *  (standard residential rates, England & NI, from 1 April 2025). */
const p = (pounds: number): number => dollarsToCents(String(pounds));
const pounds = (cents: number): number => cents / 100;

describe("stampDuty — standard residential", () => {
  it("matches the hand-computed duty at each brief price point", () => {
    expect(pounds(stampDuty(p(600_000)))).toBe(20_000);
    expect(pounds(stampDuty(p(850_000)))).toBe(32_500);
    expect(pounds(stampDuty(p(1_000_000)))).toBe(43_750);
    expect(pounds(stampDuty(p(1_500_000)))).toBe(93_750);
    expect(pounds(stampDuty(p(2_000_000)))).toBe(153_750);
    expect(pounds(stampDuty(p(3_000_000)))).toBe(273_750);
  });

  it("is zero below the first threshold", () => {
    expect(stampDuty(p(125_000))).toBe(0);
    expect(stampDuty(0)).toBe(0);
    expect(stampDuty(-5)).toBe(0);
  });

  it("charges only 2% on the slice inside the second band", () => {
    // £250,000: 0% to £125k, 2% on the next £125k = £2,500.
    expect(pounds(stampDuty(p(250_000)))).toBe(2_500);
  });

  it("the effective rate climbs with price (progressive)", () => {
    const lo = effectiveSdltRate(p(600_000));
    const hi = effectiveSdltRate(p(3_000_000));
    expect(hi).toBeGreaterThan(lo);
    // £273,750 / £3,000,000 = 9.125%.
    expect(effectiveSdltRate(p(3_000_000))).toBeCloseTo(0.09125, 5);
  });
});

describe("stampDuty — reliefs and surcharges", () => {
  it("gives first-time buyers relief up to the £500k cap", () => {
    // FTB: 0% to £300k, 5% on £300k–£500k = £10,000.
    expect(pounds(stampDuty(p(500_000), { firstTimeBuyer: true }))).toBe(10_000);
    // Below £300k an FTB pays nothing.
    expect(stampDuty(p(295_000), { firstTimeBuyer: true })).toBe(0);
  });

  it("withdraws first-time-buyer relief above £500k (standard rates apply)", () => {
    // £600k is over the cap, so FTB status changes nothing.
    expect(stampDuty(p(600_000), { firstTimeBuyer: true })).toBe(stampDuty(p(600_000)));
  });

  it("adds the 5-point additional-property surcharge on every band", () => {
    // £600k standard £20,000; additional adds 5% of the whole £600k = £30,000,
    // for £50,000 total.
    expect(pounds(stampDuty(p(600_000), { additionalProperty: true }))).toBe(50_000);
  });
});
