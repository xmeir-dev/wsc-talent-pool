import type { Candidate } from '../pipeline';

/** Profile locations end in a country code, a US state, or UK/UAE: "Dakar SN", "Austin TX", "London UK". */
const SUFFIX: Record<string, string> = { UK: 'GB', UAE: 'AE' };
const US_STATES = new Set(['TX', 'FL']);
const CHICAGO = /^Chicago IL$/;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export interface Place {
  city: string;
  /** ISO 3166 alpha-2. */
  code: string;
  country: string;
}

export function placeOf(c: Candidate): Place | null {
  const location = c.profile?.location.trim();
  if (!location) return null;
  const m = /^(.*\S)\s+([A-Z]{2,3})$/.exec(location);
  if (!m) return null;
  const [, city, suffix] = m as unknown as [string, string, string];
  // "IL" is Israel, except Chicago IL (Illinois).
  const code = CHICAGO.test(location) || US_STATES.has(suffix) ? 'US' : ((Object.hasOwn(SUFFIX, suffix) ? SUFFIX[suffix] : undefined) ?? suffix);
  const country = regionNames.of(code);
  return country && country !== code ? { city, code, country } : null;
}
