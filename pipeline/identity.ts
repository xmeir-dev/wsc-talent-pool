/**
 * Person identity: the one contract every part of the app uses to say "this person".
 *
 * A person ID (Candidate.candidateKey, exported as candidate_key) is durable:
 * - It comes from the person's identity anchor, the identifier their attendee rows were grouped by:
 *   a valid LinkedIn URL, else an email, else a source (HubSpot) contact ID. Rows with none of these
 *   get a row anchor (a hash of the whole row) and are "unanchored": shown, but no action may be saved for them.
 * - It never comes from a name alone, from row order, or from which source row happens to sort first.
 *   So another attendance, reordered input or added profile evidence never changes it.
 * - People in the supplied data keep their published IDs (C-HS001…) through data/person_ids.json
 *   (anchor → ID). Anyone else gets P-<16 hex>, a 64-bit FNV-1a hash of the anchor: the same anchor
 *   gives the same ID in the CLI and in every browser, and different anchors give different IDs.
 * - IDs are checked for uniqueness before any map is built; a clash is an error, never a silent overwrite.
 *
 * Source contact IDs (sourceContactIds) and attendance records (Attendance.attendanceId) are separate:
 * a person can have many of each, and neither is used to own saved actions.
 */

import registry from '../data/person_ids.json';
import { DataValidationError } from './errors';
import { normalize } from './text';

export type AnchorKind = 'linkedin' | 'email' | 'source_id' | 'row';

/**
 * resolved: one anchor, no clash with anyone else.
 * possible_duplicate: shares an email, LinkedIn URL or source contact ID with another person (never merged).
 * conflict: the person's own records disagree (different names on one URL, a profile naming someone else,
 *   several profiles or URLs for one person).
 * unanchored: no LinkedIn URL, email or source ID to hold history against.
 * Anything but resolved blocks outreach and handoff until the source data is fixed.
 */
export type IdentityStatus = 'resolved' | 'possible_duplicate' | 'conflict' | 'unanchored';

export interface PersonIdentity {
  /** `${kind}:${normalized value}`, e.g. "linkedin:linkedin.com/in/jane-doe". Unique per person in a dataset. */
  anchor: string;
  kind: AnchorKind;
  status: IdentityStatus;
  /** Other people sharing an email, LinkedIn URL or source contact ID with this one. */
  relatedPersonIds: string[];
  /** Why the status is not resolved, in plain words. Empty when resolved. */
  reasons: string[];
}

/** Published IDs of the supplied people (C-HS001…) and every newly derived one (P-<16 hex>). */
export const PERSON_ID_PATTERN = /^(C-[A-Za-z0-9][A-Za-z0-9-]*|P-[0-9a-f]{16})$/;
/** One attendance row (a person at an event): A-<16 hex>. Stage-2 event editions build on this, not on hubspot_id. */
export const ATTENDANCE_ID_PATTERN = /^A-[0-9a-f]{16}$/;

/** 64-bit FNV-1a as 16 hex characters. Deterministic and synchronous, so the CLI and browsers agree. */
export function hash64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export const anchorKey = (kind: AnchorKind, value: string) => `${kind}:${value}`;

/** anchor → published person ID, validated once: every ID is C-…, used once, for one anchor. */
export const REGISTERED_IDS: ReadonlyMap<string, string> = (() => {
  const people = (registry as { people: Record<string, string> }).people;
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const [anchor, id] of Object.entries(people)) {
    if (!/^C-/.test(id) || !PERSON_ID_PATTERN.test(id)) throw new DataValidationError([`data/person_ids.json: ${id} is not a published person ID`]);
    if (seen.has(id)) throw new DataValidationError([`data/person_ids.json: ${id} is given to more than one person`]);
    seen.add(id);
    map.set(anchor, id);
  }
  return map;
})();
const REGISTERED = new Set(REGISTERED_IDS.values());

/** True for a published ID of a supplied person: saved history under it has one unambiguous owner. */
export const isRegisteredPersonId = (id: string) => REGISTERED.has(id);

/** The durable person ID for an anchor. */
export function personIdFor(anchor: string, registered: ReadonlyMap<string, string> = REGISTERED_IDS): string {
  return registered.get(anchor) ?? `P-${hash64(anchor)}`;
}

/** The ID of one attendance row of one person (the row's full content, so exact duplicates were already dropped). */
export function attendanceIdFor(personId: string, rowSignature: string): string {
  return `A-${hash64(`${personId}|${rowSignature}`)}`;
}

/** Throws before a map is built if two things share an ID. Never keeps "the last one". */
export function assertUnique(ids: Iterable<string>, what: string): void {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  for (const id of ids) (seen.has(id) ? clashes : seen).add(id);
  if (clashes.size > 0) throw new DataValidationError([`${what}: the same ID is used more than once: ${[...clashes].join(', ')}`]);
}

/** A Map keyed by person ID that refuses duplicates. */
export function indexByPersonId<T>(items: readonly T[], idOf: (item: T) => string): Map<string, T> {
  assertUnique(items.map(idOf), 'person IDs');
  return new Map(items.map((item) => [idOf(item), item]));
}

/** Why no action may be recorded for this person, or undefined when their identity is resolved. */
export function identityBlock(identity: Pick<PersonIdentity, 'status' | 'reasons'>): string | undefined {
  switch (identity.status) {
    case 'resolved':
      return undefined;
    case 'possible_duplicate':
      return `Possible duplicate of another contact (${identity.reasons.join('; ')}). Resolve the identity before contacting or handing off.`;
    case 'conflict':
      return `Identity not confirmed (${identity.reasons.join('; ')}). Resolve it before contacting or handing off.`;
    case 'unanchored':
      return 'No email, LinkedIn URL or contact ID to keep history against. Add one before contacting.';
  }
}

/**
 * Keys the old (v1) app could have given this person: C-<source ID>, or C-<name slug> when the row had no
 * ID, each possibly with a -2, -3… collision suffix. Used only to find saved v1 history that might be theirs;
 * such history is held for review, never attached automatically.
 */
export function mayOwnLegacyKey(person: { fullName: string; sourceContactIds: readonly string[] }, key: string): boolean {
  const bases = person.sourceContactIds.length
    ? person.sourceContactIds.map((id) => `C-${id}`)
    : [`C-${normalize(person.fullName).replace(/\W+/g, '-')}`];
  return bases.some((b) => key === b || (key.startsWith(`${b}-`) && /^\d+$/.test(key.slice(b.length + 1))));
}
