/**
 * How new data enters the demo. A recruiter's spreadsheet import and a new Comeet position both
 * append rows to the same four source tables the pipeline reads, so imported people and new roles
 * are assessed by exactly the same rules as the supplied data.
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
  SUPPORTED_SENIORITIES,
  type Dataset,
  type SourceTexts,
} from '../pipeline';
import { NAME_CONFLICT_FLAG } from '../pipeline/dataset';
import { normalize, normalizeEmail, normalizeLinkedinUrl } from '../pipeline/text';

/** Job columns a new position writes. The two criteria columns are added to the table only when a role uses them. */
const JOB_COLUMNS = [
  'job_id',
  'title',
  'department',
  'seniority',
  'key_domains',
  'required_skills',
  'nice_to_have',
  'core_skills',
  'must_have_skills',
] as const;

/** Columns the import template accepts. Profile columns are what the attendee gave at capture. */
export const IMPORT_COLUMNS = [
  'full_name',
  'email',
  'company',
  'title',
  'conference_name',
  'conference_domain',
  'conference_date',
  'source',
  'notes',
  'linkedin_url',
  'event_id',
  'location',
  'years_experience',
  'top_skills',
  'industry',
  'past_companies',
  'past_titles',
] as const;

const REQUIRED = ['full_name', 'conference_name'] as const;

export interface ImportRow {
  [column: string]: string;
}

export type ImportPreview =
  | {
      ok: true;
      rows: ImportRow[];
      /**
       * Rows that add an event to a contact instead of creating one (an existing contact, or an
       * earlier row for the same person). Counted from the real grouping, so rows - merged = created.
       */
      merged: number;
      /**
       * Rows skipped because they repeat an attendance already recorded (in the pool, or earlier in the file) with
       * nothing new. Importing the same file twice adds nothing the second time; changed details are kept.
       */
      alreadyRecorded: number;
      /** Contacts the import adds to the pool. */
      created: number;
      /** One line per row whose match is uncertain: what happens to it and why. */
      uncertain: string[];
      /** Event editions in the file, as labelled in the pool ("SportsTech Innovation Summit (2026)"). */
      conferences: string[];
      ignoredColumns: string[];
    }
  | { ok: false; problems: string[] };

function existingKeys(sources: SourceTexts) {
  const attendees = parseCsv(sources.attendees).records;
  const emails = new Set(attendees.map((r) => normalizeEmail(r.email ?? '')).filter(Boolean));
  const profiles = new Set(parseCsv(sources.profiles).records.map((r) => normalizeLinkedinUrl(r.linkedin_url ?? '')));
  const maxId = Math.max(0, ...attendees.map((r) => Number(/^HS(\d+)$/.exec(r.hubspot_id ?? '')?.[1] ?? 0)));
  return { emails, profiles, maxId };
}

function newContactIds(rows: ImportRow[], maxId: number): string[] {
  return rows.map((_, i) => `HS${String(maxId + i + 1).padStart(3, '0')}`);
}

/**
 * Reads the outcome from the dataset the import would produce, so the preview uses exactly the
 * pipeline's grouping (URL first, then email; names never merge) instead of a separate guess.
 */
function outcome(rows: ImportRow[], sources: SourceTexts, after: Dataset, knownPeople?: ReadonlyMap<string, string>) {
  const keys = existingKeys(sources);
  const ids = newContactIds(rows, keys.maxId);
  const rowById = new Map(ids.map((id, i) => [id, rows[i]!]));
  const existed = new Set(buildDataset(sources, { knownPeople }).candidates.map((c) => c.candidateKey));
  let created = 0;
  const uncertain: string[] = [];
  for (const c of after.candidates) {
    const mine = c.sourceContactIds.filter((id) => rowById.has(id)).map((id) => rowById.get(id)!);
    if (mine.length === 0) continue;
    // New = not in the pool before, by durable person ID (an earlier row may have had no contact ID at all).
    const isNew = !existed.has(c.candidateKey);
    if (isNew) created++;
    const names = [...new Set(mine.map((r) => r.full_name))].join(' / ');
    if (c.dataQualityFlags.some((f) => f.startsWith(NAME_CONFLICT_FLAG))) {
      uncertain.push(`${names}: LinkedIn URL is shared with a different name. Combined and held for review.`);
    } else if (isNew && mine.some((r) => keys.emails.has(normalizeEmail(r.email ?? '')))) {
      uncertain.push(`${names}: email matches an existing contact, but the LinkedIn URL does not. Added as new and flagged as a possible duplicate.`);
    }
  }
  return { created, merged: rows.length - created, uncertain };
}

