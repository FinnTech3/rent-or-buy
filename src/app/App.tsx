/**
 * The one screen. An editorial, calm rent-vs-buy calculator that refuses to
 * hand you a single number: it shows the verdict, the honest range around it,
 * the break-even year, and which assumption the answer is actually hostage to.
 *
 * All the economics live in ../lib (project / analyse / verdict). This file is
 * inputs and presentation only — no financial logic. The design language is a
 * deliberate contrast to orderbook-live's trading-terminal density: warm
 * paper, a serif display voice, one accent, honest charts.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DEFAULTS, PRESETS, buildInputs } from "./form.js";
import type { FormState } from "./form.js";
import { decode, encode } from "./urlState.js";
import { formatUSD, formatUSD0 } from "../lib/money.js";
import type { Cents } from "../lib/money.js";
import { monthlyPayment } from "../lib/mortgage.js";
import { project, terminal } from "../lib/model.js";
import type { Inputs, MonthPoint } from "../lib/model.js";
import { analyse, verdict } from "../lib/sensitivity.js";
import type { Sensitivity, Verdict } from "../lib/sensitivity.js";
import { simulate } from "../lib/montecarlo.js";
import type { MonteCarloResult } from "../lib/montecarlo.js";

// ─────────────────────────── formatting ───────────────────────────────────

function fmtCompact(cents: Cents): string {
  const d = cents / 100;
  const a = Math.abs(d);
  const s = d < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}k`;
  return `${s}$${a.toFixed(0)}`;
}

function signed(cents: Cents): string {
  return `${cents >= 0 ? "+" : "−"}${formatUSD0(Math.abs(cents))}`;
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
  const mc = useMemo(() => simulate(inputs, horizonMonths, { trials: 800 }), [inputs, horizonMonths]);
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

  return (
    <>
      <Tokens />
      <div className="rb-page">
        <div className="rb-shell">
          <header className="rb-header">
            <div className="rb-header-top">
              <h1 className="rb-wordmark">rent&nbsp;or&nbsp;buy</h1>
              <div className="rb-header-actions">
                <CopyLink />
                <button className="rb-ghost-btn" onClick={() => setForm(DEFAULTS)}>Reset</button>
              </div>
            </div>
            <p className="rb-tagline">
              The honest version. Not “is the mortgage cheaper than rent?” but
              “which leaves you wealthier when you sell — and how sure can you
              be?”
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
              <Disclosures />
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
  const downPayment = Math.round(props.inputs.homePrice * (form.downPaymentPct / 100));

  return (
    <aside className="rb-inputs">
      <Group title="The home">
        <MoneyField label="Home price" value={form.homePrice} onChange={(v) => set("homePrice", v)} />
        <SliderField label="Down payment" value={form.downPaymentPct} onChange={(v) => set("downPaymentPct", v)}
          min={0} max={50} step={1} suffix="%" note={formatUSD0(downPayment)} />
        <NumberField label="Mortgage rate" value={form.mortgageRatePct} onChange={(v) => set("mortgageRatePct", v)} step={0.125} suffix="%" />
        <NumberField label="Loan term" value={form.termYears} onChange={(v) => set("termYears", v)} step={5} suffix="yr" />
        <div className="rb-payline">Monthly principal &amp; interest: <b>{formatUSD(props.payment)}</b></div>
      </Group>

      <Group title="Owning costs">
        <NumberField label="Closing costs (buy)" value={form.closingCostsBuyPct} onChange={(v) => set("closingCostsBuyPct", v)} step={0.5} suffix="%" />
        <NumberField label="Selling costs" value={form.sellingCostsPct} onChange={(v) => set("sellingCostsPct", v)} step={0.5} suffix="%" />
        <NumberField label="Property tax / yr" value={form.propertyTaxPct} onChange={(v) => set("propertyTaxPct", v)} step={0.1} suffix="%" />
        <NumberField label="Maintenance / yr" value={form.maintenancePct} onChange={(v) => set("maintenancePct", v)} step={0.25} suffix="%" />
        <MoneyField label="Home insurance / yr" value={form.homeInsuranceAnnual} onChange={(v) => set("homeInsuranceAnnual", v)} />
        <MoneyField label="HOA / mo" value={form.hoaMonthly} onChange={(v) => set("hoaMonthly", v)} />
        <NumberField label="PMI / yr (under 20% down)" value={form.pmiRatePct} onChange={(v) => set("pmiRatePct", v)} step={0.1} suffix="%" />
      </Group>

      <Group title="Renting">
        <MoneyField label="Rent / mo" value={form.monthlyRent} onChange={(v) => set("monthlyRent", v)} />
        <NumberField label="Rent growth / yr" value={form.rentGrowthPct} onChange={(v) => set("rentGrowthPct", v)} step={0.5} suffix="%" />
        <MoneyField label="Renters insurance / mo" value={form.rentersInsuranceMonthly} onChange={(v) => set("rentersInsuranceMonthly", v)} />
      </Group>

      <Group title="The world (the guesses that matter)">
        <NumberField label="Home appreciation / yr" value={form.homeAppreciationPct} onChange={(v) => set("homeAppreciationPct", v)} step={0.5} suffix="%" accent />
        <NumberField label="Investment return / yr" value={form.investmentReturnPct} onChange={(v) => set("investmentReturnPct", v)} step={0.5} suffix="%" accent />
        <NumberField label="Inflation / yr" value={form.inflationPct} onChange={(v) => set("inflationPct", v)} step={0.25} suffix="%" />
        <NumberField label="Marginal tax rate (deduction)" value={form.marginalTaxRatePct} onChange={(v) => set("marginalTaxRatePct", v)} step={1} suffix="%" />
      </Group>

      <Group title="Horizon">
        <SliderField label="Years until you'd sell" value={form.horizonYears} onChange={(v) => set("horizonYears", v)}
          min={1} max={30} step={1} suffix="yr" note="" big />
      </Group>
    </aside>
  );
}

function PresetRow(props: { current: FormState; onPick: (f: FormState) => void }): JSX.Element {
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
      <span className="rb-money-sign">$</span>
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
    ? `Over ${props.horizonYears} years, ${winner} edges ahead by ${formatUSD0(Math.abs(diff))} — but the plausible range runs from ${signed(sens.worst)} to ${signed(sens.best)}. This is close to a coin flip, and it hinges mostly on ${driverLabel}.`
    : `Over ${props.horizonYears} years, ${VERDICT_COPY[call].word.toLowerCase()}ing wins across every plausible assumption — from ${signed(sens.worst)} in the worst case to ${signed(sens.best)} in the best. The result is driven mostly by ${driverLabel}.`;

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
        Across <b>{mc.trials.toLocaleString("en-US")}</b> simulated futures,
        buying wins <b style={{ color: mc.pBuyWins >= 0.5 ? "var(--buy)" : "var(--rent)" }}>{Math.round(mc.pBuyWins * 100)}%</b> of
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
        What each path is worth if you sold that year. They cross at break-even
        — before it, renting is ahead; after, buying pulls away.
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

function Disclosures(): JSX.Element {
  return (
    <details className="rb-disclose">
      <summary>What this model deliberately doesn't pretend to know</summary>
      <ul>
        <li><b>The tax deduction is simplified and off by default.</b> It ignores the SALT cap and the standard-deduction crossover — the two things that shrink the real benefit — so it won't overstate buying unless you opt in with a marginal rate.</li>
        <li><b>Fixed rate, no refinancing.</b> No ARMs and no rate path — a forecast on top of a forecast.</li>
        <li><b>Deterministic, not Monte Carlo.</b> The range comes from sweeping assumptions, not simulating market volatility, so it understates tail risk on the invested side.</li>
        <li><b>Property tax tracks market value.</b> Places with assessment caps (California's Prop 13) would tax more slowly than this assumes.</li>
      </ul>
    </details>
  );
}

// ─────────────────────────────── tokens ───────────────────────────────────

function Tokens(): JSX.Element {
  return (
    <style>{`
      :root {
        --bg:#faf9f7; --panel:#ffffff; --panel-2:#f4f2ee; --line:#e7e3dd; --line-2:#d6d1c8;
        --ink:#1a1d1f; --text:#3c4043; --dim:#6b7075; --dim-2:#9a9ea3;
        --accent:#1f6f78; --accent-soft:rgba(31,111,120,0.14);
        --buy:#2f7d55; --buy-soft:rgba(47,125,85,0.14);
        --rent:#b5673f; --rent-soft:rgba(181,103,63,0.14);
        --serif: Georgia, 'Times New Roman', 'Iowan Old Style', serif;
        --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          --bg:#14171a; --panel:#1b1f23; --panel-2:#20252a; --line:#2a2f34; --line-2:#39414a;
          --ink:#eef1f3; --text:#c3c8cc; --dim:#868d93; --dim-2:#5f676d;
          --accent:#4fb3bf; --accent-soft:rgba(79,179,191,0.16);
          --buy:#5aa87a; --buy-soft:rgba(90,168,122,0.16);
          --rent:#cc8a63; --rent-soft:rgba(204,138,99,0.16);
        }
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--bg); }
      .rb-page { min-height: 100vh; background: var(--bg); color: var(--text);
        font-family: var(--sans); font-size: 14px; line-height: 1.5;
        font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
      .rb-shell { max-width: 1180px; margin: 0 auto; padding: 40px 24px 64px; }
      .rb-header { margin-bottom: 28px; }
      .rb-header-top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; max-width: 1180px; }
      .rb-header-actions { display: flex; gap: 8px; }
      .rb-ghost-btn { font: inherit; font-size: 12px; color: var(--accent); background: transparent;
        border: 1px solid var(--line-2); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
      .rb-ghost-btn:hover { border-color: var(--accent); background: var(--accent-soft); }
      .rb-wordmark { font-family: var(--serif); font-weight: 700; color: var(--ink);
        font-size: 38px; letter-spacing: -0.01em; margin: 0 0 8px; }
      .rb-tagline { font-size: 16px; color: var(--dim); margin: 8px 0 0; max-width: 56ch; }

      .rb-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 28px; align-items: start; }
      @media (max-width: 900px) { .rb-grid { grid-template-columns: minmax(0,1fr); } }

      /* inputs */
      .rb-inputs { display: flex; flex-direction: column; gap: 18px;
        background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px; }
      .rb-group-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--dim); margin: 0 0 10px; font-weight: 600; }
      .rb-group-body { display: flex; flex-direction: column; gap: 10px; }
      .rb-group + .rb-group { border-top: 1px solid var(--line); padding-top: 16px; }
      .rb-field { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
      .rb-field-label { font-size: 13px; color: var(--text); }
      .rb-field-note { grid-column: 1 / -1; font-size: 11px; color: var(--dim-2); text-align: right; margin-top: -4px; }
      .rb-input { font: inherit; color: var(--ink); background: var(--panel-2); border: 1px solid var(--line-2);
        border-radius: 6px; padding: 5px 8px; width: 100%; text-align: right; }
      .rb-input:focus { outline: none; border-color: var(--accent); }
      .rb-money-input, .rb-num-input { display: inline-flex; align-items: center; gap: 4px; width: 128px; }
      .rb-money-sign { color: var(--dim); font-size: 13px; }
      .rb-money-input .rb-input { text-align: right; }
      .rb-num-input { position: relative; }
      .rb-suffix { color: var(--dim); font-size: 12px; width: 20px; }
      .rb-num-accent .rb-input { border-color: var(--accent); background: var(--accent-soft); }
      input[type=number] { -moz-appearance: textfield; }
      input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .rb-payline { font-size: 12px; color: var(--dim); margin-top: 2px; }
      .rb-payline b { color: var(--ink); }

      .rb-field-slider { grid-template-columns: 1fr; gap: 6px; }
      .rb-slider-value { float: right; color: var(--ink); font-weight: 600; }
      .rb-slider-value-big { font-family: var(--serif); font-size: 16px; }
      .rb-slider-note { color: var(--dim-2); font-weight: 400; }
      .rb-range { width: 100%; accent-color: var(--accent); }

      /* answer */
      .rb-answer { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
      .rb-presets { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .rb-presets-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
      .rb-presets-chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .rb-chip { font: inherit; font-size: 12px; color: var(--text); background: var(--panel);
        border: 1px solid var(--line-2); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
      .rb-chip:hover { border-color: var(--accent); color: var(--ink); }
      .rb-chip-on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
      .rb-card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px; }
      .rb-card-title { font-family: var(--serif); font-size: 18px; color: var(--ink); margin: 0 0 4px; font-weight: 600; }
      .rb-card-sub { font-size: 13px; color: var(--dim); margin: 0 0 16px; max-width: 62ch; }

      .rb-verdict { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 24px; }
      .rb-verdict-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .rb-verdict-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--dim); }
      .rb-verdict-word { font-family: var(--serif); font-weight: 700; font-size: 44px; line-height: 1; letter-spacing: -0.01em; }
      .rb-verdict-sentence { font-size: 15px; color: var(--text); margin: 14px 0 20px; max-width: 62ch; }
      .rb-verdict-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; border-top: 1px solid var(--line); padding-top: 16px; }
      @media (max-width: 560px) { .rb-verdict-stats { grid-template-columns: repeat(2, 1fr); } }
      .rb-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); }
      .rb-stat-value { font-family: var(--serif); font-size: 22px; color: var(--ink); margin-top: 3px; }
      .rb-stat-note { font-size: 11px; color: var(--dim-2); }

      /* range bar */
      .rb-rangebar { margin-top: 4px; }
      .rb-rangebar-svg { width: 100%; height: 30px; display: block; }
      .rb-rangebar-labels { position: relative; height: 34px; margin-top: 2px; font-size: 12px; }
      .rb-rangebar-labels em { display: block; font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim-2); }
      .rb-range-worst { position: absolute; left: 0; color: var(--rent); }
      .rb-range-best { position: absolute; right: 0; text-align: right; color: var(--buy); }
      .rb-range-base { position: absolute; transform: translateX(-50%); text-align: center; color: var(--accent); }
      .rb-mc { font-size: 13px; color: var(--text); margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--line); }
      .rb-mc b { color: var(--ink); }

      /* chart */
      .rb-chart-svg { width: 100%; height: auto; display: block; }
      .rb-chart-axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: 4px; }
      .rb-be-label { color: var(--accent); }
      .rb-legend { display: flex; gap: 18px; margin-top: 10px; font-size: 12px; color: var(--text); }
      .rb-legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

      /* tornado */
      .rb-tornado { display: flex; flex-direction: column; gap: 10px; }
      .rb-tornado-row { display: grid; grid-template-columns: 150px minmax(0,1fr) 56px; align-items: center; gap: 10px; }
      .rb-tornado-name { font-size: 13px; color: var(--ink); }
      .rb-tornado-band { display: block; font-size: 11px; color: var(--dim-2); }
      .rb-tornado-svg { width: 100%; height: 16px; display: block; }
      .rb-tornado-swing { font-size: 12px; color: var(--text); text-align: right; }
      @media (max-width: 560px) { .rb-tornado-row { grid-template-columns: 110px minmax(0,1fr) 48px; } }

      /* disclosures */
      .rb-disclose { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 20px; }
      .rb-disclose summary { cursor: pointer; font-size: 13px; color: var(--accent); font-weight: 600; }
      .rb-disclose ul { margin: 12px 0 2px; padding-left: 18px; color: var(--text); font-size: 13px; }
      .rb-disclose li { margin-bottom: 8px; }
      .rb-disclose b { color: var(--ink); }

      .rb-footer { margin-top: 40px; font-size: 12px; color: var(--dim-2); max-width: 60ch; }
    `}</style>
  );
}
