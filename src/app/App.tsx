/**
 * The one screen. An editorial, calm rent-vs-buy calculator that refuses to
 * hand you a single number: it shows the verdict, the honest range around it,
 * the break-even year, and which assumption the answer is actually hostage to.
 *
 * All the economics live in ../lib (project / analyse / verdict). This file is
 * inputs and presentation only - no financial logic. The design language is a
 * deliberate contrast to orderbook-live's trading-terminal density: warm
 * paper, a serif display voice, one accent, honest charts.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  DEFAULTS, PRESETS, STANDARD_DEDUCTION, buildInputs, currencyOf,
  ukDefaults, ukProfileForm, rederiveForLocation,
} from "./form.js";
import type { FormState, Region } from "./form.js";
import { decode, encode } from "./urlState.js";
import { dollarsToCents, formatMoney, formatMoney0, currencySymbol } from "../lib/money.js";
import type { Cents, Currency } from "../lib/money.js";
import { PROFILES, resolveProfile } from "../lib/ukData.js";
import type { UkLocation } from "../lib/ukData.js";
import { stampDuty } from "../lib/sdlt.js";
import { monthlyPayment } from "../lib/mortgage.js";
import { project, terminal } from "../lib/model.js";
import type { Inputs, MonthPoint } from "../lib/model.js";
import { analyse, verdict } from "../lib/sensitivity.js";
import type { Sensitivity, Verdict } from "../lib/sensitivity.js";
import { simulatePaths } from "../lib/montecarloPaths.js";
import type { MonteCarloResult } from "../lib/montecarlo.js";

// ─────────────────────────── formatting ───────────────────────────────────

// The active currency for the current render. Set once at the top of App()
// before the subtree renders, so every formatter below reads the right symbol
// without threading a prop through a dozen components. Safe here because there
// is a single App instance rendered synchronously.
let CUR: Currency = "USD";

const money = (c: Cents): string => formatMoney(c, CUR);
const money0 = (c: Cents): string => formatMoney0(c, CUR);

function fmtCompact(cents: Cents): string {
  const d = cents / 100;
  const a = Math.abs(d);
  const s = d < 0 ? "−" : "";
  const sym = currencySymbol(CUR);
  if (a >= 1e6) return `${s}${sym}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}${sym}${(a / 1e3).toFixed(0)}k`;
  return `${s}${sym}${a.toFixed(0)}`;
}

function signed(cents: Cents): string {
  return `${cents >= 0 ? "+" : "−"}${money0(Math.abs(cents))}`;
}

// ─────────────────────────────── app ──────────────────────────────────────

export function App(): JSX.Element {
  const [form, setForm] = useState<FormState>(() =>
    typeof window === "undefined" ? DEFAULTS : decode(window.location.hash),
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  // Keep the URL in step with the scenario so any state is a shareable link.
  // replaceState rather than push so tweaking a slider doesn't spam history.
  useEffect(() => {
    const q = encode(form);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${q}`);
  }, [form]);

  const { inputs, horizonMonths } = useMemo(() => buildInputs(form), [form]);
  const proj = useMemo(() => project(inputs, horizonMonths), [inputs, horizonMonths]);
  const sens = useMemo(() => analyse(inputs, horizonMonths), [inputs, horizonMonths]);
  const mc = useMemo(() => simulatePaths(inputs, horizonMonths, { trials: 800 }), [inputs, horizonMonths]);
  const end = terminal(proj);
  const call = verdict(sens);

  const payment = useMemo(
    () => monthlyPayment(
      Math.max(0, inputs.homePrice - inputs.downPayment),
      inputs.mortgageRatePct,
      Math.round(inputs.termYears * 12),
    ),
    [inputs],
  );

  // Set the render-wide currency before the subtree formats any money.
  CUR = currencyOf(form.region);

  const switchRegion = (region: Region): void =>
    setForm(region === "UK" ? ukDefaults() : DEFAULTS);

  return (
    <>
      <Tokens />
      <div className="rb-page">
        <div className="rb-shell">
          <header className="rb-header">
            <div className="rb-header-top">
              <h1 className="rb-wordmark">rent&nbsp;or&nbsp;buy</h1>
              <div className="rb-header-actions">
                <RegionSwitch region={form.region} onChange={switchRegion} />
                <CopyLink />
                <button className="rb-ghost-btn" onClick={() => setForm(form.region === "UK" ? ukDefaults(form.ukLocation) : DEFAULTS)}>Reset</button>
              </div>
            </div>
            <p className="rb-tagline">
              The honest version. Not “is the mortgage cheaper than rent?” but
              “which leaves you wealthier when you sell, and how sure can you
              be?”{form.region === "UK"
                ? " UK mode adds stamp duty, council tax, and no mortgage-interest relief: the real cost of buying here."
                : ""}
            </p>
          </header>

          <div className="rb-grid">
            <InputsPanel form={form} set={set} inputs={inputs} payment={payment} />

            <main className="rb-answer">
              <PresetRow current={form} onPick={setForm} />
              <VerdictBlock call={call} sens={sens} end={end} horizonYears={form.horizonYears} />
              <RangeBar sens={sens} mc={mc} />
              <BreakEvenChart proj={proj} horizonMonths={horizonMonths} />
              <Tornado sens={sens} />
              <Disclosures region={form.region} />
            </main>
          </div>

          <footer className="rb-footer">
            Every figure is computed in the browser from an integer-cents
            engine. Assumptions are yours; the range is the point.
          </footer>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────── inputs ───────────────────────────────────

function InputsPanel(props: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  inputs: Inputs;
  payment: Cents;
}): JSX.Element {
  const { form, set } = props;
  const uk = form.region === "UK";
  const downPayment = Math.round(props.inputs.homePrice * (form.downPaymentPct / 100));
  const sdlt = stampDuty(props.inputs.homePrice);

  return (
    <aside className="rb-inputs">
      <Group title="The home">
        <MoneyField label="Home price" value={form.homePrice} onChange={(v) => set("homePrice", v)} />
        <SliderField label="Down payment" value={form.downPaymentPct} onChange={(v) => set("downPaymentPct", v)}
          min={0} max={50} step={1} suffix="%" note={money0(downPayment)} />
        <NumberField label="Mortgage rate" value={form.mortgageRatePct} onChange={(v) => set("mortgageRatePct", v)} step={0.125} suffix="%" />
        <NumberField label="Loan term" value={form.termYears} onChange={(v) => set("termYears", v)} step={5} suffix="yr" />
        <div className="rb-payline">Monthly principal &amp; interest: <b>{money(props.payment)}</b></div>
      </Group>

      {uk ? (
        <Group title="Owning costs">
          <div className="rb-payline">Stamp duty (SDLT) on purchase: <b>{money0(sdlt)}</b> <span className="rb-slider-note">+ £2,000 legal · sunk on day one</span></div>
          <NumberField label="Selling costs" value={form.sellingCostsPct} onChange={(v) => set("sellingCostsPct", v)} step={0.5} suffix="%" />
          <MoneyField label="Council tax / yr" value={form.councilTaxAnnual} onChange={(v) => set("councilTaxAnnual", v)} />
          <NumberField label="Maintenance / yr" value={form.maintenancePct} onChange={(v) => set("maintenancePct", v)} step={0.25} suffix="%" />
          <MoneyField label="Buildings insurance / yr" value={form.homeInsuranceAnnual} onChange={(v) => set("homeInsuranceAnnual", v)} />
          <MoneyField label="Service charge / mo (leasehold)" value={form.hoaMonthly} onChange={(v) => set("hoaMonthly", v)} />
        </Group>
      ) : (
        <Group title="Owning costs">
          <NumberField label="Closing costs (buy)" value={form.closingCostsBuyPct} onChange={(v) => set("closingCostsBuyPct", v)} step={0.5} suffix="%" />
          <NumberField label="Selling costs" value={form.sellingCostsPct} onChange={(v) => set("sellingCostsPct", v)} step={0.5} suffix="%" />
          <NumberField label="Property tax / yr" value={form.propertyTaxPct} onChange={(v) => set("propertyTaxPct", v)} step={0.1} suffix="%" />
          <NumberField label="Maintenance / yr" value={form.maintenancePct} onChange={(v) => set("maintenancePct", v)} step={0.25} suffix="%" />
          <MoneyField label="Home insurance / yr" value={form.homeInsuranceAnnual} onChange={(v) => set("homeInsuranceAnnual", v)} />
          <MoneyField label="HOA / mo" value={form.hoaMonthly} onChange={(v) => set("hoaMonthly", v)} />
          <NumberField label="PMI / yr (under 20% down)" value={form.pmiRatePct} onChange={(v) => set("pmiRatePct", v)} step={0.1} suffix="%" />
        </Group>
      )}

      <Group title="Renting">
        <MoneyField label="Rent / mo" value={form.monthlyRent} onChange={(v) => set("monthlyRent", v)} />
        <NumberField label="Rent growth / yr" value={form.rentGrowthPct} onChange={(v) => set("rentGrowthPct", v)} step={0.5} suffix="%" />
        <MoneyField label="Renters insurance / mo" value={form.rentersInsuranceMonthly} onChange={(v) => set("rentersInsuranceMonthly", v)} />
      </Group>

      <Group title="The world (the guesses that matter)">
        <NumberField label="Home appreciation / yr" value={form.homeAppreciationPct} onChange={(v) => set("homeAppreciationPct", v)} step={0.5} suffix="%" accent />
        <NumberField label="Investment return / yr" value={form.investmentReturnPct} onChange={(v) => set("investmentReturnPct", v)} step={0.5} suffix="%" accent />
        <NumberField label="Inflation / yr" value={form.inflationPct} onChange={(v) => set("inflationPct", v)} step={0.25} suffix="%" />
      </Group>

      {uk ? null : (
        <Group title="Taxes (optional, usually a wash)">
          <FilingField value={form.filingStatus} onChange={(v) => set("filingStatus", v)} />
          <NumberField label="Marginal tax rate" value={form.marginalTaxRatePct} onChange={(v) => set("marginalTaxRatePct", v)} step={1} suffix="%" />
          <MoneyField label="State/local tax / yr" value={form.stateLocalTaxAnnual} onChange={(v) => set("stateLocalTaxAnnual", v)} />
          <MoneyField label="Other itemized / yr" value={form.otherItemizedAnnual} onChange={(v) => set("otherItemizedAnnual", v)} />
        </Group>
      )}

      <Group title="Horizon">
        <SliderField label="Years until you'd sell" value={form.horizonYears} onChange={(v) => set("horizonYears", v)}
          min={1} max={30} step={1} suffix="yr" note="" big />
      </Group>
    </aside>
  );
}

function RegionSwitch(props: { region: Region; onChange: (r: Region) => void }): JSX.Element {
  const regions: { id: Region; label: string }[] = [
    { id: "US", label: "US" },
    { id: "UK", label: "UK" },
  ];
  return (
    <span className="rb-filing" role="group" aria-label="Country">
      {regions.map((r) => (
        <button key={r.id} className={`rb-seg${props.region === r.id ? " rb-seg-on" : ""}`}
          onClick={() => props.onChange(r.id)}>{r.label}</button>
      ))}
    </span>
  );
}

function PresetRow(props: { current: FormState; onPick: (f: FormState) => void }): JSX.Element {
  if (props.current.region === "UK") return <UkPresetRow current={props.current} onPick={props.onPick} />;
  const matches = (f: FormState): boolean => JSON.stringify(f) === JSON.stringify(props.current);
  return (
    <div className="rb-presets">
      <span className="rb-presets-label">Try a scenario</span>
      <div className="rb-presets-chips">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`rb-chip${matches(p.form) ? " rb-chip-on" : ""}`}
            onClick={() => props.onPick(p.form)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The UK example profiles: a London/Winchester toggle plus the six persona
 *  price points, each loading a real, sourced scenario. */
