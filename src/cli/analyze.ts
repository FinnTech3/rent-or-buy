/**
 * Headless report: run a scenario through the engine and print the honest
 * answer — the range, the break-even, and which assumption the call hinges
 * on — with no UI. Proves the backend end to end and is handy for eyeballing
 * numbers against your own spreadsheet.
 *
 *   npx tsx src/cli/analyze.ts [horizonYears]
 */
import { dollarsToCents, formatUSD, formatUSD0 } from "../lib/money.js";
import { monthlyPayment } from "../lib/mortgage.js";
import { project, terminal } from "../lib/model.js";
import type { Inputs } from "../lib/model.js";
import { analyse, verdict } from "../lib/sensitivity.js";

const SCENARIO: Inputs = {
  homePrice: dollarsToCents("400000"),
  downPayment: dollarsToCents("80000"),
  mortgageRatePct: 6.5,
  termYears: 30,
  closingCostsBuy: dollarsToCents("12000"),
  sellingCostsPct: 6,
  propertyTaxPct: 1.1,
  homeInsuranceAnnual: dollarsToCents("1800"),
  maintenancePct: 1,
  hoaMonthly: dollarsToCents("0"),
  homeAppreciationPct: 3.5,
  monthlyRent: dollarsToCents("2200"),
  rentGrowthPct: 3,
  rentersInsuranceMonthly: dollarsToCents("15"),
  investmentReturnPct: 6,
  inflationPct: 2.5,
  marginalTaxRatePct: 0,
};

const YEARS = Number(process.argv[2] ?? 10);
const horizon = Math.round(YEARS * 12);

const proj = project(SCENARIO, horizon);
const end = terminal(proj);
const sens = analyse(SCENARIO, horizon);
const call = verdict(sens);

const pay = monthlyPayment(
  SCENARIO.homePrice - SCENARIO.downPayment,
  SCENARIO.mortgageRatePct,
  SCENARIO.termYears * 12,
);

const line = (label: string, value: string) => console.log(label.padEnd(30) + value);
const years = (m: number | null) => (m === null ? "never" : `${(m / 12).toFixed(1)} yr (month ${m})`);

console.log(`\n  RENT-OR-BUY — ${formatUSD0(SCENARIO.homePrice)} home, ${YEARS}-year horizon\n`);
line("Mortgage P&I", `${formatUSD(pay)} / mo`);
line("First-month buyer outlay", `${formatUSD(proj.months[0]!.buyerOutlay)} / mo`);
line("First-month rent outlay", `${formatUSD(proj.months[0]!.renterOutlay)} / mo`);
line("Break-even (buying pulls ahead)", years(proj.breakEvenMonth));
console.log();
line("Buyer net worth @ horizon", formatUSD0(end.buyerNetWorth));
line("Renter net worth @ horizon", formatUSD0(end.renterNetWorth));
line("Difference (buy − rent)", `${end.difference >= 0 ? "+" : ""}${formatUSD0(end.difference)}`);
console.log();
console.log(`  VERDICT: ${call.toUpperCase()}`);
line("  Honest range (worst … best)", `${formatUSD0(sens.worst)} … ${formatUSD0(sens.best)}`);
line("  Buying wins in", `${Math.round(sens.buyWinFraction * 100)}% of the swept scenarios`);
console.log();
console.log("  What the answer hinges on (biggest swing first):");
for (const t of sens.tornado) {
  const swing = formatUSD0(t.swing);
  line(`    ${t.key}`, `${t.low}% → ${t.high}%  swings ${swing}`);
}
console.log();
