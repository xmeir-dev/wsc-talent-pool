/**
 * How new data enters the demo. A recruiter's spreadsheet import and a new Comeet position both
 * append rows to the same four source tables the pipeline reads, so imported people and new roles
 * are assessed by exactly the same rules as the supplied data.
 */

import { buildDataset, DataValidationError, parseCsv, toCsv, type SourceTexts } from '../pipeline';
import { normalizeEmail, normalizeLinkedinUrl } from '../pipeline/text';

const ATTENDEE_COLUMNS = [
  'hubspot_id',
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
] as const;

const PROFILE_COLUMNS = [
  'linkedin_url',
  'full_name',
  'current_company',
  'current_title',
  'location',
  'years_experience',
  'top_skills',
  'industry',
  'past_companies',
  'past_titles',
  'wsc_mutual_connections',
] as const;

const JOB_COLUMNS = ['job_id', 'title', 'department', 'seniority', 'key_domains', 'required_skills', 'nice_to_have'] as const;

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
      /** Rows matching an existing contact by LinkedIn URL or email: the event is added, no duplicate. */
      merged: number;
      created: number;
      conferences: string[];
      ignoredColumns: string[];
    }
  | { ok: false; problems: string[] };

function appendRows(base: string, columns: readonly string[], rows: Record<string, string>[]): string {
  if (rows.length === 0) return base;
  const body = toCsv(columns, rows).split('\n').slice(1).join('\n');
  return base.replace(/\s*$/, '\n') + body;
}

function existingKeys(sources: SourceTexts) {
  const attendees = parseCsv(sources.attendees).records;
  const urls = new Set(attendees.map((r) => normalizeLinkedinUrl(r.linkedin_url ?? '')).filter(Boolean));
  const emails = new Set(attendees.map((r) => normalizeEmail(r.email ?? '')).filter(Boolean));
  const profiles = new Set(parseCsv(sources.profiles).records.map((r) => normalizeLinkedinUrl(r.linkedin_url ?? '')));
  const maxId = Math.max(0, ...attendees.map((r) => Number(/^HS(\d+)$/.exec(r.hubspot_id ?? '')?.[1] ?? 0)));
  return { urls, emails, profiles, maxId };
}

function isMerged(row: ImportRow, keys: ReturnType<typeof existingKeys>): boolean {
  const url = normalizeLinkedinUrl(row.linkedin_url ?? '');
  const email = normalizeEmail(row.email ?? '');
  return (url !== '' && keys.urls.has(url)) || (email !== '' && keys.emails.has(email));
}

/** Validates a spreadsheet before anything changes. Problems block the import; nothing is half-applied. */
export function previewImport(text: string, sources: SourceTexts): ImportPreview {
  const { header, records } = parseCsv(text);
  const problems: string[] = [];
  for (const col of REQUIRED) if (!header.includes(col)) problems.push(`Missing column "${col}".`);
  if (!header.includes('email') && !header.includes('linkedin_url')) problems.push('Needs an "email" or "linkedin_url" column.');
  if (problems.length === 0 && records.length === 0) problems.push('The file has no rows.');
  records.forEach((r, i) => {
    const line = i + 2;
    if (problems.length > 0 && !header.includes('full_name')) return;
    if (!r.full_name?.trim()) problems.push(`Row ${line}: no name.`);
    if (!r.conference_name?.trim()) problems.push(`Row ${line}: no conference.`);
    if (!r.email?.trim() && !r.linkedin_url?.trim()) problems.push(`Row ${line}: needs an email or LinkedIn URL.`);
  });
  if (problems.length > 0) return { ok: false, problems };

  const rows = records.map((r) => Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, (r[c] ?? '').trim()])) as ImportRow);
  try {
    buildDataset(applyImport(rows, sources));
  } catch (err) {
    return { ok: false, problems: err instanceof DataValidationError ? err.problems : [String(err)] };
  }
  const keys = existingKeys(sources);
  const merged = rows.filter((r) => isMerged(r, keys)).length;
  return {
    ok: true,
    rows,
    merged,
    created: rows.length - merged,
    conferences: [...new Set(rows.map((r) => r.conference_name!))],
    ignoredColumns: header.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h)),
  };
}

/** New contacts get the next HubSpot IDs; profile rows are added only for people not already enriched. */
export function applyImport(rows: ImportRow[], sources: SourceTexts): SourceTexts {
  const keys = existingKeys(sources);
  let next = keys.maxId;
  const attendees = rows.map((r) => ({
    hubspot_id: `HS${String(++next).padStart(3, '0')}`,
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
    attendees: appendRows(sources.attendees, ATTENDEE_COLUMNS, attendees),
    profiles: appendRows(sources.profiles, PROFILE_COLUMNS, profiles),
  };
}

export interface NewRole {
  title: string;
  department: string;
  seniority: string;
  keyDomains: string;
  requiredSkills: string;
  niceToHave: string;
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
  };
  return { sources: { ...sources, jobs: appendRows(sources.jobs, JOB_COLUMNS, [row]) }, jobId };
}
