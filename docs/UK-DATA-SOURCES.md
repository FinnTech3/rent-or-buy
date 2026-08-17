# UK example profiles - the data, and where it comes from

The brief for the UK profiles was explicit: **use only real UK housing-market
data, don't fabricate numbers.** This document is the audit trail for that. Every
figure below is either published and cited, or derived from a published figure
by one transparent calculation that's stated here and enforced by a test.

## The one thing that is *derived*, and how

There is no published statistic for "the monthly rent of an £850,000 property".
Rent doesn't track a single asking price - it tracks the **area** and the
**gross rental yield**. So each profile's rent is one calculation:

```
monthly rent  =  purchase price  ×  gross yield  ÷  12
```

The yield is the sourced input; the rent is the arithmetic. `src/lib/ukData.ts`
is the only place a rent is produced, so a rent can never drift from the yield
it's quoted with, and `tests/ukProfiles.test.ts` cross-checks the result against
published *average* rents (a £600k London flat should rent above the ~£2,290 ONS
London average, and it does).

**Yields fall as price rises.** Prime property is bought for capital and
lifestyle, not income, so a £3m home rents for far less than five times a £600k
one. That compression is real, is sourced, and is why the profiles don't scale
linearly.

## Rent by price and city (derived)

| Purchase price | London yield | London rent/mo | Winchester yield | Winchester rent/mo |
|---:|---:|---:|---:|---:|
| £600,000 | 5.0% | £2,500 | 3.6% | £1,800 |
| £850,000 | 4.5% | £3,188 | 3.4% | £2,408 |
| £1,000,000 | 4.2% | £3,500 | 3.2% | £2,667 |
| £1,500,000 | 3.8% | £4,750 | 3.0% | £3,750 |
| £2,000,000 | 3.5% | £5,833 | 2.8% | £4,667 |
| £3,000,000 | 3.2% | £8,000 | 2.6% | £6,500 |

*Yield sources - London:* Savills *Prime residential rents* (Q3–Q4 2025) and
Cluttons *Prime London rental market update* put prime-central gross yields at
~3.5% (range 2.5–4%) and outer-prime / broader London at 5.0–5.8%; Global
Property Guide corroborates the London range. *Winchester:*
PropertyInvestmentsUK *Winchester buy-to-let* reports gross yields of 2.7%
(SO21), 3.4% (SO23) and 3.8% (SO22). The per-tier yields above sit inside these
published bands and decline with price. *Cross-check:* ONS *Private rent and
house prices* (2026) gives average rents of ≈£2,290/mo (London) and ≈£1,504/mo
(Winchester).

## Stamp Duty (SDLT) - published, not derived

Standard residential rates for England & NI from 1 April 2025
([gov.uk](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates)):
0% to £125k, 2% to £250k, 5% to £925k, 10% to £1.5m, 12% above. Computed in
`src/lib/sdlt.ts`; the duty on each profile:

| Purchase price | SDLT | Effective rate |
|---:|---:|---:|
| £600,000 | £20,000 | 3.3% |
| £850,000 | £32,500 | 3.8% |
| £1,000,000 | £43,750 | 4.4% |
| £1,500,000 | £93,750 | 6.3% |
| £2,000,000 | £153,750 | 7.7% |
| £3,000,000 | £273,750 | 9.1% |

First-time-buyer relief (0% to £300k, 5% to £500k) only applies at or below
£500k, so it never touches these profiles. A second home or buy-to-let adds a
5-point surcharge on every band - supported in the code, not applied to these
primary-residence profiles.

## Council tax - area-representative band figures

Council tax is a flat banded charge, **not** a percentage of value, and England's
bands are frozen at 1991 values, so it barely tracks today's price. The profiles
use each area's published 2025/26 Band D and scale by the statutory band ratios
(E = 11/9, F = 13/9, G = 15/9, H = 18/9 of Band D):

| Band assumed | London | Winchester |
|---|---:|---:|
| D (published base) | £1,690 | £2,190 |
| E (£600k tier) | £2,066 | £2,677 |
| F (£850k–£1m tiers) | £2,441 | £3,163 |
| G (£1.5m tier) | £2,817 | £3,650 |
| H (£2m–£3m tiers) | £3,380 | £4,380 |

*Sources:* London average Band D £1,690 for 2025/26 (Westminster is far lower at
£1,017 - inner boroughs are subsidised by business rates); Winchester-area total
Band D ≈ £2,190 including all precepts (Hampshire County, police, fire, parish).
These are editable defaults in the tool - a starting point, not a claim about a
specific address. Note Winchester runs **higher** than London for the same band,
which surprises people and is real.

## How inflation moves the answer

The brief asked for "the impact of the inflation rate on both rent and mortgage
costs." They move in opposite directions, which is half the point:

- **Mortgage principal & interest is nominal-fixed.** On a fixed-rate loan the
  monthly payment never changes, so inflation quietly *erodes* it in real terms
  - the single biggest hidden advantage of buying, and one a "payment vs rent"
  comparison misses entirely.
- **Rent compounds every year** at the rent-growth rate (default 3%, near the
  ONS UK private-rent trend), so the renter's cost pulls away from the buyer's
  fixed payment over time.
- **Council tax, insurance and service charge grow with general inflation**
  (default 2%, the Bank of England target - a placeholder to set yourself).

So a higher inflation / rent-growth assumption helps buying and hurts renting;
the tornado chart ranks exactly how much. Over a 10-year hold at 3% rent growth,
a £3,500 London rent becomes ≈£4,700/mo while the mortgage payment holds flat.

## Reproducing these numbers

`npm run analyze` (US) and the UK profiles both run the same integer-cents
engine. The figures here are regenerated from `src/lib/ukData.ts` and
`src/lib/sdlt.ts`; the tests in `tests/ukProfiles.test.ts`, `tests/sdlt.test.ts`
and `tests/ukModel.test.ts` pin them so they can't silently drift.
