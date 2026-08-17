/**
 * Money is integer cents. Never floats.
 *
 * The whole point of this project is to be trusted with someone's biggest
 * financial decision, and a model that quietly loses a cent per month to
 * IEEE-754 rounding has no business making that claim. Every dollar amount
 * in the engine is an integer number of cents; conversion to and from
 * human decimal strings happens here, once, at the boundary.
 *
 * This is the same discipline as orderbook-live's integer tick grid, ported
 * because the reason is identical: equality and accumulation over hundreds
 * of steps have to be exact, and `0.1 + 0.2 !== 0.3` makes floats unfit for
 * that no matter how careful the rounding looks.
 */

/** An integer number of cents. Negative means an outflow / liability. */
export type Cents = number;

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/**
 * Parse a decimal dollar amount into exact integer cents. A string is taken
 * literally (no float ever touches it); a number is stringified first, which
 * is lossy only to the extent the caller already lost precision by using one.
 * More than two decimal places is an error rather than a silent round, so a
 * typo like "1200.005" is caught instead of absorbed.
 */
export function dollarsToCents(value: string | number): Cents {
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!DECIMAL.test(text)) {
    throw new Error(`not a decimal dollar amount: ${JSON.stringify(value)}`);
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const dot = unsigned.indexOf(".");
  const whole = dot < 0 ? unsigned : unsigned.slice(0, dot);
  const frac = dot < 0 ? "" : unsigned.slice(dot + 1);
  if (frac.length > 2) {
    throw new Error(`more precision than cents: ${JSON.stringify(value)}`);
  }
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`amount out of safe range: ${JSON.stringify(value)}`);
  }
  return negative ? -cents : cents;
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

/** Round a floating dollar amount to whole cents, ties away from zero.
 *  Used at every point where a rate multiplies a balance. */
export function roundToCents(dollars: number): Cents {
  if (!Number.isFinite(dollars)) throw new Error(`non-finite amount: ${dollars}`);
  const cents = dollars * 100;
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(cents));
}

/** Multiply a cents balance by a per-period rate, returning whole cents.
 *  Kept as one function so every interest/growth step rounds identically. */
export function applyRate(balance: Cents, rate: number): Cents {
  return roundToCents((balance / 100) * rate);
}

/** The two currencies the calculator speaks. The minor unit is 1/100 of the
 *  major unit for both (cents, pence), so the integer-minor-unit engine is
 *  identical - only the boundary formatting differs. */
export type Currency = "USD" | "GBP";

const LOCALE: Record<Currency, string> = { USD: "en-US", GBP: "en-GB" };

const withCents: Record<Currency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  GBP: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

const whole: Record<Currency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  GBP: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }),
};

/** Format integer minor units in the given currency, to the cent/penny. */
export function formatMoney(cents: Cents, currency: Currency = "USD"): string {
  return withCents[currency].format(cents / 100);
}

/** Whole-unit format for headline figures where the minor unit is noise. */
export function formatMoney0(cents: Cents, currency: Currency = "USD"): string {
  return whole[currency].format(Math.round(cents / 100));
}

/** The currency's symbol on its own (for inline "$"/"£" prefixes). */
export function currencySymbol(currency: Currency): string {
  return (0).toLocaleString(LOCALE[currency], { style: "currency", currency }).replace(/[\d.,\s]/g, "");
}

export function formatUSD(cents: Cents): string {
  return formatMoney(cents, "USD");
}

/** Whole-dollar format for headline figures where cents are noise. */
export function formatUSD0(cents: Cents): string {
  return formatMoney0(cents, "USD");
}
