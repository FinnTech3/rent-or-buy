/**
 * Monte Carlo over the assumptions that matter.
 *
 * The sensitivity sweep answers "what if appreciation / market return / rent
 * growth each land at the low, middle, or high of a band?" — nine-and-twenty
 * discrete corners. This goes further: it draws each of those rates from a
 * distribution a thousand times and runs the full model on every draw, so the
 * output is a *probability* that buying wins and a spread of dollar outcomes,
 * not just a min and a max.
 *
 * What's random here is the horizon-average rate for each driver, not the
 * year-by-year path — the same framing the rest of the tool uses, extended
 * from a grid to a smooth distribution. The spread narrows with a longer
 * horizon because the standard error of a long-run average shrinks with time
 * (σ ∝ 1/√years), which is honest: you're less uncertain about the average
 * return over twenty years than over three. It deliberately does not model
 * sequence-of-returns risk — that would need a path-based engine and is the
 * next honest step, not this one.
 */

import { project, terminal } from "./model.js";
import type { Inputs } from "./model.js";
import type { Cents } from "./money.js";
import { mulberry32, normal } from "./random.js";

export interface MonteCarloOptions {
  readonly trials?: number;
  readonly seed?: number;
  /** Annual volatilities of each driver. The uncertainty applied to the
   *  horizon-average rate is this divided by √years. */
  readonly apprAnnualVol?: number;
  readonly investAnnualVol?: number;
  readonly rentAnnualVol?: number;
}

export interface MonteCarloResult {
  readonly trials: number;
  /** Fraction of simulated futures in which buying ends ahead, in [0, 1]. */
  readonly pBuyWins: number;
  readonly median: Cents;
  /** The middle 80% of outcomes: 10th and 90th percentile terminal
   *  differences. */
  readonly p10: Cents;
  readonly p90: Cents;
  readonly mean: Cents;
}

export function simulate(
  inputs: Inputs,
  horizonMonths: number,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const years = Math.max(1, horizonMonths / 12);
  const trials = options.trials ?? 1000;
  const rng = mulberry32(options.seed ?? 0x9e3779b9);
  const sAppr = (options.apprAnnualVol ?? 10) / Math.sqrt(years);
  const sInvest = (options.investAnnualVol ?? 16) / Math.sqrt(years);
  const sRent = (options.rentAnnualVol ?? 4) / Math.sqrt(years);

  const diffs = new Array<number>(trials);
  let wins = 0;
  let sum = 0;
  for (let i = 0; i < trials; i++) {
    const appr = inputs.homeAppreciationPct + normal(rng) * sAppr;
    const invest = Math.max(-50, inputs.investmentReturnPct + normal(rng) * sInvest);
    const rent = Math.max(-50, inputs.rentGrowthPct + normal(rng) * sRent);
    const d = terminal(project(
      { ...inputs, homeAppreciationPct: appr, investmentReturnPct: invest, rentGrowthPct: rent },
      horizonMonths,
    )).difference;
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