/**
 * Validates a spreadsheet before anything changes: the CSV structure (strictly, with line and column), the
 * columns, every row, and the pool the import would produce. Problems block the import; nothing is half-applied.
 */
/** `knownPeople`: the same saved-history IDs the pool is built with, so people resolve exactly as they will after import. */
export function previewImport(text: string, sources: SourceTexts, knownPeople?: ReadonlyMap<string, string>): ImportPreview {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (err) {
    if (err instanceof CsvFormatError) return { ok: false, problems: err.problems.map((p) => `${p[0]!.toUpperCase()}${p.slice(1)}.`) };
    throw err;
  }
  const { header, records, lines } = parsed;
  const problems: string[] = [];
  for (const col of REQUIRED) if (!header.includes(col)) problems.push(`Missing column "${col}".`);
  if (!header.includes('email') && !header.includes('linkedin_url')) problems.push('Needs an "email" or "linkedin_url" column.');
  if (problems.length === 0 && records.length === 0) problems.push('The file has no rows.');
  const uncertain: string[] = [];
  records.forEach((r, i) => {
    const line = lines[i];
    if (problems.length > 0 && !header.includes('full_name')) return;
    if (!r.full_name?.trim()) problems.push(`Line ${line}: no name.`);
    if (!r.conference_name?.trim()) problems.push(`Line ${line}: no conference.`);
    if (!r.email?.trim() && !r.linkedin_url?.trim()) problems.push(`Line ${line}: needs an email or LinkedIn URL.`);
    const date = r.conference_date?.trim() ?? '';
    if (date && !isIsoDate(date)) problems.push(`Line ${line}: conference_date "${date}" is not a date (use YYYY-MM-DD).`);
    else if (!date && r.conference_name?.trim() && !r.event_id?.trim())
      uncertain.push(`Line ${line}: no conference date, so it is kept as a separate "date unknown" edition of ${r.conference_name.trim()}.`);
  });
  if (problems.length > 0) return { ok: false, problems };

  const all = records.map((r) => Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, (r[c] ?? '').trim()])) as ImportRow);
  // An exact repeat of a recorded attendance is skipped, so a retried file changes nothing; new details are kept.
  const plan = planAttendeeImport(sources.attendees, all, { knownPeople });
  const rows = plan.add.map((i) => all[i]!);
  let after: Dataset;
  try {
    after = buildDataset(applyImport(rows, sources), { knownPeople });
  } catch (err) {
    return { ok: false, problems: err instanceof DataValidationError ? err.problems : [String(err)] };
  }
  const result = outcome(rows, sources, after, knownPeople);
  return {
    ok: true,
    rows,
    ...result,
    uncertain: [...uncertain, ...result.uncertain],
    alreadyRecorded: plan.alreadyRecorded.length,
    conferences: [...new Set(plan.editionKeys)].map((k) => plan.editions.get(k) ?? k),
    ignoredColumns: header.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h)),
  };
}

