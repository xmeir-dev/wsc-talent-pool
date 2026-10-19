/**
 * "Add conference" in the recruiter view: check an attendee list completely, then say exactly what it adds.
 * Nothing is applied unless the whole list reads and the merged pool still builds; the caller keeps the old
 * sources otherwise. Re-adding the same list (or a later batch with some of the same people) adds only
 * attendances the pool does not have yet: same person + same event edition is already recorded.
 */

import {
  appendRecords,
  ATTENDEE_SOURCE_COLUMNS,
  buildDataset,
  CsvFormatError,
  DataValidationError,
  isIsoDate,
  parseCsv,
  planAttendeeImport,
  type CsvRecord,
  type Dataset,
  type SourceTexts,
} from '../pipeline';
import { normalizeLinkedinUrl } from '../pipeline/text';

/** Columns an attendee list (the sign-up form's export) must have. */
export const NEEDED = ['full_name', 'email', 'conference_name', 'conference_date'] as const;

export type ListImport =
  | { ok: false; problems: string[] }
  | {
      ok: true;
      /** The new sources; the same object as before when the list adds nothing. */
      sources: SourceTexts;
      dataset: Dataset;
      /** Edition keys of every row in the list, in first-seen order (to filter the table to them). */
      editions: string[];
      added: number;
      alreadyRecorded: number;
    };

const trim = (r: CsvRecord): CsvRecord => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.trim()]));

function read(text: string, what: string): { records: CsvRecord[]; lines: number[]; header: string[] } | string[] {
  try {
    return parseCsv(text);
  } catch (err) {
    if (err instanceof CsvFormatError) return err.problems.map((p) => `${what}: ${p}.`);
    throw err;
  }
}

/** `profiles` stands in for the LinkedIn lookup production runs on new attendees (the sample brings its own). */
export function importAttendeeList(
  sources: SourceTexts,
  text: string,
  profiles?: string,
  knownPeople?: ReadonlyMap<string, string>,
): ListImport {
  const list = read(text, 'This list');
  if (Array.isArray(list)) return { ok: false, problems: list };
  const missing = NEEDED.filter((c) => !list.header.includes(c));
  if (missing.length) return { ok: false, problems: [`This list is missing ${missing.join(', ')}. Use the sign-up form's export.`] };
  if (!list.records.length) return { ok: false, problems: ['This list has no attendees.'] };

  const rows = list.records.map((r) => {
    const t = trim(r);
    return Object.fromEntries(ATTENDEE_SOURCE_COLUMNS.filter((c) => c in t).map((c) => [c, t[c]!]));
  });
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const line = list.lines[i];
    if (!r.full_name) problems.push(`Line ${line}: no name.`);
    if (!r.conference_name) problems.push(`Line ${line}: no conference name.`);
    if (r.conference_date && !isIsoDate(r.conference_date)) problems.push(`Line ${line}: conference_date "${r.conference_date}" is not a date (use YYYY-MM-DD).`);
  });
  if (problems.length) return { ok: false, problems };

  const plan = planAttendeeImport(sources.attendees, rows, { knownPeople });
  const addRows = plan.add.map((i) => rows[i]!);
  let profileRows: CsvRecord[] = [];
  if (profiles && addRows.length) {
    const p = read(profiles, 'Profiles');
    if (Array.isArray(p)) return { ok: false, problems: p };
    // Only profiles the pool does not have yet: a second copy would be a conflicting duplicate.
    const known = new Set(parseCsv(sources.profiles).records.map((r) => normalizeLinkedinUrl(r.linkedin_url ?? '')));
    profileRows = p.records.filter((r) => {
      const url = normalizeLinkedinUrl(r.linkedin_url ?? '');
      if (!url || known.has(url)) return false;
      known.add(url);
      return true;
    });
  }
  const next: SourceTexts = addRows.length
    ? {
        ...sources,
        attendees: appendRecords(sources.attendees, addRows, ATTENDEE_SOURCE_COLUMNS),
        ...(profileRows.length && { profiles: appendRecords(sources.profiles, profileRows) }),
      }
    : sources;
  let dataset: Dataset;
  try {
    dataset = buildDataset(next, { knownPeople });
  } catch (err) {
    if (err instanceof DataValidationError) return { ok: false, problems: err.problems };
    throw err;
  }
  const known = new Set(dataset.editions.map((e) => e.key));
  return {
    ok: true,
    sources: next,
    dataset,
    editions: [...new Set(plan.editionKeys)].filter((k) => known.has(k)),
    added: addRows.length,
    alreadyRecorded: plan.alreadyRecorded.length,
  };
}
