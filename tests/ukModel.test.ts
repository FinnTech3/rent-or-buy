import { describe, expect, it } from "vitest";
import { buildInputs, ukDefaults, ukProfileForm, rederiveForLocation } from "../src/app/form.js";
import { PROFILES } from "../src/lib/ukData.js";
import { stampDuty } from "../src/lib/sdlt.js";
import { project } from "../src/lib/model.js";

const familyHome = PROFILES.find((p) => p.id === "family-home")!;

describe("UK scenarios wire the right regime into the engine", () => {
  it("uses Stamp Duty (plus legal) for the buyer's sunk purchase cost", () => {
    const { inputs } = buildInputs(ukProfileForm(familyHome, "London"));
    // £1,000,000: SDLT £43,750 + £2,000 legal = £45,750.
    expect(inputs.closingCostsBuy).toBe(stampDuty(inputs.homePrice) + 2_000_00);
    expect(inputs.closingCostsBuy).toBe(45_750_00);
  });

  it("switches off US property tax and mortgage-interest relief", () => {
    const { inputs } = buildInputs(ukProfileForm(familyHome, "London"));
    expect(inputs.propertyTaxPct).toBe(0); // council tax used instead
    expect(inputs.marginalTaxRatePct).toBe(0); // no relief for UK owner-occupiers
    expect(inputs.pmiRatePct).toBe(0);
    expect(inputs.councilTaxAnnual).toBeGreaterThan(0);
  });

  it("council tax genuinely raises the buyer's outlay", () => {
    const base = buildInputs(ukProfileForm(familyHome, "London")).inputs;
    const withoutCT = { ...base, councilTaxAnnual: 0 };
    const a = project(base, 12).months[0]!.buyerOutlay;
    const b = project(withoutCT, 12).months[0]!.buyerOutlay;
    expect(a).toBeGreaterThan(b);
  });

  it("the projection runs and stays finite for every profile in both cities", () => {
    for (const profile of PROFILES) {
      for (const location of ["London", "Winchester"] as const) {
        const { inputs, horizonMonths } = buildInputs(ukProfileForm(profile, location));
        const proj = project(inputs, horizonMonths);
        expect(proj.months).toHaveLength(horizonMonths);
        expect(Number.isFinite(proj.months.at(-1)!.difference)).toBe(true);
      }
    }
  });
});

describe("flipping the city re-derives rent and council tax", () => {
  it("keeps the price but moves rent to the new market", () => {
    const london = ukProfileForm(familyHome, "London");
    const winchester = rederiveForLocation(london, "Winchester");
    expect(winchester.homePrice).toBe(london.homePrice);
    expect(winchester.ukLocation).toBe("Winchester");
    // Winchester rents lower than London at £1m, so the number must drop.
    expect(Number(winchester.monthlyRent)).toBeLessThan(Number(london.monthlyRent));
  });

  it("ukDefaults gives a ready London family-home scenario", () => {
    const d = ukDefaults();
    expect(d.region).toBe("UK");
    expect(d.ukLocation).toBe("London");
    expect(Number(d.homePrice)).toBe(1_000_000);
  });
});
