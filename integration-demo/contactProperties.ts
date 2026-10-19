/**
 * The HubSpot contact properties the demo shows in Key information and About this contact.
 *
 * Talent contacts are kept apart from marketing: a pool contact is a "Talent lead" and a non-marketing contact,
 * so it is left out of marketing emails and ads (it can still get one-to-one email). A handoff to Comeet changes
 * none of these: the Comeet record gets the role's recruiter, the HubSpot contact keeps its owner.
 */

import { parseCsv, type Candidate } from '../pipeline';
import { bundledSources } from '../view/data';

export interface ContactProperties {
  owner: string;
  contactType: string;
  lifecycleStage: string;
  marketingStatus: 'Marketing contact' | 'Non-marketing contact';
  /** Simulated HubSpot record ID, stable per source contact. */
  recordId: string;
  /** The source contact ID(s) the record came from (HS002). */
  sourceId: string;
  city: string;
  country: string;
}

/**
 * Contacts that existed in HubSpot before the talent pool. Fictional: BroadcastAI is treated as a customer account
 * and Emily Carter is on its marketing list, owned by a marketing colleague, so a talent handoff must leave both alone.
 */
export const SEEDED_CONTACTS: Readonly<Record<string, Pick<ContactProperties, 'owner' | 'contactType' | 'lifecycleStage' | 'marketingStatus'>>> = {
  HS004: { owner: 'Marketing · Noa Peretz', contactType: 'Customer contact · Talent lead', lifecycleStage: 'Customer', marketingStatus: 'Marketing contact' },
};

/** Contacts in the supplied attendee file; anyone else arrived by import. */
const BUNDLED = new Set(parseCsv(bundledSources.attendees).records.map((r) => r.hubspot_id ?? ''));

/** Country codes as the profiles write them. "IL" is Israel for an Israeli city, otherwise Illinois. */
const COUNTRY: Record<string, string> = {
  AR: 'Argentina', AT: 'Austria', AU: 'Australia', CA: 'Canada', CH: 'Switzerland', CZ: 'Czech Republic', DE: 'Germany',
  DK: 'Denmark', ES: 'Spain', FR: 'France', GH: 'Ghana', IE: 'Ireland', IT: 'Italy', KR: 'South Korea', MX: 'Mexico',
  NG: 'Nigeria', NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', SE: 'Sweden', SG: 'Singapore', SN: 'Senegal',
  UAE: 'United Arab Emirates', UK: 'United Kingdom', GB: 'United Kingdom', US: 'United States', ZA: 'South Africa',
};
const US_STATES = new Set(['CA', 'FL', 'GA', 'IL', 'MA', 'NY', 'TX', 'WA']);
const ISRAELI_CITIES = new Set(['tel aviv', 'jerusalem', 'haifa', 'herzliya', 'ramat gan', 'petah tikva', 'netanya', 'beer sheva']);

/** "Tel Aviv IL" → Tel Aviv, Israel. An unknown code stays in the city and leaves the country blank. */
export function splitLocation(location: string): { city: string; country: string } {
  const m = /^(.*\S)\s+([A-Z]{2,3})$/.exec(location.trim());
  if (!m) return { city: location.trim(), country: '' };
  const [, city = '', code = ''] = m;
  if (code === 'IL') return { city, country: ISRAELI_CITIES.has(city.toLowerCase()) ? 'Israel' : 'United States' };
  if (US_STATES.has(code) && !COUNTRY[code]) return { city, country: 'United States' };
  const country = COUNTRY[code];
  return country ? { city, country } : { city: location.trim(), country: '' };
}

/** HS002 → 1002: a stable numeric record ID, as HubSpot shows one. */
export function recordIdFor(sourceId: string): string {
  const n = /(\d+)$/.exec(sourceId)?.[1];
  return n ? String(1000 + Number(n)) : '--';
}

export function contactProperties(c: Candidate): ContactProperties {
  const ids = c.sourceContactIds;
  const seeded = ids.map((id) => SEEDED_CONTACTS[id]).find(Boolean);
  // A contact created by an import is talent-only from the start; one that was already here keeps its stage.
  const imported = ids.length > 0 && ids.every((id) => !BUNDLED.has(id));
  return {
    owner: seeded?.owner ?? 'Unassigned',
    contactType: seeded?.contactType ?? 'Talent lead',
    lifecycleStage: seeded?.lifecycleStage ?? (imported ? 'Other' : 'Lead'),
    marketingStatus: seeded?.marketingStatus ?? 'Non-marketing contact',
    recordId: recordIdFor(ids[0] ?? ''),
    sourceId: ids.join(', ') || '--',
    ...splitLocation(c.profile?.location ?? ''),
  };
}