function UkPresetRow(props: { current: FormState; onPick: (f: FormState) => void }): JSX.Element {
  const { current } = props;
  const activePrice = Number(current.homePrice);
  const cities: UkLocation[] = ["London", "Winchester"];
  return (
    <div className="rb-uk-presets">
      <div className="rb-presets">
        <span className="rb-presets-label">Example profiles · real UK data</span>
        <span className="rb-filing" role="group" aria-label="City">
          {cities.map((c) => (
            <button key={c} className={`rb-seg${current.ukLocation === c ? " rb-seg-on" : ""}`}
              onClick={() => props.onPick(rederiveForLocation(current, c))}>{c}</button>
          ))}
        </span>
      </div>
      <div className="rb-presets-chips">
        {PROFILES.map((p) => {
          const r = resolveProfile(p, current.ukLocation);
          return (
            <button
              key={p.id}
              className={`rb-chip${activePrice === p.priceGBP ? " rb-chip-on" : ""}`}
              title={`${p.note} · rent ≈ ${money0(r.monthlyRentGBP * 100)}/mo at a ${r.grossYieldPct}% gross yield`}
              onClick={() => props.onPick(ukProfileForm(p, current.ukLocation))}
            >
              {p.persona} · {fmtCompact(p.priceGBP * 100)}
            </button>
          );
        })}
      </div>
      <p className="rb-uk-note">
        Rent is derived as price × gross&nbsp;yield ÷ 12 from published{" "}
        {current.ukLocation} yields (Savills/Cluttons; PropertyInvestmentsUK for
        Winchester), not typed in. Council tax, stamp duty and the macro
        assumptions are labelled and editable. The inflation rate is a
        placeholder set to the 2% BoE target.
      </p>
    </div>
  );
}

