/**
 * Person identity: the one contract every part of the app uses to say "this person".
 *
 * A person ID (Candidate.candidateKey, exported as candidate_key) is durable:
 * - Rows are one person when they share a strong identifier (LinkedIn URL or email; see resolvePeople).
 *   The ID is the known ID of that person if any of their identifiers is already on record (the supplied
 *   people, or history this browser saved), otherwise a hash of their anchor: a LinkedIn URL, else an email,
 *   else source contact ID + name. Rows with none of these get a row anchor (a hash of the whole row) and
 *   are "unanchored": shown, but no action may be saved for them.
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
  /** Every strong identifier on the person's rows (`linkedin:<url>`, `email:<email>`), sorted. Saved with their history. */
  identifiers: string[];
  status: IdentityStatus;
  /** Other people sharing an email, LinkedIn URL or source contact ID with this one. */
  relatedPersonIds: string[];
  /** Why the status is not resolved, in plain words. Empty when resolved. */
  reasons: string[];
}

/** Published IDs of the supplied people (C-HS001…) and every newly derived one (P-<16 hex>). */
export const PERSON_ID_PATTERN = /^(C-[A-Za-z0-9][A-Za-z0-9-]*|P-[0-9a-f]{16})$/;
/** One attendance (a person at one event edition, events.ts): A-<16 hex>. Never built from hubspot_id. */
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

/** The anchor of a person known only by a source contact ID: the ID and the name together (resolvePeople). */
export const sourceKey = (sourceId: string, name: string) => `source_id:${sourceId}|${normalize(name)}`;

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

/**
 * The ID of one attendance of one person. The dataset passes `edition:<edition key>` (events.ts), so one person at
 * one edition has one attendance ID however many rows recorded it, and another edition gets another ID.
 */
export function attendanceIdFor(personId: string, attendanceSignature: string): string {
  return `A-${hash64(`${personId}|${attendanceSignature}`)}`;
}

