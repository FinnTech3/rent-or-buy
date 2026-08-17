# Feature specification - personas, statement ingestion, property analytics

A design document, not an implementation. It specifies three features across the
two interactive tools in this portfolio - [rent-or-buy](https://github.com/finntech3/rent-or-buy)
and [my-inflation](https://github.com/finntech3/my-inflation) - and is written to
be built against directly. Where a feature would change a tool's architecture
(both are currently static, client-only, no backend, no data retention), that's
called out rather than glossed, because it's the part that actually decides
scope.

The house rule the existing tools are built on carries over: **no fabricated
numbers, every estimate traceable to a source or a stated assumption, and the
honest limitation named rather than buried.**

---

## 1. Example personas (both tools)

Add selectable personas so a first-time visitor sees a plausible, relatable
scenario in one click, spanning a real spread of incomes and circumstances.
Personas set inputs only - they assert nothing the user can't change.

Each persona carries: a label, a one-line situation, a gross household income, a
starting scenario for each tool, and the assumptions it embeds (all editable).

- **Priya - graduate renter.** 24, £32,000, shares a flat, no savings to speak
  of. *rent-or-buy:* can't buy yet; the tool shows how many years of saving the
  deposit + SDLT actually takes. *my-inflation:* rent-heavy basket, feels
  housing inflation hardest.
- **Tom & Sarah - first-time buyers.** Early 30s, £78,000 combined, £60k
  deposit, eyeing a £600k flat. The `First home` UK profile is their starting
  point.
- **The Okonkwos - trading-up family.** Late 30s, £140,000, one income variable,
  two kids, £1m family home, big SDLT bill to find. Transport- and
  food-weighted basket.
- **Margaret - retired owner.** 68, £29,000 pension, owns outright, no mortgage.
  *rent-or-buy:* the "should I sell and rent?" inversion. *my-inflation:*
  medical-and-energy-weighted basket, the classic case where personal inflation
  runs above headline.
- **Daniel - higher-rate professional.** 45, £120,000, £2m prime purchase,
  weighing buy vs invest-the-deposit. The `Prime` profile; yields compress, sunk
  costs dominate.
- **Investor persona (rent-or-buy only).** Second-property buyer - triggers the
  +5% SDLT surcharge already supported in `sdlt.ts`, and reframes the question
  as yield vs. alternative investment rather than lifestyle.

Income ranges (£29k–£140k) are illustrative and labelled as such. **Do not
invent persona data beyond this documented spread** - new personas must stay
inside it or cite a source.

**Build cost:** low. Personas are `FormState` presets plus a short bio; the
existing preset mechanism already renders them.

---

## 2. Bank-statement ingestion → personal inflation (my-inflation)

Let a user upload a bank or card statement; the system reads it, detects the
cost of each good or service, categorises spending into the CPI groups, and
computes the user's **own** inflation basket from real transactions instead of
guessed slider weights. This is the natural evolution of my-inflation: today the
weights are asserted, this would *measure* them.

### Processing pipeline (step by step)

1. **Upload.** Accept CSV (bank export), OFX/QIF, or PDF/image (scanned
   statement). CSV is the first-class path; PDF/image needs OCR (see costs).
2. **Parse to transactions.** Extract `{date, description, amount, direction}`.
   Bank CSV layouts vary, so ship a small set of named adapters (Monzo, Starling,
   Barclays, HSBC, Amex…) plus a generic column-mapping step the user confirms.
3. **Normalise the merchant.** Strip card-scheme noise ("SumUp *", "Amazon
   Mktp", trailing store numbers) to a canonical merchant string.
4. **Categorise into CPI groups.** Map each merchant/transaction to one of the
   eight CPI major groups my-inflation already uses (Food & beverages, Housing,
   Transport, …). Two-stage: (a) a deterministic lookup table for common
   merchants; (b) a fallback classifier for the unknown tail. Every
   auto-category is **shown and editable** - the user corrects, the correction
   is remembered for that merchant.
5. **Aggregate to weights.** Sum categorised spend over the statement period →
   the user's real basket shares, normalised to 100%. Exclude transfers,
   savings, and income so the basket reflects *consumption*.
6. **Feed the existing engine.** Hand those weights to my-inflation's
   `basketInflation` unchanged. The output - your personal rate vs the headline
   - is now grounded in your receipts, and the same reconstruction guarantee
   still holds.
7. **Show the derivation.** Category breakdown, the merchants behind each, and a
   one-click path back to editing any assignment. No black box.

### Data handling (constraints, non-negotiable)

- **Process in the browser; don't retain.** Parsing and categorisation run
  client-side wherever possible. Nothing is stored server-side beyond the
  request lifetime; **uploaded documents are never persisted longer than needed
  to process them.** Remembered merchant→category corrections are stored
  locally (localStorage), not uploaded.
- **No third-party paid API without explicit permission.** The deterministic
  lookup and a local/open classifier cover the default path at £0. Any
  hosted-LLM or paid enrichment step is opt-in and disclosed before use.
- **Read-only.** The feature never modifies or deletes the user's financial
  data; it reads a file the user chose to share and produces a report.
- **Honest edges:** a single statement is a snapshot, not a year; one bank misses
  cash and other accounts; merchant categorisation is imperfect and shown so the
  user can fix it. These are stated in the UI, not hidden.

**Build cost:** medium (CSV path) to high (PDF/OCR + backend). The CSV-only,
client-side slice is a realistic first increment and needs no server.

---

## 3. Property-listing URL → analytics (rent-or-buy)

Let a user paste a URL from a property-listing site; the system extracts the
property's data and returns a full analysis, then drops the key figures straight
into the rent-vs-buy engine so the decision is pre-populated from a real listing.

### Analysis report (structured sections)

- **Overview** - address/area, price, type, beds, tenure (freehold/leasehold and
  lease years remaining - decisive in the UK), size where published, EPC rating.
- **Valuation** - asking price vs recent sold comparables (Land Registry Price
  Paid is free and open) and the local £/sq-ft; over/under-priced flag with the
  comparables shown.
- **Rental yield** - estimated achievable rent for the area/type (same
  yield-based method and sources as the UK profiles) → gross and net yield,
  reusing this repo's engine for the cost side (SDLT, council tax, maintenance).
- **Risks** - short lease, high service charge/ground rent, flood zone, new-build
  premium, EPC below C, area price trend rolling over. Each risk cites what
  triggered it.
- **Recommendations** - the rent-vs-buy verdict for this specific property at the
  user's horizon and assumptions, plus the honest range and what it hinges on -
  i.e. hand the listing straight to the existing calculator.

### Ingestion (constraints, non-negotiable)

- **Respect the source.** Prefer official/open data (Land Registry, EPC register,
  both free) and any structured data the page itself exposes (JSON-LD/OpenGraph).
  Honour robots.txt and terms; **no paid data API without explicit permission**,
  and cache/rate-limit to avoid hammering a listing site. If a site disallows
  automated fetch, say so and let the user paste the details manually rather than
  circumventing it.
- **Don't retain the fetched page** beyond producing the report; store nothing
  about the user's search.
- **Read-only**, and every derived figure labelled derived - the valuation and
  yield are estimates with sources, never presented as the listing's own numbers.

**Build cost:** high, and architecture-changing - it needs a small server-side
fetch/parse step (browsers can't cross-origin scrape), so it's the biggest of
the three. A realistic first increment is **manual entry + the analysis report**
(no scraping): the user types price/beds/tenure, and gets Valuation / Yield /
Risks / Recommendation immediately, reusing the engine that already exists.

---

## Sequencing recommendation

1. **Personas** - low cost, immediate value, no architecture change. Do first.
2. **Statement ingestion, CSV-only, client-side** - the honest measured-basket
   upgrade to my-inflation, still no backend.
3. **Property analysis from manual entry** - the report sections above with no
   scraping, reusing this engine.
4. **Then**, only if warranted: OCR for statements and server-side listing fetch
   - the two steps that add a backend and the data-handling obligations above.

Each step ships on its own and none of them requires the next, which keeps every
increment to the same bar the shipped tools already hold: real data, stated
assumptions, honest limits.