/** New contacts get the next HubSpot IDs; profile rows are added only for people not already enriched. */
export function applyImport(rows: ImportRow[], sources: SourceTexts): SourceTexts {
  const keys = existingKeys(sources);
  const ids = newContactIds(rows, keys.maxId);
  const attendees = rows.map((r, i) => ({
    hubspot_id: ids[i]!,
    full_name: r.full_name ?? '',
    email: r.email ?? '',
    company: r.company ?? '',
    title: r.title ?? '',
    conference_name: r.conference_name ?? '',
    conference_domain: r.conference_domain ?? '',
    conference_date: r.conference_date ?? '',
    source: r.source || 'Manual import',
    notes: r.notes ?? '',
    linkedin_url: r.linkedin_url ?? '',
    // Only when supplied, so the source table gains the column only when an import uses it.
    ...(r.event_id && { event_id: r.event_id }),
  }));
  const seen = new Set(keys.profiles);
  const profiles = rows
    .filter((r) => {
      const url = normalizeLinkedinUrl(r.linkedin_url ?? '');
      if (!url || seen.has(url) || !(r.top_skills || r.years_experience || r.title)) return false;
      seen.add(url);
      return true;
    })
    .map((r) => ({
      linkedin_url: r.linkedin_url ?? '',
      full_name: r.full_name ?? '',
      current_company: r.company ?? '',
      current_title: r.title ?? '',
      location: r.location ?? '',
      years_experience: r.years_experience ?? '',
      top_skills: r.top_skills ?? '',
      industry: r.industry ?? '',
      past_companies: r.past_companies ?? '',
      past_titles: r.past_titles ?? '',
      wsc_mutual_connections: '',
    }));
  return {
    ...sources,
    attendees: attendees.length ? appendRecords(sources.attendees, attendees, ATTENDEE_SOURCE_COLUMNS) : sources.attendees,
    profiles: profiles.length ? appendRecords(sources.profiles, profiles) : sources.profiles,
  };
}

export interface NewRole {
  title: string;
  department: string;
  seniority: string;
  keyDomains: string;
  requiredSkills: string;
  niceToHave: string;
  /** Confirmed core skills: any one on the profile makes the person relevant. Empty → provisional default. */
  coreSkills?: string;
  /** Confirmed must-haves: each is needed for the shortlist. */
  mustHaveSkills?: string;
}

/** Lists are typed comma- or semicolon-separated; the source table uses semicolons. */
const toList = (s: string) =>
  s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(';');

export function roleProblems(role: NewRole): string[] {
  const problems: string[] = [];
  if (!role.title.trim()) problems.push('Add a position title.');
  if (!SUPPORTED_SENIORITIES.some((level) => normalize(level) === normalize(role.seniority))) {
    problems.push(`Choose a seniority: ${SUPPORTED_SENIORITIES.join(', ')}.`);
  }
  if (!toList(role.requiredSkills)) problems.push('Add at least one required skill.');
  return problems;
}

/** Appends a role the way a Comeet "position created" webhook would deliver it. Returns its new job ID. */
export function addRole(role: NewRole, sources: SourceTexts): { sources: SourceTexts; jobId: string } {
  const ids = parseCsv(sources.jobs).records.map((r) => Number(/^JOB(\d+)$/.exec(r.job_id ?? '')?.[1] ?? 0));
  const jobId = `JOB${String(Math.max(0, ...ids) + 1).padStart(3, '0')}`;
  const row = {
    job_id: jobId,
    title: role.title.trim(),
    department: role.department.trim(),
    seniority: role.seniority.trim(),
    key_domains: toList(role.keyDomains),
    required_skills: toList(role.requiredSkills),
    nice_to_have: toList(role.niceToHave),
    // Written only when confirmed, so a role without them keeps the previous behavior exactly.
    ...(toList(role.coreSkills ?? '') && { core_skills: toList(role.coreSkills ?? '') }),
    ...(toList(role.mustHaveSkills ?? '') && { must_have_skills: toList(role.mustHaveSkills ?? '') }),
  };
  // By column name, so a jobs table with its columns in another order, or without the optional ones, stays valid.
  return { sources: { ...sources, jobs: appendRecords(sources.jobs, [row], JOB_COLUMNS) }, jobId };
}