function CopyLink(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const onCopy = (): void => {
    const url = window.location.href;
    const done = (): void => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  };
  return (
    <button className="rb-ghost-btn" onClick={onCopy}>
      {copied ? "Link copied ✓" : "Copy link to this scenario"}
    </button>
  );
}

function FilingField(props: {
  value: FormState["filingStatus"]; onChange: (v: FormState["filingStatus"]) => void;
}): JSX.Element {
  const options: FormState["filingStatus"][] = ["single", "married"];
  return fieldRow(
    "Filing status",
    <span className="rb-filing">
      {options.map((s) => (
        <button
          key={s}
          className={`rb-seg${props.value === s ? " rb-seg-on" : ""}`}
          onClick={() => props.onChange(s)}
        >{s}</button>
      ))}
    </span>,
    `standard deduction ${money0(dollarsToCents(String(STANDARD_DEDUCTION[props.value])))}`,
  );
}

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rb-group">
      <h2 className="rb-group-title">{title}</h2>
      <div className="rb-group-body">{children}</div>
    </section>
  );
}

function fieldRow(label: string, control: ReactNode, note?: ReactNode): JSX.Element {
  return (
    <label className="rb-field">
      <span className="rb-field-label">{label}</span>
      <span className="rb-field-control">{control}</span>
      {note ? <span className="rb-field-note">{note}</span> : null}
    </label>
  );
}

