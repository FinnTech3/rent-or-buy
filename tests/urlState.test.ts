import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/app/form.js";
import { decode, encode } from "../src/app/urlState.js";

describe("url state", () => {
  it("round-trips the defaults exactly", () => {
    expect(decode(encode(DEFAULTS))).toEqual(DEFAULTS);
  });

  it("round-trips an edited scenario", () => {
    const edited = {
      ...DEFAULTS,
      homePrice: "725000",
      downPaymentPct: 12,
      mortgageRatePct: 5.875,
      homeAppreciationPct: 4,
      horizonYears: 7,
    };
    expect(decode(encode(edited))).toEqual(edited);
  });

  it("empty query returns the defaults", () => {
    expect(decode("")).toEqual(DEFAULTS);
  });

  it("tolerates a leading # (hash fragment)", () => {
    const q = encode({ ...DEFAULTS, horizonYears: 15 });
    expect(decode(`#${q}`).horizonYears).toBe(15);
  });

  it("ignores unknown and garbage keys, keeping defaults", () => {
    expect(decode("bogus=1&homePrice=500000&horizonYears=notanumber")).toEqual({
      ...DEFAULTS,
      homePrice: "500000",
      // horizonYears stays default because the value wasn't finite
    });
  });

  it("a partial query merges over defaults", () => {
    const decoded = decode("downPaymentPct=5");
    expect(decoded.downPaymentPct).toBe(5);
    expect(decoded.homePrice).toBe(DEFAULTS.homePrice);
  });

  it("keeps string fields as strings and numbers as numbers", () => {
    const decoded = decode("homePrice=300000&mortgageRatePct=7.25");
    expect(decoded.homePrice).toBe("300000");
    expect(decoded.mortgageRatePct).toBe(7.25);
  });
});
