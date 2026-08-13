# rent-or-buy

An honest rent-vs-buy calculator. It answers the question the popular ones
dodge: **not** "is my mortgage payment less than rent?" but "which choice
leaves me wealthier by the time I'd sell — and how much does that answer
depend on things nobody can actually know?"

The headline finding this tool exists to make unavoidable: for a typical
scenario the decision is often a **coin flip that hinges almost entirely on
home appreciation**, an assumption every calculator quietly hard-codes and
nobody can forecast. So this one refuses to hand you a single number. It
hands you a range, a break-even year, and a ranking of which assumption your
answer is hostage to.

**Live calculator:** https://finntech3.github.io/rent-or-buy/

![The calculator: verdict, honest range, and the net-worth curves crossing at break-even](docs/screenshots/calculator-light.png)

```
$ npm run analyze 10

  RENT-OR-BUY — $400,000 home, 10-year horizon

Break-even (buying pulls ahead)  8.3 yr (month 99)
Difference (buy − rent)          +$11,746

  VERDICT: TOSS-UP
  Honest range (worst … best)    -$139,284 … $173,291
  Buying wins in                 52% of the swept scenarios

  What the answer hinges on (biggest swing first):
    homeAppreciationPct          1.5% → 5.5%  swings $180,827
    investmentReturnPct          4% → 8%      swings  $81,504
    rentGrowthPct                1.5% → 4.5%  swings  $50,216
```

That $12k "buying wins" headline is real — and meaningless on its own, next
to a band from −$139k to +$173k driven by an appreciation rate you're
guessing at. Showing that is the entire point.

## What's here

- `src/lib/money.ts` — money as integer cents, never floats.
- `src/lib/mortgage.ts` — fixed-rate amortization, verified against textbook
  figures and self-checked to pay the loan off to the exact cent.
- `src/lib/model.ts` — the net-worth projection: both paths on identical
  cash-flow footing, month by month, with each month's point already
  carrying the net worth of selling then (so break-even falls out of one
  pass).
- `src/lib/sensitivity.ts` — the range and the tornado: sweep the three
  drivers that matter, report the outcome band and which assumption swings
  it most.
- `src/lib/montecarlo.ts` / `src/lib/montecarloPaths.ts` — Monte Carlo two
  ways: one draws each driver's horizon-average rate; the other (the one the
  UI uses) draws a fresh return *every year* and compounds it month by month,
  capturing sequence-of-returns risk. Both report the probability buying wins
  and the middle-80% dollar span; a test pins the path engine to the
  deterministic model at zero volatility.
- `src/cli/analyze.ts` — the headless report above. `npm run analyze [years]`.
- 98 tests, including the economics moving the right way in every direction,
  the SDLT bands checked against gov.uk, and the UK profile rents cross-checked
  against published average rents.

## Running

```
npm install
npm test              # 98 tests, all green
npm run analyze 10    # the report, for a 10-year horizon
```

## UK mode — London & Winchester, on real data

The tool speaks two countries. Flip the header switch to **🇬🇧 UK** and the whole
engine changes to match, because the honest UK answer isn't the US one in
pounds:

- **Stamp Duty (SDLT)** replaces US closing costs as the big irrecoverable cost
  of buying — £43,750 on a £1m home, £273,750 on a £3m one, computed from the
  gov.uk bands (`src/lib/sdlt.ts`).
- **Council tax** — a flat banded charge — replaces US property tax as a
  percentage of value.
- **No mortgage-interest relief**, because UK owner-occupiers get none. Unlike
  the US model there's simply no deduction to flatter buying.

It ships with **example profiles built from real UK data**: six price points
(£600k–£3m) across London and Winchester, six personas from first home to
ultra-prime. Pick a city and a persona and the scenario loads. The rents aren't
typed in — each is `price × published gross yield ÷ 12`, and the yields are
sourced (Savills/Cluttons for London, PropertyInvestmentsUK for Winchester). The
full audit trail, every figure and its source, is in
[`docs/UK-DATA-SOURCES.md`](docs/UK-DATA-SOURCES.md).

