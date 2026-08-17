/**
 * Scenario ⇄ URL. Encodes the whole input state into a query string so any
 * result is a shareable link, and decodes one back, tolerating missing or
 * garbage keys by falling back to the defaults. Pure functions - no DOM - so
 * the round-trip is unit-tested.
 */

import { DEFAULTS, STRING_KEYS } from "./form.js";
import type { FormState } from "./form.js";

export function encode(form: FormState): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(form) as (keyof FormState)[]) {
    params.set(key, String(form[key]));
  }
  return params.toString();
}

export function decode(query: string): FormState {
  const params = new URLSearchParams(query.startsWith("#") ? query.slice(1) : query);
  const out: FormState = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof FormState)[]) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (STRING_KEYS.has(key)) {
      (out[key] as string) = raw;
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) (out[key] as number) = n;
    }
  }
  return out;
}
