/**
 * Stamp Duty Land Tax — the UK's big irrecoverable cost of buying.
 *
 * In the US model the buyer's sunk cost at purchase is "closing costs", a
 * couple of percent. In England and Northern Ireland it's SDLT, a progressive,
 * banded tax that dwarfs everything else at the top of the market: a £2m
 * purchase pays £153,750 in duty alone. Getting the rent-vs-buy answer right
 * for the UK is impossible without modelling it, because SDLT is money the
 * buyer never sees again — exactly the kind of one-way cost this whole tool
 * exists to stop people ignoring.
 *
 * Rates are the standard residential rates for England & NI in force from
 * 1 April 2025 (gov.uk/stamp-duty-land-tax/residential-property-rates):
 *
 *   up to £125,000        0%
 *   £125,001–£250,000     2%
 *   £250,001–£925,000     5%
 *   £925,001–£1,500,000  10%
 *   above £1,500,000     12%
 *
 * A first-time buyer pays nothing up to £300,000 and 5% on £300,001–£500,000,
 * but only if the price is £500,000 or less — above that, standard rates apply
 * with no relief. An additional dwelling (a second home or a buy-to-let) pays
 * a 5-percentage-point surcharge on every band, including the first.
 *
 * Everything is integer pence, the same discipline as the rest of the engine.
 */

import type { Cents } from "./money.js";

interface Band {
  /** Upper bound of the band, in pence; null = no upper bound. */
  readonly upTo: Cents | null;
  /** Marginal rate within the band, as a fraction. */
  readonly rate: number;
}

// Standard residential bands, in pence, from 1 April 2025.
const STANDARD: readonly Band[] = [
  { upTo: 125_000_00, rate: 0 },
  { upTo: 250_000_00, rate: 0.02 },
  { upTo: 925_000_00, rate: 0.05 },
  { upTo: 1_500_000_00, rate: 0.1 },
  { upTo: null, rate: 0.12 },
];

// First-time-buyer bands, available only when the price is ≤ £500,000.
const FIRST_TIME_BUYER: readonly Band[] = [
  { upTo: 300_000_00, rate: 0 },
  { upTo: 500_000_00, rate: 0.05 },
  { upTo: null, rate: 0.05 },
];

const FTB_PRICE_CAP: Cents = 500_000_00;
/** Surcharge added to every band's rate for an additional dwelling. */
const ADDITIONAL_SURCHARGE = 0.05;

export interface SdltOptions {
  /** First-time buyer relief (ignored above the £500,000 price cap). */
  readonly firstTimeBuyer?: boolean;
  /** A second home or buy-to-let: +5 percentage points on every band. */
  readonly additionalProperty?: boolean;
}

/**
 * The SDLT due on a residential purchase, in pence. Walks the price through
 * the marginal bands — only the slice of the price that falls inside a band is
 * taxed at that band's rate, which is what makes the effective rate climb
 * smoothly rather than jumping at each threshold.
 */
export function stampDuty(price: Cents, options: SdltOptions = {}): Cents {
  if (price <= 0) return 0;

  const useFtb = options.firstTimeBuyer === true && price <= FTB_PRICE_CAP;
  const bands = useFtb ? FIRST_TIME_BUYER : STANDARD;
  const surcharge = options.additionalProperty === true ? ADDITIONAL_SURCHARGE : 0;

  let duty = 0;
  let lower = 0;
  for (const band of bands) {
    const upper = band.upTo ?? price;
    const slice = Math.min(price, upper) - lower;
    if (slice > 0) duty += slice * (band.rate + surcharge);
    lower = upper;
    if (price <= upper) break;
  }
  return Math.round(duty);
}

/**
 * The effective SDLT rate — total duty as a fraction of the price. Useful for
 * showing "you'll pay 9.1% of the price in stamp duty" next to the raw figure,
 * which lands harder than the number alone.
 */
export function effectiveSdltRate(price: Cents, options: SdltOptions = {}): number {
  if (price <= 0) return 0;
  return stampDuty(price, options) / price;
}
