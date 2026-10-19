/**
 * Event editions: "SportsTech Innovation Summit" is a name; its 2024 and 2026 runs are two editions.
 *
 * Three identities stay separate (see docs/additional-info/identity-and-history.md):
 * - a person (Candidate.candidateKey, from identity.ts),
 * - an event edition (EventEdition.key, here),
 * - an attendance: one person at one edition (Attendance.attendanceId = attendanceIdFor(person, edition)).
 *
 * Edition key, in order of preference:
 * 1. A supplied event ID (optional `event_id` column): `id:<event_id>`. Every row with that ID is one edition.
 * 2. Otherwise name + date: rows whose normalized conference_name matches and whose dates chain together with
 *    gaps of at most EDITION_GAP_DAYS days are one edition (so a two-day summit is one edition, and next
 *    year's run is another). Key `event:<normalized name>|<first date>`.
 * 3. A row with no date: `event:<normalized name>|undated`, its own edition, never folded into a dated one,
 *    because nothing says which edition it belongs to.
 *
 * Deterministic: the same rows give the same keys in the CLI and every browser, whatever the row order.
 */

import { normalize } from './text';

/** Dates of one name at most this many days apart (day to next day) are one multi-day edition. */
export const EDITION_GAP_DAYS = 3;

export interface EventEdition {
  key: string;
  /** The conference name as first written (earliest date). */
  name: string;
  domain: string;
  /** The supplied event ID, or '' when the edition was keyed by name and date. */
  eventId: string;
  /** ISO dates of the first and last day seen; both '' when undated. */
  startDate: string;
  endDate: string;
  /**
   * How the edition reads on screen and in downloads: the name alone when it is the only edition with that
   * name, otherwise the name and its year ("SportsTech Innovation Summit (2024)"), its first date when two share
   * a year, or "(date unknown)".
   */
  label: string;
}

export interface EditionRow {
  conference_name: string;
  conference_date: string;
  conference_domain?: string;
  event_id?: string;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/**
 * The edition of every row (parallel to `rows`) and the list of editions, sorted by first date (undated last)
 * then name. Dates must already be valid ISO dates or blank; anything else counts as undated.
 */
export function assignEditions(rows: readonly EditionRow[]): { keys: string[]; editions: EventEdition[] } {
  const keys: string[] = new Array(rows.length);
  const order = rows.map((_, i) => i).sort((a, b) => dateOf(rows[a]!).localeCompare(dateOf(rows[b]!)) || a - b);

  // 1. Supplied event IDs.
  const byName = new Map<string, number[]>();
  for (const i of order) {
    const r = rows[i]!;
    const id = (r.event_id ?? '').trim();
    if (id) keys[i] = `id:${id}`;
    else byName.set(normalize(r.conference_name), [...(byName.get(normalize(r.conference_name)) ?? []), i]);
  }
  // 2 and 3. Name + chained dates; undated rows apart.
  for (const [name, idx] of byName) {
    let start = '';
    let last = NaN;
    for (const i of idx) {
      const date = dateOf(rows[i]!);
      if (!date) {
        keys[i] = `event:${name}|undated`;
        continue;
      }
      const day = dayNumber(date);
      if (!start || day - last > EDITION_GAP_DAYS) start = date;
      last = day;
      keys[i] = `event:${name}|${start}`;
    }
  }

  const byKey = new Map<string, EventEdition>();
  for (const i of order) {
    const r = rows[i]!;
    const key = keys[i]!;
    const date = dateOf(r);
    const e = byKey.get(key);
    if (!e) {
      byKey.set(key, {
        key,
        name: r.conference_name.trim(),
        domain: (r.conference_domain ?? '').trim(),
        eventId: key.startsWith('id:') ? key.slice(3) : '',
        startDate: date,
        endDate: date,
        label: '',
      });
    } else {
      if (!e.domain) e.domain = (r.conference_domain ?? '').trim();
      if (date && (!e.startDate || date < e.startDate)) e.startDate = date;
      if (date > e.endDate) e.endDate = date;
    }
  }
  // Plain code-unit order (not locale order), so every runtime sorts the same way; undated editions go last.
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const editions = [...byKey.values()].sort(
    (a, b) => cmp(a.startDate || '\uffff', b.startDate || '\uffff') || cmp(a.name, b.name) || cmp(a.key, b.key),
  );
  labelEditions(editions);
  return { keys, editions };
}

function dateOf(r: EditionRow): string {
  const d = r.conference_date.trim();
  return isIsoDate(d) ? d : '';
}

function labelEditions(editions: EventEdition[]): void {
  const sameName = new Map<string, EventEdition[]>();
  for (const e of editions) sameName.set(normalize(e.name), [...(sameName.get(normalize(e.name)) ?? []), e]);
  for (const group of sameName.values()) {
    if (group.length === 1) {
      group[0]!.label = group[0]!.name;
      continue;
    }
    for (const e of group) {
      let qualifier: string;
      if (!e.startDate) qualifier = 'date unknown';
      else if (group.filter((o) => o.startDate.slice(0, 4) === e.startDate.slice(0, 4)).length === 1) qualifier = e.startDate.slice(0, 4);
      else if (group.filter((o) => o.startDate === e.startDate).length === 1) qualifier = e.startDate;
      else qualifier = `${e.startDate}, ${e.eventId || 'no event ID'}`;
      e.label = `${e.name} (${qualifier})`;
    }
  }
}
