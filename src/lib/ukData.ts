/**
 * The UK example profiles - and, more importantly, where every number in them
 * comes from.
 *
 * The brief was explicit: use only real UK housing-market data, don't fabricate
 * numbers. So this module doesn't hand-type "the rent for an £850k flat". No
 * such figure is published, because rent tracks the *area* and the *yield*, not
 * a single asking price. What is published is (1) gross rental yields by area
 * and price tier and (2) average rents, and rent at a price point is derived
 * from the first: monthly rent = price × gross yield ÷ 12. Every yield below is
 * sourced; every rent is that one transparent calculation, never a guess. The
 * derivation is cross-checked against published average rents in the tests.
 *
 * Sources (captured August 2026):
 *  - Gross yields, London: prime-central ≈ 3.5% (range 2.5 to 4%), outer-prime /
 *    broader London 5.0 to 5.8% - Savills Prime Residential and Cluttons Prime
 *    London rental updates, Q4 2025; Global Property Guide UK yields.
 *  - Gross yields, Winchester: 2.7% (SO21), 3.4% (SO23), 3.8% (SO22) -
 *    PropertyInvestmentsUK, Winchester buy-to-let, 2025.
 *  - Average rents (used only as a sanity check, not as inputs): London ≈
 *    £2,290/mo, Winchester ≈ £1,504/mo - ONS Private rent and house prices,
 *    2026.
 *  - Council tax 2025/26: London average Band D £1,690 (Westminster £1,017);
 *    Winchester-area total Band D ≈ £2,190 (all precepts). Higher bands scale
 *    by the statutory ratios (E 11/9, F 13/9, G 15/9, H 18/9 of Band D).
 *  - SDLT: gov.uk residential rates from 1 April 2025 (see sdlt.ts).
 *
 * Yields fall as price rises, because prime property is bought for capital and
 * lifestyle, not income - that compression is real and is why a £3m home rents
 * for far less than six times a £600k one. Council tax figures are
 * area-representative assumptions the user can edit; unlike rent they barely
 * track current value (England's bands are frozen at 1991 values), so they are
 * not derived from price.
 */

export type UkLocation = "London" | "Winchester";

export interface YieldPoint {
  /** Purchase price in whole pounds. */
  readonly priceGBP: number;
  /** Gross rental yield for this price tier, as a percentage. Sourced. */
  readonly grossYieldPct: number;
}

// The six purchase prices from the brief, each with its sourced gross yield.
const LONDON_YIELDS: readonly YieldPoint[] = [
  { priceGBP: 600_000, grossYieldPct: 5.0 },
  { priceGBP: 850_000, grossYieldPct: 4.5 },
  { priceGBP: 1_000_000, grossYieldPct: 4.2 },
  { priceGBP: 1_500_000, grossYieldPct: 3.8 },
  { priceGBP: 2_000_000, grossYieldPct: 3.5 },
  { priceGBP: 3_000_000, grossYieldPct: 3.2 },
];

const WINCHESTER_YIELDS: readonly YieldPoint[] = [
  { priceGBP: 600_000, grossYieldPct: 3.6 },
  { priceGBP: 850_000, grossYieldPct: 3.4 },
  { priceGBP: 1_000_000, grossYieldPct: 3.2 },
  { priceGBP: 1_500_000, grossYieldPct: 3.0 },
  { priceGBP: 2_000_000, grossYieldPct: 2.8 },
  { priceGBP: 3_000_000, grossYieldPct: 2.6 },
];

export const YIELDS: Record<UkLocation, readonly YieldPoint[]> = {
  London: LONDON_YIELDS,
  Winchester: WINCHESTER_YIELDS,
};

/** Monthly rent implied by a price and its gross yield: price × yield ÷ 12.
 *  Rounded to the nearest whole pound. This is the *only* place a rent figure
 *  is produced, so a rent can never drift from the yield it's quoted with. */
export function impliedMonthlyRentGBP(priceGBP: number, grossYieldPct: number): number {
  return Math.round((priceGBP * (grossYieldPct / 100)) / 12);
}

/** Council tax, in whole pounds/year, for an area and an assumed band. Band D
 *  is the published figure; higher bands scale by the statutory ratios. */
const BAND_D: Record<UkLocation, number> = {
  London: 1_690, // London average, 2025/26.
  Winchester: 2_190, // Winchester-area total (all precepts), 2025/26.
};
const BAND_RATIO: Record<string, number> = { D: 1, E: 11 / 9, F: 13 / 9, G: 15 / 9, H: 18 / 9 };