/** Throws before a map is built if two things share an ID. Never keeps "the last one". */
export function assertUnique(ids: Iterable<string>, what: string): void {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  for (const id of ids) (seen.has(id) ? clashes : seen).add(id);
  if (clashes.size > 0)
    throw new DataValidationError([
      `Two different records would share one ${what.replace(/s$/, '')} (${[...clashes].join(', ')}), so nothing was changed. Check the file for LinkedIn URLs or emails that belong to different people.`,
    ]);
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

/** What resolvePeople needs from an attendee row. */
export interface IdentityRow {
  linkedinUrl: string;
  email: string;
  sourceId: string;
  name: string;
  /** The whole row, for rows with nothing else to go on. */
  signature: string;
}

export interface PersonGroup<T> {
  rows: T[];
  personId: string;
  anchor: string;
  kind: AnchorKind;
  /** Every strong identifier on the person's rows: `linkedin:<url>` and `email:<email>`, sorted. */
  identifiers: string[];
  /** Identity problems found while grouping (e.g. one email on two LinkedIn profiles). */
  reasons: string[];
}

/**
 * Who is who. Rows are one person when they share a strong identifier, never by a name:
 * - the same LinkedIn URL (canonical form, any linkedin.com subdomain);
 * - an email-only row joins the one LinkedIn person with that email; if several LinkedIn people share it,
 *   it stays apart and is a conflict (never merged into either);
 * - rows with neither join only rows with the same source ID and the same name, so different names sharing a
 *   source ID stay different people.
 * Then the person ID: if the person's identifiers that are unique to them in this data point at one known
 * person (data/person_ids.json, or history this browser saved), that ID is kept, even if the person has since
 * gained or lost a LinkedIn URL or email; two known people at once is a conflict. A saved source ID + name
 * (a source-ID-only person with history) counts as such an identifier for rows with that source ID and name. Otherwise P-<hash> of the
 * first LinkedIn URL, else the email, else source ID + name, else the row. Same input, same IDs.
 */
export function resolvePeople<T>(rows: readonly T[], keyOf: (r: T) => IdentityRow, known: ReadonlyMap<string, string> = REGISTERED_IDS): PersonGroup<T>[] {
  const keys = rows.map(keyOf);
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    const [x, y] = [find(a), find(b)];
    if (x !== y) parent[Math.max(x, y)] = Math.min(x, y);
  };
  const firstBy = new Map<string, number>();
  const join = (key: string, i: number) => {
    const j = firstBy.get(key);
    if (j === undefined) firstBy.set(key, i);
    else union(i, j);
  };
  const emailUrls = new Map<string, Set<string>>();
  keys.forEach((k, i) => {
    if (!k.linkedinUrl) return;
    join(`linkedin:${k.linkedinUrl}`, i);
    if (k.email) emailUrls.set(k.email, (emailUrls.get(k.email) ?? new Set()).add(k.linkedinUrl));
  });
  const groupReasons = new Map<number, string[]>();
  keys.forEach((k, i) => {
    if (k.linkedinUrl) return;
    if (k.email) {
      const urls = emailUrls.get(k.email);
      if (urls?.size === 1) join(`linkedin:${[...urls][0]}`, i);
      else {
        join(`email:${k.email}`, i);
        if (urls && urls.size > 1) groupReasons.set(i, [`email ${k.email} is on ${urls.size} different LinkedIn profiles`]);
      }
    } else if (k.sourceId) join(sourceKey(k.sourceId, k.name), i);
    else join(`row:${hash64(k.signature)}`, i);
  });

  // sourceKeys: `source_id:<id>|<name>` of the rows that have a source ID. Only for finding a known person (a
  // source-ID-only person with saved history), never for joining rows; the CLI's known IDs have none.
  type Group = { members: number[]; identifiers: string[]; sourceKeys: string[]; reasons: string[] };
  const collect = () => {
    const byRoot = new Map<number, Group>();
    keys.forEach((k, i) => {
      const g = byRoot.get(find(i)) ?? { members: [], identifiers: [], sourceKeys: [], reasons: [] };
      g.members.push(i);
      if (k.linkedinUrl) g.identifiers.push(`linkedin:${k.linkedinUrl}`);
      if (k.email) g.identifiers.push(`email:${k.email}`);
      if (k.sourceId) g.sourceKeys.push(sourceKey(k.sourceId, k.name));
      g.reasons.push(...(groupReasons.get(i) ?? []));
      byRoot.set(find(i), g);
    });
    for (const g of byRoot.values()) {
      g.identifiers = [...new Set(g.identifiers)].sort();
      g.sourceKeys = [...new Set(g.sourceKeys)].sort();
      g.reasons = [...new Set(g.reasons)];
    }
    return byRoot;
  };

  // Link to known people through identifiers only this group has. A source ID + name counts here too, so a
  // source-ID-only person with saved history who later arrives with an email keeps their ID.
  let groups = collect();
  const links = (g: Group) => [...g.identifiers, ...g.sourceKeys];
  const uses = new Map<string, number>();
  for (const g of groups.values()) for (const id of links(g)) uses.set(id, (uses.get(id) ?? 0) + 1);
  const knownIds = (g: Group) => [...new Set(links(g).filter((id) => uses.get(id) === 1 && known.has(id)).map((id) => known.get(id)!))];
  const byKnown = new Map<string, number>();
  for (const [root, g] of groups) {
    const ids = knownIds(g);
    if (ids.length !== 1) continue;
    const other = byKnown.get(ids[0]!);
    if (other === undefined) byKnown.set(ids[0]!, root);
    else union(root, other); // Saved history already says these records are one person.
  }
  groups = collect();

  // IDs already taken: by known people (even through an identifier this group shares) and by linked groups.
  const taken = new Set(known.values());
  const linked = new Set([...groups.values()].flatMap((g) => (knownIds(g).length === 1 ? knownIds(g) : [])));
  return [...groups.values()].map((g) => {
    const k = (i: number) => keys[i]!;
    const ids = knownIds(g);
    const reasons = [...g.reasons];
    let anchor: string;
    let personId: string;
    if (ids.length === 1) {
      personId = ids[0]!;
      anchor = links(g).find((id) => known.get(id) === personId)!;
    } else {
      if (ids.length > 1) reasons.push(`its LinkedIn URL and email belong to different people already on record (${ids.sort().join(', ')})`);
      const first = k(g.members[0]!);
      anchor =
        g.identifiers.find((id) => id.startsWith('linkedin:')) ??
        g.identifiers.find((id) => id.startsWith('email:')) ??
        (first.sourceId ? sourceKey(first.sourceId, first.name) : `row:${hash64(first.signature)}`);
      personId = `P-${hash64(anchor)}`;
      // Taken by someone else, unless the anchor itself is on record for this very ID and no other group took it
      // (e.g. a source-ID-only person whose source ID another row in this data shares, so it could not link above).
      if (taken.has(personId) && (known.get(anchor) !== personId || linked.has(personId))) {
        // The anchor is on record for someone else (an email this group shares with them): never take their ID.
        reasons.push(`${anchor.slice(anchor.indexOf(':') + 1)} is on record for another person`);
        personId = `P-${hash64(`${anchor}|${g.identifiers.join('|')}|unlinked`)}`;
      }
    }
    const kind = (anchor.slice(0, anchor.indexOf(':')) as AnchorKind);
    return { rows: g.members.map((i) => rows[i]!), personId, anchor, kind, identifiers: g.identifiers, reasons };
  });
}
