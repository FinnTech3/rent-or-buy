import { describe, expect, it } from "vitest";
import { PRESETS, buildInputs } from "../src/app/form.js";
import { analyse, verdict } from "../src/lib/sensitivity.js";

const verdictOf = (formName: string) => {
  const preset = PRESETS.find((p) => p.name === formName)!;
  const { inputs, horizonMonths } = buildInputs(preset.form);
  return verdict(analyse(inputs, horizonMonths));
};

describe("presets", () => {
  it("every preset has a distinct name", () => {
    const names = PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("buildInputs turns a preset into a usable engine input", () => {
    const { inputs, horizonMonths } = buildInputs(PRESETS[0]!.form);
    expect(inputs.homePrice).toBeGreaterThan(0);
    expect(horizonMonths).toBeGreaterThan(0);
    expect(inputs.downPayment).toBe(Math.round(inputs.homePrice * 0.2));
  });

  it("the presets do not all give the same verdict — the whole point", () => {
    const verdicts = new Set(PRESETS.map((p) => {
      const { inputs, horizonMonths } = buildInputs(p.form);
      return verdict(analyse(inputs, horizonMonths));
    }));
    expect(verdicts.size).toBeGreaterThan(1);
  });

  it("the rent-favoring preset does not come out as buy", () => {
    expect(verdictOf("Renting looks smart")).not.toBe("buy");
  });
});