The regional contrast is the interesting part: the *same* £1m house rents for
£3,500/mo in London (4.2% yield) but £2,667 in Winchester (3.2%), while
Winchester's council tax runs higher — so the rent-vs-buy verdict genuinely
flips between two English cities on the same budget.

![The UK calculator: a £1m London family home, £43,750 stamp duty, council tax and rent from real yields](docs/screenshots/uk-london-light.png)

A written [feature specification](docs/FEATURE-SPEC.md) sketches where this goes
next — income-based personas, measuring your inflation basket from an uploaded
bank statement, and analysing a pasted property-listing URL — with the
data-handling limits each would carry.

## The method

Both a buyer and a renter start with the same resources and are held to the
same monthly budget, so the comparison is apples to apples:

- The **renter** invests, from day one, the exact cash the buyer sinks and
  can't get back — the down payment plus the buyer's closing costs — and it
  compounds at the market return.
- Each month, whichever party spends **less** on housing invests the
  surplus at that same return. Early on that's usually the renter; once rent
  climbs past the (mostly fixed) cost of owning, it flips to the buyer.
- At any month the buyer could sell: their **home equity** — sale price
  minus selling costs minus the remaining loan — is netted against their
  side investments and compared to the renter's portfolio.

The buyer's edge is forced saving and leverage on appreciation; the renter's
edge is a large liquid sum invested from day one and no transaction costs.
Which wins is genuinely uncertain, which is why the output is a range.

**The tax deduction is modeled honestly, which usually means it's worth
nothing.** "You get to write off the mortgage interest" is the most-repeated
reason to buy and the most overstated. The engine only credits the marginal
rate on the amount by which itemizing *beats* the standard deduction, after
capping state-and-local taxes at the $10k SALT limit — and for a normal
household, post-2018, itemized interest plus capped SALT falls short of the
~$30k standard deduction, so the benefit is exactly $0. It turns positive
only for large loans, high-tax states, or single filers. Showing that zero,
rather than a phantom write-off, is the point.

**Conventions that change the answer, stated plainly.** Home value and the
investment portfolios compound monthly. Rent, property tax, maintenance,
insurance and HOA step once a year, the way real leases and assessments do.
Property tax and maintenance track the *current* home value; insurance and
HOA track general inflation. Everything is integer cents, so interest and
growth accumulated over hundreds of months are exact rather than nearly so —
the same discipline as [orderbook-live](https://github.com/finntech3/orderbook-live)'s
integer tick grid, ported for the same reason.

## What it deliberately does not pretend to know

An honest tool is honest about its edges. This model, in its current form:

- **Assumes a fixed rate and no refinancing.** No ARMs, no rate path, no
  refi. A fixed 30-year is the honest default; the rest is a forecast on top
  of a forecast.
- **Grows property tax with market value.** Places with assessment caps
  (California's Prop 13, say) would tax more slowly than this assumes.

Each of these is a place the answer could move, and naming them is the point
rather than burying them.

## The calculator

`npm run dev` runs the interface locally; it's one editorial screen — a
scenario panel on the left, and on the right the verdict, the **honest range
bar**, a **net-worth chart** where the buyer and renter curves cross at
break-even, and a **tornado** ranking which assumption the answer is hostage
to. Every input recomputes everything live (a full sensitivity sweep is 27
cheap projections). The whole scenario lives in the URL, so any result is a
shareable link — tweak the inputs, copy the link, send someone your exact
case. Light by default, dark via `prefers-color-scheme`, no external fonts or
network calls — the engine runs entirely in the browser, so it deploys as
static files with no backend.

One-click **example scenarios** (a high-cost metro, a low-rate era, a 10%-down
starter, a case where renting clearly wins) sit above the answer — they exist
to make the point that the verdict flips with the situation rather than
pointing one way forever.

`src/app/App.tsx` is presentation only; it holds no financial logic, calling
the engine surface:

```ts
import { project, terminal } from "./lib/model";
import { analyse, verdict } from "./lib/sensitivity";

const proj = project(inputs, horizonMonths);   // per-month net-worth series
const end  = terminal(proj);                     // difference at the horizon
const sens = analyse(inputs, horizonMonths);     // range + tornado
verdict(sens);                                   // "buy" | "rent" | "toss-up"
```

## Tech

TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
· Vitest · zero runtime dependencies.
