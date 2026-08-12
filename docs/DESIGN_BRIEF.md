# Frontend design brief — rent-or-buy

Copy the block between the `---` markers and send it to Claude Design. The
response should be a single self-contained page (one React component tree, or
HTML + inline CSS/JS) that I'll wire to the finished engine below. The backend
is done and tested; the design layer needs to add no logic.

---

I'm building an honest rent-vs-buy calculator. Unlike the popular ones, it
refuses to reduce the decision to "is the mortgage cheaper than rent?" — it
computes which choice leaves you wealthier by the time you'd sell, and, more
importantly, shows the **range** of that answer across assumptions nobody can
actually forecast (home appreciation, market return, rent growth). The whole
point is intellectual honesty: for a typical scenario the result is often a
near coin-flip that hinges almost entirely on home-price appreciation, and the
design has to make that impossible to miss.

**Audience.** Two at once: hiring managers looking at my portfolio (this
should read as a serious, well-built product), and real people actually facing
the decision. So: trustworthy, editorial, calm. Think a beautifully made
newspaper interactive or a Wealthfront-grade calculator — not a crypto
dashboard, not a Bloomberg terminal. Clean, data-forward, generous
whitespace, one restrained accent color, excellent typography, honest charts.

**The screen.** A single page, no routes. Two regions:

1. **Inputs** (a calm left rail or a collapsible top panel): the scenario.
   Home price, down payment (as % and $), mortgage rate, term, buyer closing
   costs, selling costs %, property tax %, home insurance, maintenance %, HOA,
   home appreciation %, monthly rent, rent growth %, renters insurance,
   investment return %, inflation %, optional marginal tax rate, and a
   **horizon slider** (1–30 years). Everything ships with sensible defaults so
   the page is useful the instant it loads — nobody should have to fill in 18
   fields to see an answer. Group them; don't wall-of-form them.

2. **The answer** (the hero, given the most room):
   - A **verdict** — BUY / RENT / TOSS-UP — stated plainly, with a one-sentence
     plain-English summary underneath ("Over 10 years, buying comes out ahead
     by about $12k — but anywhere from −$139k to +$173k depending mostly on
     home appreciation. This is close to a coin flip.").
   - The **honest range bar** — the signature element. A horizontal bar
     spanning the worst-case to best-case terminal difference, crossing a
     center zero line (left of zero = renting wins, right = buying wins), with
     the base-case estimate marked. When the bar straddles zero, that *is* the
     message. Give this real visual weight.
   - A **break-even chart**: two net-worth curves over time — buyer vs renter —
     that cross at the break-even year, with the selected horizon marked and
     the area between them shaded. This is the emotional core; make it
     legible and beautiful.
   - A **tornado chart**: horizontal bars, one per assumption
     (appreciation, market return, rent growth), sorted by how much each
     swings the outcome, so it's visually obvious the answer is hostage to
     appreciation.
   - A quiet, expandable **"what this ignores"** note (PMI, SALT cap,
     deterministic-not-Monte-Carlo, fixed rate) — honesty as a feature, not
     buried.

**Interaction.** Every input recomputes everything live (the engine is fast —
a full sensitivity sweep is 27 cheap projections). The horizon slider scrubs
the charts and updates the verdict. All motion is functional and short; no
decorative animation.

**Aesthetic specifics.** Light-first is fine for this one (it's a calm
financial tool), but support `prefers-color-scheme` dark too. Tabular figures
everywhere money appears. One accent color; use green/red only to mean
buy-wins / rent-wins on the range bar and curves, at low saturation. No
gradients, no drop shadows unless they earn legibility. Fully responsive:
charts reflow, never scroll horizontally; the input rail collapses above the
answer on mobile.

**Backend surface (fixed — the page calls exactly this).**
```ts
import { project, terminal } from "./lib/model";
import { analyse, verdict } from "./lib/sensitivity";
import { dollarsToCents, formatUSD, formatUSD0 } from "./lib/money";
import type { Inputs } from "./lib/model";

// Inputs: all the scenario fields; money fields are integer cents
// (use dollarsToCents at the input boundary).
const proj = project(inputs, horizonMonths);
// proj.months[t] = { month, homeValue, loanBalance, buyerOutlay, renterOutlay,
//   buyerInvestments, renterInvestments, buyerNetWorth, renterNetWorth, difference }
// proj.breakEvenMonth: number | null

const end = terminal(proj);          // the horizon month point (end.difference etc.)

const sens = analyse(inputs, horizonMonths);
// sens = { base:{terminalDifference, breakEvenMonth}, worst, best, buyWinFraction,
//   tornado:[{ key, low, high, lowDifference, highDifference, swing }] }  // sorted, largest swing first

verdict(sens); // "buy" | "rent" | "toss-up"
```
All money values coming back are integer cents; format with `formatUSD` /
`formatUSD0`. The `project` months array is exactly what the break-even chart
plots (buyerNetWorth and renterNetWorth per month).

**Not in scope.** No accounts, no saving scenarios server-side, no routing, no
real estate listings integration. No advice framing beyond the computed
verdict and its honest caveats. No logo — the restraint is the identity.

**Deliverable.** One `index.html` or one React `App.tsx` with styles inline or
in a single file, no runtime deps beyond React if you use it. Put design
tokens (colors, spacing, type scale) at the top so I can tweak without
touching layout. Assume the backend surface above is fixed; if there's data
you want that isn't there, note it rather than inventing an API.

---

## After I have the design

I'll drop it into `src/app/`, add a Vite entry, wire the `project` / `analyse`
/ `verdict` calls to the input state, and deploy to GitHub Pages the same way
as orderbook-live (client-side only — the engine runs entirely in the
browser, no backend to host).