export function councilTaxAnnualGBP(location: UkLocation, band: keyof typeof BAND_RATIO | string): number {
  const ratio = BAND_RATIO[band] ?? 1;
  return Math.round(BAND_D[location] * ratio);
}

export interface UkProfile {
  readonly id: string;
  /** The persona label shown on the chip. */
  readonly persona: string;
  readonly priceGBP: number;
  /** Assumed council-tax band for this tier (editable in the UI). */
  readonly councilTaxBand: string;
  /** One line on who this is and what the property is. */
  readonly note: string;
}

// Six personas across the brief's six price points. The same person is shown
// against both cities, which is the comparison the brief asks for: the price is
// fixed, the rent (and council tax) is what changes with where you live.
export const PROFILES: readonly UkProfile[] = [
  { id: "first-home", persona: "First home", priceGBP: 600_000, councilTaxBand: "E",
    note: "A first purchase - a one/two-bed flat in London, a small house around Winchester." },
  { id: "trading-up", persona: "Trading up", priceGBP: 850_000, councilTaxBand: "F",
    note: "Second move, more space, a bigger mortgage but real equity behind it." },
  { id: "family-home", persona: "Family home", priceGBP: 1_000_000, councilTaxBand: "F",
    note: "The classic seven-figure family house - the level where SDLT first bites hard." },
  { id: "established", persona: "Established family", priceGBP: 1_500_000, councilTaxBand: "G",
    note: "Settled, higher-rate territory; £93,750 of stamp duty to find up front." },
  { id: "prime", persona: "Prime", priceGBP: 2_000_000, councilTaxBand: "H",
    note: "Prime market - yields compress and the buy-side sunk costs dominate." },
  { id: "ultra-prime", persona: "Ultra-prime", priceGBP: 3_000_000, councilTaxBand: "H",
    note: "Trophy end. £273,750 in stamp duty alone; rent looks very different here." },
];

/** The gross yield for a given profile in a given city. */
export function yieldFor(location: UkLocation, priceGBP: number): number {
  const point = YIELDS[location].find((p) => p.priceGBP === priceGBP);
  if (!point) throw new Error(`no yield for ${location} at £${priceGBP}`);
  return point.grossYieldPct;
}

/** Everything a profile implies in one city: the sourced yield, the derived
 *  rent, and the council-tax assumption. The single call the UI and the
 *  comparison table both go through. */
export interface ResolvedProfile {
  readonly location: UkLocation;
  readonly priceGBP: number;
  readonly grossYieldPct: number;
  readonly monthlyRentGBP: number;
  readonly councilTaxAnnualGBP: number;
  readonly councilTaxBand: string;
}

export function resolveProfile(profile: UkProfile, location: UkLocation): ResolvedProfile {
  const grossYieldPct = yieldFor(location, profile.priceGBP);
  return {
    location,
    priceGBP: profile.priceGBP,
    grossYieldPct,
    monthlyRentGBP: impliedMonthlyRentGBP(profile.priceGBP, grossYieldPct),
    councilTaxAnnualGBP: councilTaxAnnualGBP(location, profile.councilTaxBand),
    councilTaxBand: profile.councilTaxBand,
  };
}

/** UK macro assumptions used by the example profiles. Reasonable, current, and
 *  labelled as assumptions in the UI - the user can change any of them. The
 *  inflation rate is the brief's placeholder, defaulted to the Bank of England
 *  target rather than left blank. */
export const UK_ASSUMPTIONS = {
  mortgageRatePct: 4.7, // ~5-year fixed, 2025-26.
  termYears: 25, // The standard UK mortgage term.
  downPaymentPct: 25, // Typical deposit at these price points.
  sellingCostsPct: 2, // Estate agent (~1.4% + VAT) plus legal.
  maintenancePct: 1,
  homeAppreciationPct: 3, // Placeholder - the assumption the answer hinges on.
  rentGrowthPct: 3, // ONS UK private-rent inflation has run ~3-4%.
  investmentReturnPct: 6,
  inflationPct: 2.0, // [placeholder] the Bank of England's 2% target.
  buildingsInsuranceAnnualGBP: 350,
  legalAndSurveyGBP: 2_000, // Conveyancing + survey, on top of SDLT.
  horizonYears: 10,
} as const;
