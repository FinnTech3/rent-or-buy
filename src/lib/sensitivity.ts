/**
 * Turning one answer into an honest range.
 *
 * The terminal buy-vs-rent number is a point estimate resting on three
 * assumptions nobody can actually know: how fast the home appreciates, what
 * the market returns on the money you'd otherwise invest, and how fast rent
 * climbs. Reasonable people disagree about each by a couple of points, and a
 * couple of points swings this decision hard. Reporting the single number
 * without the band it lives in is the central dishonesty of every rent-vs-buy
 * calculator online.
 *
 * So this module does two things: it sweeps the three drivers across a
 * plausible band and reports the *range* of outcomes, and it runs a tornado
 * - moving one driver at a time - so you can see which assumption your answer
 * is actually hostage to, rather than pretending they matter equally.
 */

import type { Cents } from "./money.js";
import { project, terminal } from "./model.js";
import type { Inputs } from "./model.js";

/** Numeric input fields that can be swept. Every field of Inputs is numeric
 *  (cents are integers), but these three are the ones the answer hinges on. */
export type Driver = "homeAppreciationPct" | "investmentReturnPct" | "rentGrowthPct";

export interface Band {
  readonly key: Driver;
  readonly low: number;
  readonly base: number;
  readonly high: number;
}

export interface Outcome {
  readonly terminalDifference: Cents;
  readonly breakEvenMonth: number | null;
}

export interface TornadoBar {
  readonly key: Driver;
  readonly low: number;
  readonly high: number;
  /** Terminal difference with this driver at its low / high, others at base. */
  readonly lowDifference: Cents;
  readonly highDifference: Cents;
  /** Absolute swing between low and high - how much this one assumption
   *  moves the whole answer. Bars are sorted by this, largest first. */
  readonly swing: Cents;
}

export interface Sensitivity {
  readonly base: Outcome;
  /** Extremes of the terminal difference across the full band sweep. */
  readonly worst: Cents;
  readonly best: Cents;
  /** How often, across the swept grid, buying comes out ahead. A blunt but
   *  honest "how robust is this call" number in [0, 1]. */
  readonly buyWinFraction: number;
  readonly tornado: readonly TornadoBar[];
}

const outcomeAt = (inputs: Inputs, horizonMonths: number): Outcome => {
  const p = project(inputs, horizonMonths);
  return { terminalDifference: terminal(p).difference, breakEvenMonth: p.breakEvenMonth };
};

/** Default ±band around the base assumptions: appreciation and market return
 *  swing wider than rent growth because that is how uncertain they really
 *  are over a holding period. */
export function defaultBands(inputs: Inputs): Band[] {
  return [
    { key: "homeAppreciationPct", low: inputs.homeAppreciationPct - 2, base: inputs.homeAppreciationPct, high: inputs.homeAppreciationPct + 2 },
    { key: "investmentReturnPct", low: inputs.investmentReturnPct - 2, base: inputs.investmentReturnPct, high: inputs.investmentReturnPct + 2 },
    { key: "rentGrowthPct", low: inputs.rentGrowthPct - 1.5, base: inputs.rentGrowthPct, high: inputs.rentGrowthPct + 1.5 },
  ];
}

export function analyse(
  inputs: Inputs,
  horizonMonths: number,
  bands: readonly Band[] = defaultBands(inputs),
): Sensitivity {
  const base = outcomeAt(inputs, horizonMonths);

  // Full grid across low/base/high of every driver → the outcome range.
  let worst = Infinity;
  let best = -Infinity;
  let wins = 0;
  let total = 0;
  const levels = (b: Band): number[] => [b.low, b.base, b.high];
  const [a, m, r] = bands as [Band, Band, Band];
  for (const av of levels(a)) {
    for (const mv of levels(m)) {
      for (const rv of levels(r)) {
        const diff = outcomeAt(
          { ...inputs, [a.key]: av, [m.key]: mv, [r.key]: rv },
          horizonMonths,
        ).terminalDifference;
        worst = Math.min(worst, diff);
        best = Math.max(best, diff);
        if (diff >= 0) wins++;
        total++;
      }
    }
  }

  // Tornado: one driver at a time, others held at base.
  const tornado: TornadoBar[] = bands.map((b) => {
    const lowDifference = outcomeAt({ ...inputs, [b.key]: b.low }, horizonMonths).terminalDifference;
    const highDifference = outcomeAt({ ...inputs, [b.key]: b.high }, horizonMonths).terminalDifference;
    return {
      key: b.key,
      low: b.low,
      high: b.high,
      lowDifference,
      highDifference,
      swing: Math.abs(highDifference - lowDifference),
    };
  });
  tornado.sort((x, y) => y.swing - x.swing);

  return { base, worst, best, buyWinFraction: wins / total, tornado };
}

export type Verdict = "buy" | "rent" | "toss-up";

/** A blunt call from the swept range: only "buy" or "rent" when the whole
 *  plausible band agrees; otherwise it is honestly a toss-up. */
export function verdict(s: Sensitivity): Verdict {
  if (s.worst >= 0) return "buy";
  if (s.best <= 0) return "rent";
  return "toss-up";
}