function MoneyField(props: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return fieldRow(
    props.label,
    <span className="rb-money-input">
      <span className="rb-money-sign">{currencySymbol(CUR)}</span>
      <input className="rb-input" inputMode="decimal" value={props.value}
        onChange={(e) => props.onChange(e.target.value)} />
    </span>,
  );
}

function NumberField(props: {
  label: string; value: number; onChange: (v: number) => void; step: number; suffix: string; accent?: boolean;
}): JSX.Element {
  return fieldRow(
    props.label,
    <span className={`rb-num-input${props.accent ? " rb-num-accent" : ""}`}>
      <input className="rb-input" type="number" step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
      <span className="rb-suffix">{props.suffix}</span>
    </span>,
  );
}

function SliderField(props: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix: string; note: string; big?: boolean;
}): JSX.Element {
  return (
    <label className="rb-field rb-field-slider">
      <span className="rb-field-label">
        {props.label}
        <span className={`rb-slider-value${props.big ? " rb-slider-value-big" : ""}`}>
          {props.value}{props.suffix}{props.note ? <span className="rb-slider-note"> · {props.note}</span> : null}
        </span>
      </span>
      <input className="rb-range" type="range" min={props.min} max={props.max} step={props.step}
        value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

// ─────────────────────────────── verdict ──────────────────────────────────

const VERDICT_COPY: Record<Verdict, { word: string; color: string }> = {
  buy: { word: "Buy", color: "var(--buy)" },
  rent: { word: "Rent", color: "var(--rent)" },
  "toss-up": { word: "Toss-up", color: "var(--accent)" },
};

function VerdictBlock(props: {
  call: Verdict; sens: Sensitivity; end: MonthPoint; horizonYears: number;
}): JSX.Element {
  const { call, sens, end } = props;
  const copy = VERDICT_COPY[call];
  const diff = end.difference;
  const winner = diff >= 0 ? "buying" : "renting";
  const driver = sens.tornado[0]?.key ?? "home appreciation";
  const driverLabel = DRIVER_LABEL[driver] ?? driver;

  const sentence = call === "toss-up"
    ? `Over ${props.horizonYears} years, ${winner} edges ahead by ${money0(Math.abs(diff))}, but the plausible range runs from ${signed(sens.worst)} to ${signed(sens.best)}. This is close to a coin flip, and it hinges mostly on ${driverLabel}.`
    : `Over ${props.horizonYears} years, ${VERDICT_COPY[call].word.toLowerCase()}ing wins across every plausible assumption, from ${signed(sens.worst)} in the worst case to ${signed(sens.best)} in the best. The result is driven mostly by ${driverLabel}.`;

  return (
    <section className="rb-verdict">
      <div className="rb-verdict-head">
        <span className="rb-verdict-kicker">The call, at your horizon</span>
        <span className="rb-verdict-word" style={{ color: copy.color }}>{copy.word}</span>
      </div>
      <p className="rb-verdict-sentence">{sentence}</p>
      <div className="rb-verdict-stats">
        <Stat label="Buyer net worth" value={fmtCompact(end.buyerNetWorth)} />
        <Stat label="Renter net worth" value={fmtCompact(end.renterNetWorth)} />
        <Stat label="Difference" value={signed(diff)} color={diff >= 0 ? "var(--buy)" : "var(--rent)"} />
        <Stat label="Buying wins in" value={`${Math.round(sens.buyWinFraction * 100)}%`} note="of swept scenarios" />
      </div>
    </section>
  );
}

function Stat({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }): JSX.Element {
  return (
    <div className="rb-stat">
      <div className="rb-stat-label">{label}</div>
      <div className="rb-stat-value" style={color ? { color } : undefined}>{value}</div>
      {note ? <div className="rb-stat-note">{note}</div> : null}
    </div>
  );
}

// ─────────────────────────────── range bar ────────────────────────────────

function RangeBar({ sens, mc }: { sens: Sensitivity; mc: MonteCarloResult }): JSX.Element {
  const W = 100;
  const lo = Math.min(sens.worst, 0);
  const hi = Math.max(sens.best, 0);
  const span = hi - lo || 1;
  const pad = span * 0.08;
  const dLo = lo - pad;
  const dHi = hi + pad;
  const x = (v: number): number => ((v - dLo) / (dHi - dLo)) * W;

  const zero = x(0);
  const base = x(sens.base.terminalDifference);
  const xWorst = x(sens.worst);
  const xBest = x(sens.best);

  return (
    <section className="rb-card">
      <h3 className="rb-card-title">The honest range</h3>
      <p className="rb-card-sub">
        Where the answer lands as home appreciation, market return and rent
        growth vary across a plausible band. Left of the line, renting wins;
        right of it, buying does.
      </p>
      <div className="rb-rangebar">
        <svg viewBox={`0 0 ${W} 22`} preserveAspectRatio="none" className="rb-rangebar-svg" role="img"
          aria-label="Range of outcomes from worst to best case">
          {/* rent side */}
          <rect x={xWorst} y={7} width={Math.max(0, Math.min(zero, xBest) - xWorst)} height={8} fill="var(--rent-soft)" />
          {/* buy side */}
          <rect x={Math.max(zero, xWorst)} y={7} width={Math.max(0, xBest - Math.max(zero, xWorst))} height={8} fill="var(--buy-soft)" />
          {/* band border */}
          <rect x={xWorst} y={7} width={Math.max(0.4, xBest - xWorst)} height={8} fill="none" stroke="var(--line-2)" strokeWidth={0.4} />
          {/* zero line */}
          <line x1={zero} y1={3} x2={zero} y2={19} stroke="var(--ink)" strokeWidth={0.6} />
          {/* base marker */}
          <line x1={base} y1={4} x2={base} y2={18} stroke="var(--accent)" strokeWidth={1.2} />
        </svg>
        <div className="rb-rangebar-labels">
          <span className="rb-range-worst">{signed(sens.worst)}<em>worst</em></span>
          <span className="rb-range-base" style={{ left: `${base}%` }}>{signed(sens.base.terminalDifference)}<em>base</em></span>
          <span className="rb-range-best">{signed(sens.best)}<em>best</em></span>
        </div>
      </div>
      <p className="rb-mc">
        Across <b>{mc.trials.toLocaleString("en-US")}</b> futures simulated
        year&#8209;by&#8209;year, buying wins{" "}
        <b style={{ color: mc.pBuyWins >= 0.5 ? "var(--buy)" : "var(--rent)" }}>{Math.round(mc.pBuyWins * 100)}%</b> of
        the time. Median outcome {signed(mc.median)}; the middle 80% span{" "}
        {signed(mc.p10)} to {signed(mc.p90)}.
      </p>
    </section>
  );
}

// ───────────────────────────── break-even chart ───────────────────────────

function BreakEvenChart({ proj, horizonMonths }: { proj: ReturnType<typeof project>; horizonMonths: number }): JSX.Element {
  const W = 320;
  const H = 150;
  const padL = 6; const padR = 6; const padT = 10; const padB = 16;
  const months = proj.months;

  let yMin = 0; let yMax = 0;
  for (const m of months) {
    yMin = Math.min(yMin, m.buyerNetWorth, m.renterNetWorth);
    yMax = Math.max(yMax, m.buyerNetWorth, m.renterNetWorth);
  }
  const ySpan = yMax - yMin || 1;
  const x = (month: number): number => padL + ((month - 1) / Math.max(1, horizonMonths - 1)) * (W - padL - padR);
  const y = (v: number): number => padT + (1 - (v - yMin) / ySpan) * (H - padT - padB);

  const line = (pick: (m: MonthPoint) => Cents): string =>
    months.map((m, i) => `${i === 0 ? "M" : "L"}${x(m.month).toFixed(1)},${y(pick(m)).toFixed(1)}`).join(" ");

  const buyerPath = line((m) => m.buyerNetWorth);
  const renterPath = line((m) => m.renterNetWorth);

  // shaded area between the two curves
  const area = [
    ...months.map((m) => `${x(m.month).toFixed(1)},${y(m.buyerNetWorth).toFixed(1)}`),
    ...[...months].reverse().map((m) => `${x(m.month).toFixed(1)},${y(m.renterNetWorth).toFixed(1)}`),
  ].join(" ");

  const be = proj.breakEvenMonth;
  const zeroY = yMin < 0 && yMax > 0 ? y(0) : null;
  const aheadIsBuy = months[months.length - 1]!.difference >= 0;

  return (
    <section className="rb-card">
      <h3 className="rb-card-title">Net worth over time</h3>
      <p className="rb-card-sub">
        What each path is worth if you sold that year. They cross at break-even:
        before it, renting is ahead; after, buying pulls away.
      </p>
      <div className="rb-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="rb-chart-svg" role="img" aria-label="Net worth of buying versus renting over time">
          <polygon points={area} fill={aheadIsBuy ? "var(--buy-soft)" : "var(--rent-soft)"} opacity={0.5} />
          {zeroY !== null ? <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--line-2)" strokeWidth={0.5} strokeDasharray="2 2" /> : null}
          {be !== null ? (
            <line x1={x(be)} y1={padT} x2={x(be)} y2={H - padB} stroke="var(--accent)" strokeWidth={0.8} strokeDasharray="3 2" />
          ) : null}
          <path d={renterPath} fill="none" stroke="var(--rent)" strokeWidth={1.4} />
          <path d={buyerPath} fill="none" stroke="var(--buy)" strokeWidth={1.4} />
        </svg>
        <div className="rb-chart-axis">
          <span>Year 0</span>
          {be !== null ? <span className="rb-be-label">break-even ≈ {(be / 12).toFixed(1)} yr</span> : <span className="rb-be-label">no break-even in horizon</span>}
          <span>Year {Math.round(horizonMonths / 12)}</span>
        </div>
        <div className="rb-legend">
          <span><i style={{ background: "var(--buy)" }} /> Buy · {fmtCompact(months[months.length - 1]!.buyerNetWorth)}</span>
          <span><i style={{ background: "var(--rent)" }} /> Rent · {fmtCompact(months[months.length - 1]!.renterNetWorth)}</span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── tornado ──────────────────────────────────

const DRIVER_LABEL: Record<string, string> = {
  homeAppreciationPct: "home appreciation",
  investmentReturnPct: "market return",
  rentGrowthPct: "rent growth",
};

function Tornado({ sens }: { sens: Sensitivity }): JSX.Element {
  const W = 100;
  let lo = sens.base.terminalDifference;
  let hi = sens.base.terminalDifference;
  for (const t of sens.tornado) {
    lo = Math.min(lo, t.lowDifference, t.highDifference);
    hi = Math.max(hi, t.lowDifference, t.highDifference);
  }
  const span = hi - lo || 1;
  const pad = span * 0.06;
  const x = (v: number): number => ((v - (lo - pad)) / (span + 2 * pad)) * W;
  const baseX = x(sens.base.terminalDifference);

  return (
    <section className="rb-card">
      <h3 className="rb-card-title">What the answer hinges on</h3>
      <p className="rb-card-sub">
        How far the result swings when each assumption alone moves across its
        band. The longest bar is the one you're really betting on.
      </p>
      <div className="rb-tornado">
        {sens.tornado.map((t) => {
          const a = x(t.lowDifference);
          const b = x(t.highDifference);
          const left = Math.min(a, b);
          const width = Math.max(1, Math.abs(b - a));
          return (
            <div className="rb-tornado-row" key={t.key}>
              <div className="rb-tornado-name">
                {DRIVER_LABEL[t.key] ?? t.key}
                <span className="rb-tornado-band">{t.low}% → {t.high}%</span>
              </div>
              <div className="rb-tornado-track">
                <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" className="rb-tornado-svg">
                  <line x1={baseX} y1={0} x2={baseX} y2={14} stroke="var(--ink)" strokeWidth={0.5} opacity={0.5} />
                  <rect x={left} y={3.5} width={width} height={7} rx={0.6} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={0.5} />
                </svg>
              </div>
              <div className="rb-tornado-swing">{fmtCompact(t.swing)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────────── disclosures ────────────────────────────────

function Disclosures({ region }: { region: Region }): JSX.Element {
  return (
    <details className="rb-disclose">
      <summary>What this model deliberately doesn't pretend to know</summary>
      <ul>
        <li><b>Fixed rate, no refinancing.</b> No ARMs and no rate path, just a forecast on top of a forecast.</li>
        <li><b>Deterministic, not Monte Carlo.</b> The range comes from sweeping assumptions, not simulating market volatility, so it understates tail risk on the invested side.</li>
        {region === "UK" ? (
          <>
            <li><b>Rent is derived from yield, not a listing.</b> Each example rent is price × gross&nbsp;yield ÷ 12 using published London/Winchester yields: a transparent estimate, not the asking price of a specific flat. Yields compress at the top, which is modelled.</li>
            <li><b>Council tax is an area-representative band figure.</b> England's bands are frozen at 1991 values, so it barely tracks today's price; treat the default as a starting point and set your own.</li>
            <li><b>SDLT is the standard owner-occupier rate.</b> First-time-buyer relief (only ≤£500k) and the +5% additional-property surcharge for a second home or buy-to-let aren't applied to these primary-residence profiles.</li>
            <li><b>No mortgage-interest relief.</b> Correct for UK owner-occupiers (it was abolished), so unlike the US model there's no deduction to flatter buying.</li>
          </>
        ) : (
          <>
            <li><b>The tax deduction is simplified and off by default.</b> It ignores the SALT cap and the standard-deduction crossover - the two things that shrink the real benefit - so it won't overstate buying unless you opt in with a marginal rate.</li>
            <li><b>Property tax tracks market value.</b> Places with assessment caps (California's Prop 13) would tax more slowly than this assumes.</li>
          </>
        )}
      </ul>
    </details>
  );
}

// ─────────────────────────────── tokens ───────────────────────────────────

function Tokens(): JSX.Element {
  return (
    <style>{`
      :root {
        --bg:#ffffff; --panel:#ffffff; --panel-2:#f3f4f6; --line:#e6e8eb; --line-2:#d2d6db;
        --ink:#0f1419; --text:#343b43; --dim:#697079; --dim-2:#9aa1a9;
        --accent:#1b4a7a; --accent-soft:rgba(27,74,122,0.09);
        --buy:#1f6b45; --buy-soft:rgba(31,107,69,0.10);
        --rent:#a5344a; --rent-soft:rgba(165,52,74,0.10);
        --sans: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
        --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          --bg:#0c0e11; --panel:#121519; --panel-2:#181c21; --line:#232930; --line-2:#333b43;
          --ink:#eef1f4; --text:#bfc5cc; --dim:#7f868e; --dim-2:#565d64;
          --accent:#6aa2db; --accent-soft:rgba(106,162,219,0.14);
          --buy:#519b70; --buy-soft:rgba(81,155,112,0.16);
          --rent:#cf6f80; --rent-soft:rgba(207,111,128,0.16);
        }
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--bg); }
      .rb-page { min-height: 100vh; background: var(--bg); color: var(--text);
        font-family: var(--sans); font-size: 14px; line-height: 1.55;
        font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
      .rb-shell { max-width: 1160px; margin: 0 auto; padding: 48px 24px 72px; }
      .rb-header { margin-bottom: 34px; }
      .rb-header-top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; max-width: 1160px; }
      .rb-header-actions { display: flex; gap: 8px; align-items: center; }
      .rb-ghost-btn { font-family: var(--mono); font-size: 12px; color: var(--text); background: transparent;
        border: 1px solid var(--line-2); border-radius: 5px; padding: 6px 11px; cursor: pointer; transition: border-color .12s, color .12s; }
      .rb-ghost-btn:hover { border-color: var(--ink); color: var(--ink); }
      .rb-wordmark { font-family: var(--sans); font-weight: 600; color: var(--ink);
        font-size: 25px; letter-spacing: -0.02em; margin: 0; }
      .rb-tagline { font-size: 15.5px; color: var(--dim); margin: 14px 0 0; max-width: 60ch; line-height: 1.5; }

      .rb-grid { display: grid; grid-template-columns: 336px minmax(0, 1fr); gap: 32px; align-items: start; }
      @media (max-width: 900px) { .rb-grid { grid-template-columns: minmax(0,1fr); } }

      /* inputs */
      .rb-inputs { display: flex; flex-direction: column; gap: 18px;
        background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
      .rb-group-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.02em;
        color: var(--dim); margin: 0 0 12px; font-weight: 500; }
      .rb-group-body { display: flex; flex-direction: column; gap: 11px; }
      .rb-group + .rb-group { border-top: 1px solid var(--line); padding-top: 18px; }
      .rb-field { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
      .rb-field-label { font-size: 13px; color: var(--text); }
      .rb-field-note { grid-column: 1 / -1; font-family: var(--mono); font-size: 11px; color: var(--dim-2); text-align: right; margin-top: -4px; }
      .rb-input { font-family: var(--mono); font-size: 13px; color: var(--ink); background: var(--panel-2); border: 1px solid var(--line-2);
        border-radius: 5px; padding: 6px 8px; width: 100%; text-align: right; }
      .rb-input:focus { outline: none; border-color: var(--accent); }
      .rb-money-input, .rb-num-input { display: inline-flex; align-items: center; gap: 4px; width: 128px; }
      .rb-money-sign { font-family: var(--mono); color: var(--dim); font-size: 13px; }
      .rb-money-input .rb-input { text-align: right; }
      .rb-num-input { position: relative; }
      .rb-suffix { font-family: var(--mono); color: var(--dim); font-size: 12px; width: 20px; }
      .rb-num-accent .rb-input { border-color: var(--accent); background: var(--accent-soft); }
      .rb-filing { display: inline-flex; border: 1px solid var(--line-2); border-radius: 5px; overflow: hidden; }
      .rb-seg { font-family: var(--mono); font-size: 12px; color: var(--dim);
        background: transparent; border: none; padding: 6px 12px; cursor: pointer; }
      .rb-seg + .rb-seg { border-left: 1px solid var(--line-2); }
      .rb-seg-on { background: var(--ink); color: var(--bg); font-weight: 500; }
      input[type=number] { -moz-appearance: textfield; }
      input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .rb-payline { font-family: var(--mono); font-size: 12px; color: var(--dim); margin-top: 2px; }
      .rb-payline b { color: var(--ink); font-weight: 500; }

      .rb-field-slider { grid-template-columns: 1fr; gap: 7px; }
      .rb-slider-value { float: right; font-family: var(--mono); color: var(--ink); font-weight: 500; }
      .rb-slider-value-big { font-family: var(--mono); font-size: 15px; }
      .rb-slider-note { font-family: var(--mono); color: var(--dim-2); font-weight: 400; }
      .rb-range { width: 100%; accent-color: var(--accent); }

      /* answer */
      .rb-answer { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
      .rb-presets { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .rb-presets-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.02em; color: var(--dim); }
      .rb-presets-chips { display: flex; gap: 7px; flex-wrap: wrap; }
      .rb-chip { font-family: var(--mono); font-size: 12px; color: var(--text); background: transparent;
        border: 1px solid var(--line-2); border-radius: 5px; padding: 5px 10px; cursor: pointer; transition: border-color .12s, color .12s; }
      .rb-chip:hover { border-color: var(--ink); color: var(--ink); }
      .rb-chip-on { background: var(--ink); border-color: var(--ink); color: var(--bg); font-weight: 500; }
      .rb-uk-presets { display: flex; flex-direction: column; gap: 10px; }
      .rb-uk-presets .rb-presets { justify-content: space-between; }
      .rb-uk-note { font-size: 11.5px; color: var(--dim-2); margin: 0; max-width: 66ch; line-height: 1.45; }
      .rb-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 22px; }
      .rb-card-title { font-family: var(--sans); font-size: 16px; color: var(--ink); margin: 0 0 5px; font-weight: 600; letter-spacing: -0.01em; }
      .rb-card-sub { font-size: 13px; color: var(--dim); margin: 0 0 18px; max-width: 64ch; line-height: 1.5; }

      .rb-verdict { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 26px; }
      .rb-verdict-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .rb-verdict-kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.02em; color: var(--dim); }
      .rb-verdict-word { font-family: var(--sans); font-weight: 600; font-size: 40px; line-height: 1; letter-spacing: -0.02em; }
      .rb-verdict-sentence { font-size: 15px; color: var(--text); margin: 16px 0 22px; max-width: 64ch; line-height: 1.55; }
      .rb-verdict-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; border-top: 1px solid var(--line); padding-top: 18px; }
      @media (max-width: 560px) { .rb-verdict-stats { grid-template-columns: repeat(2, 1fr); } }
      .rb-stat-label { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.02em; color: var(--dim); }
      .rb-stat-value { font-family: var(--mono); font-size: 21px; font-weight: 500; color: var(--ink); margin-top: 5px; }
      .rb-stat-note { font-family: var(--mono); font-size: 10.5px; color: var(--dim-2); }

      /* range bar */
      .rb-rangebar { margin-top: 4px; }
      .rb-rangebar-svg { width: 100%; height: 30px; display: block; }
      .rb-rangebar-labels { position: relative; height: 36px; margin-top: 2px; font-family: var(--mono); font-size: 12px; }
      .rb-rangebar-labels em { display: block; font-style: normal; font-size: 10px; letter-spacing: 0.02em; color: var(--dim-2); }
      .rb-range-worst { position: absolute; left: 0; color: var(--rent); }
      .rb-range-best { position: absolute; right: 0; text-align: right; color: var(--buy); }
      .rb-range-base { position: absolute; transform: translateX(-50%); text-align: center; color: var(--accent); }
      .rb-mc { font-size: 13px; color: var(--text); margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--line); line-height: 1.55; }
      .rb-mc b { color: var(--ink); font-family: var(--mono); font-weight: 500; }

      /* chart */
      .rb-chart-svg { width: 100%; height: auto; display: block; }
      .rb-chart-axis { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10.5px; color: var(--dim); margin-top: 4px; }
      .rb-be-label { color: var(--accent); }
      .rb-legend { display: flex; gap: 18px; margin-top: 12px; font-family: var(--mono); font-size: 11.5px; color: var(--text); }
      .rb-legend i { display: inline-block; width: 14px; height: 2.5px; border-radius: 1px; margin-right: 7px; vertical-align: middle; }

      /* tornado */
      .rb-tornado { display: flex; flex-direction: column; gap: 11px; }
      .rb-tornado-row { display: grid; grid-template-columns: 150px minmax(0,1fr) 60px; align-items: center; gap: 10px; }
      .rb-tornado-name { font-size: 13px; color: var(--ink); }
      .rb-tornado-band { display: block; font-family: var(--mono); font-size: 10.5px; color: var(--dim-2); }
      .rb-tornado-svg { width: 100%; height: 16px; display: block; }
      .rb-tornado-swing { font-family: var(--mono); font-size: 12px; color: var(--text); text-align: right; }
      @media (max-width: 560px) { .rb-tornado-row { grid-template-columns: 110px minmax(0,1fr) 52px; } }

      /* disclosures */
      .rb-disclose { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px 22px; }
      .rb-disclose summary { cursor: pointer; font-size: 13px; color: var(--ink); font-weight: 600; }
      .rb-disclose ul { margin: 14px 0 2px; padding-left: 18px; color: var(--text); font-size: 13px; }
      .rb-disclose li { margin-bottom: 9px; line-height: 1.55; }
      .rb-disclose b { color: var(--ink); }

      .rb-footer { margin-top: 44px; font-size: 12px; color: var(--dim-2); max-width: 62ch; line-height: 1.55; }
    `}</style>
  );
}
