/**
 * Validate the four source files and combine them into one record per person.
 *
 * Identity rules:
 * - Attendee rows with the same valid LinkedIn URL are one person (repeat attendee).
 * - Without a valid URL, the same email is one person. Names alone never merge anyone.
 * - Exact duplicate rows are dropped and flagged; conflicting details are flagged, not resolved.
 * - Records combined by one URL that give different names are an unresolved identity: the profile
 *   is shown but held for review. Different emails alone do not block (work vs personal is common).
 * - Each person gets a durable ID from the identifier they were grouped by (see identity.ts), never
 *   from a name, the row order or which source ID sorts first. Duplicate IDs are an error.
 */

import { parseCsv, type CsvRecord } from './csv';
import { DataValidationError } from './errors';
import { parseHistory } from './history';
import { anchorKey, assertUnique, attendanceIdFor, hash64, personIdFor, type AnchorKind } from './identity';
import { isValidLinkedinUrl, normalize, normalizeEmail, normalizeLinkedinUrl, splitList } from './text';
import type {
  Attendance,
  AttendeeRecord,
  Candidate,
  Dataset,
  Employee,
  Job,
  Profile,
  ProfileRecord,
  ProfileStatus,
  SourceTexts,
} from './types';

export { DataValidationError };

const REQUIRED_COLUMNS = {
  attendees: ['hubspot_id', 'full_name', 'email', 'conference_name', 'conference_domain', 'conference_date', 'linkedin_url'],
  profiles: ['linkedin_url', 'full_name', 'current_company', 'current_title', 'years_experience', 'top_skills', 'industry', 'wsc_mutual_connections'],
  employees: ['employee_id', 'full_name', 'title'],
  jobs: ['job_id', 'title', 'seniority', 'required_skills', 'nice_to_have'],
} as const;

const OPTIONAL_COLUMNS = {
  attendees: ['company', 'title', 'source', 'notes'],
  profiles: ['location', 'past_companies', 'past_titles'],
  employees: ['department', 'linkedin_id', 'work_history'],
  jobs: ['department', 'key_domains'],
} as const;

type FileName = keyof typeof REQUIRED_COLUMNS;

function readFile(name: FileName, text: string, problems: string[], warnings: string[]): CsvRecord[] {
  const { header, records } = parseCsv(text);
  if (header.length === 0) {
    problems.push(`${name}: file is empty`);
    return [];
  }
  const missing = REQUIRED_COLUMNS[name].filter((c) => !header.includes(c));
  if (missing.length > 0) problems.push(`${name}: missing column(s) ${missing.join(', ')}`);
  const missingOptional = OPTIONAL_COLUMNS[name].filter((c) => !header.includes(c));
  if (missingOptional.length > 0) warnings.push(`${name}: optional column(s) absent: ${missingOptional.join(', ')}`);
  return records.map((r) => {
    const trimmed: CsvRecord = {};
    for (const [k, v] of Object.entries(r)) trimmed[k] = v.trim();
    return trimmed;
  });
}

function rowSignature(r: CsvRecord): string {
  return JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
}

function dedupeExact<T extends CsvRecord>(rows: T[]): { unique: T[]; dropped: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const dropped: T[] = [];
  for (const r of rows) {
    const sig = rowSignature(r);
    if (seen.has(sig)) dropped.push(r);
    else {
      seen.add(sig);
      unique.push(r);
    }
  }
  return { unique, dropped };
}

function toJob(r: CsvRecord): Job {
  return {
    jobId: r.job_id ?? '',
    title: r.title ?? '',
    department: r.department ?? '',
    seniority: r.seniority ?? '',
    keyDomains: splitList(r.key_domains),
    requiredSkills: splitList(r.required_skills),
    niceToHave: splitList(r.nice_to_have),
  };
}

function toEmployee(r: CsvRecord): Employee {
  return {
    employeeId: r.employee_id ?? '',
    fullName: r.full_name ?? '',
    title: r.title ?? '',
    department: r.department ?? '',
    workHistory: parseHistory(r.work_history, 'employer'),
  };
}

function toProfile(r: ProfileRecord): Profile {
  const years = r.years_experience === '' ? NaN : Number(r.years_experience);
  return {
    linkedinUrl: normalizeLinkedinUrl(r.linkedin_url),
    fullName: r.full_name,
    currentCompany: r.current_company,
    currentTitle: r.current_title,
    location: r.location ?? '',
    yearsExperience: Number.isFinite(years) && years >= 0 ? years : null,
    skills: splitList(r.top_skills),
    industry: r.industry,
    pastCompanies: splitList(r.past_companies),
    pastRoles: parseHistory(r.past_titles, 'role'),
    connectionIds: splitList(r.wsc_mutual_connections).map((id) => id.toUpperCase()),
  };
}

/** Start of the flag for one LinkedIn URL whose attendee records give different names. */
export const NAME_CONFLICT_FLAG = 'attendee records give different names';

function distinct(values: string[], key: (v: string) => string = normalize): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    if (v && !seen.has(key(v))) seen.set(key(v), v);
  }
  return [...seen.values()];
}

/** Parse, validate and combine the four files. Throws DataValidationError on unusable input. */
export function buildDataset(sources: SourceTexts): Dataset {
  const problems: string[] = [];
  const warnings: string[] = [];
  const attendeeRows = readFile('attendees', sources.attendees, problems, warnings) as unknown as AttendeeRecord[];
  const profileRows = readFile('profiles', sources.profiles, problems, warnings) as unknown as ProfileRecord[];
  const employeeRows = readFile('employees', sources.employees, problems, warnings);
  const jobRows = readFile('jobs', sources.jobs, problems, warnings);
  if (problems.length > 0) throw new DataValidationError(problems);

  // Jobs
  const jobs: Job[] = [];
  for (const r of jobRows) {
    const job = toJob(r);
    if (!job.jobId) warnings.push('jobs: a row without job_id was ignored');
    else if (jobs.some((j) => j.jobId === job.jobId)) warnings.push(`jobs: duplicate ${job.jobId} ignored (first kept)`);
    else jobs.push(job);
  }
  if (jobs.length === 0) throw new DataValidationError(['jobs: no usable job rows']);

  // Employees
  const employees = new Map<string, Employee>();
  for (const r of employeeRows) {
    const e = toEmployee(r);
    const id = e.employeeId.toUpperCase();
    if (!id) warnings.push('employees: a row without employee_id was ignored');
    else if (employees.has(id)) warnings.push(`employees: duplicate ${id} ignored (first kept)`);
    else employees.set(id, { ...e, employeeId: id });
  }

  // Profiles, indexed by normalized URL
  const { unique: profileUnique, dropped: profileDupes } = dedupeExact(profileRows as unknown as CsvRecord[]);
  for (const d of profileDupes) warnings.push(`profiles: exact duplicate row for ${d.linkedin_url} ignored`);
  const profilesByUrl = new Map<string, Profile[]>();
  for (const r of profileUnique as unknown as ProfileRecord[]) {
    if (!r.linkedin_url) {
      warnings.push(`profiles: row for "${r.full_name}" has no linkedin_url and cannot be matched`);
      continue;
    }
    const p = toProfile(r);
    profilesByUrl.set(p.linkedinUrl, [...(profilesByUrl.get(p.linkedinUrl) ?? []), p]);
  }

  // Attendees → groups (one per person)
  const { unique: attendees, dropped: attendeeDupes } = dedupeExact(attendeeRows as unknown as CsvRecord[]);
  // Grouped by identity anchor: valid LinkedIn URL, else email, else source contact ID, else the row itself.
  const groups = new Map<string, { kind: AnchorKind; rows: AttendeeRecord[]; flags: string[] }>();
  for (const raw of attendees) {
    const r = raw as unknown as AttendeeRecord;
    const url = r.linkedin_url ? normalizeLinkedinUrl(r.linkedin_url) : '';
    const email = r.email ? normalizeEmail(r.email) : '';
    const [kind, value]: [AnchorKind, string] =
      url && isValidLinkedinUrl(url)
        ? ['linkedin', url]
        : email
          ? ['email', email]
          : r.hubspot_id
            ? ['source_id', r.hubspot_id]
            : ['row', hash64(rowSignature(raw))];
    const key = anchorKey(kind, value);
    const g = groups.get(key) ?? { kind, rows: [], flags: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  for (const d of attendeeDupes) {
    for (const g of groups.values()) {
      if (g.rows.some((r) => r.hubspot_id === d.hubspot_id)) {
        g.flags.push(`duplicate attendee row ${d.hubspot_id || '(no id)'} ignored`);
        break;
      }
    }
  }

  const candidates: Candidate[] = [];
  const conflicts = new Map<Candidate, string[]>();
  const rowEmails = new Map<Candidate, string[]>();
  for (const [anchor, { kind, rows, flags }] of groups) {
    rows.sort((a, b) => a.conference_date.localeCompare(b.conference_date) || a.hubspot_id.localeCompare(b.hubspot_id));
    const ids = [...new Set(rows.map((r) => r.hubspot_id).filter(Boolean))].sort();
    const names = distinct(rows.map((r) => r.full_name));
    const emails = distinct(rows.map((r) => r.email));
    const urls = distinct(rows.map((r) => r.linkedin_url), normalizeLinkedinUrl);
    const dataQualityFlags = [...flags];
    if (ids.length === 0) dataQualityFlags.push('attendee row has no hubspot_id');
    if (names.length > 1) dataQualityFlags.push(`${NAME_CONFLICT_FLAG}: ${names.join(' / ')}; confirm they are one person`);
    if (emails.length > 1) dataQualityFlags.push(`attendee records give different emails (left blank): ${emails.join(' / ')}`);
    if (emails.length === 0) dataQualityFlags.push('no email on attendee record');
    if (urls.length > 1) dataQualityFlags.push(`attendee records give different LinkedIn URLs: ${urls.join(' / ')}`);
    if (rows.length > 1) dataQualityFlags.push(`attended ${rows.length} events; records combined by ${urls.length === 1 && isValidLinkedinUrl(urls[0]!) ? 'LinkedIn URL' : 'email'}`);

    const rawUrl = urls[0] ?? '';
    const url = rawUrl ? normalizeLinkedinUrl(rawUrl) : '';
    let profileStatus: ProfileStatus;
    let profile: Profile | null = null;
    if (!url) {
      profileStatus = 'missing_url';
      dataQualityFlags.push('no LinkedIn URL on attendee record');
    } else if (!isValidLinkedinUrl(url)) {
      profileStatus = 'invalid_url';
      dataQualityFlags.push(`LinkedIn URL is not a profile link: ${rawUrl}`);
    } else {
      const matches = profilesByUrl.get(url) ?? [];
      if (matches.length === 0) {
        profileStatus = 'unmatched';
        dataQualityFlags.push('LinkedIn URL has no matching profile in the enrichment file');
      } else if (matches.length > 1) {
        profileStatus = 'conflict';
        dataQualityFlags.push(`${matches.length} different profiles share this LinkedIn URL (${matches.map((m) => m.fullName).join(' / ')}); not scored`);
      } else {
        profile = matches[0]!;
        const nameAgrees = names.some((n) => normalize(n) === normalize(profile!.fullName));
        if (names.length > 1) {
          // Matching one of the names is not enough: the other record may be a different person.
          profileStatus = 'conflict';
        } else if (nameAgrees) {
          profileStatus = 'matched';
        } else {
          profileStatus = 'conflict';
          dataQualityFlags.push(`name differs: attendee "${names.join(' / ')}" vs profile "${profile.fullName}"; confirm same person`);
        }
        if (profile.yearsExperience === null) dataQualityFlags.push('years_experience missing or not a number');
        if (profile.skills.length === 0) dataQualityFlags.push('profile lists no skills');
      }
    }

    const personId = personIdFor(anchor);
    const reasons: string[] = [];
    if (names.length > 1) reasons.push(`records give different names: ${names.join(' / ')}`);
    if (urls.length > 1) reasons.push('records give different LinkedIn URLs');
    if (profileStatus === 'conflict' && names.length <= 1) reasons.push('the LinkedIn profile does not match the attendee');
    const candidate: Candidate = {
      candidateKey: personId,
      identity: { anchor, kind, status: 'resolved', relatedPersonIds: [], reasons: [] },
      sourceContactIds: ids,
      fullName: names[0] ?? profile?.fullName ?? '',
      email: emails.length === 1 ? emails[0]! : '',
      linkedinUrl: url,
      attendances: rows.map(
        (r): Attendance => ({
          attendanceId: attendanceIdFor(personId, rowSignature(r as unknown as CsvRecord)),
          hubspotId: r.hubspot_id,
          conferenceName: r.conference_name,
          conferenceDomain: r.conference_domain,
          conferenceDate: r.conference_date,
          source: r.source ?? '',
          notes: r.notes ?? '',
          listedTitle: r.title ?? '',
          listedCompany: r.company ?? '',
        }),
      ),
      profileStatus,
      profile,
      dataQualityFlags,
    };
    candidates.push(candidate);
    conflicts.set(candidate, reasons);
    rowEmails.set(candidate, [...new Set(emails.map(normalizeEmail))]);
  }

  // IDs must be unique before anything is keyed by them; a clash stops the build instead of overwriting someone.
  assertUnique(candidates.map((c) => c.candidateKey), 'person IDs');
  assertUnique(candidates.flatMap((c) => c.attendances.map((a) => a.attendanceId)), 'attendance IDs');

  // Cross-person checks: never merge, only flag.
  const byEmail = new Map<string, Candidate[]>();
  const byId = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.email) byEmail.set(normalizeEmail(c.email), [...(byEmail.get(normalizeEmail(c.email)) ?? []), c]);
    for (const id of c.sourceContactIds) byId.set(id, [...(byId.get(id) ?? []), c]);
  }
  for (const [email, list] of byEmail) {
    if (list.length < 2) continue;
    for (const c of list) {
      const others = list.filter((o) => o !== c).map((o) => o.candidateKey);
      c.dataQualityFlags.push(`shares email ${email} with ${others.join(', ')}; possible duplicate person, not merged`);
    }
  }
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    for (const c of list) {
      const others = list.filter((o) => o !== c).map((o) => o.candidateKey);
      c.dataQualityFlags.push(`HubSpot ID ${id} also used by ${others.join(', ')} with different details`);
    }
  }

  // Identity status. Every email and URL on any of a person's rows counts, so an email-only record of
  // someone already known by LinkedIn URL is a possible duplicate, not a fresh person.
  const sharing = new Map<string, Set<Candidate>>();
  const share = (key: string, c: Candidate) => sharing.set(key, (sharing.get(key) ?? new Set()).add(c));
  for (const c of candidates) {
    for (const at of c.attendances) if (at.hubspotId) share(`source ID ${at.hubspotId}`, c);
    for (const e of rowEmails.get(c) ?? []) share(`email ${e}`, c);
    if (c.linkedinUrl) share(`LinkedIn ${c.linkedinUrl}`, c);
  }
  for (const c of candidates) {
    const related = new Set<string>();
    const shared: string[] = [];
    for (const [what, set] of sharing) {
      if (set.size < 2 || !set.has(c)) continue;
      shared.push(`shares ${what}`);
      for (const o of set) if (o !== c) related.add(o.candidateKey);
    }
    const own = conflicts.get(c)!;
    c.identity.relatedPersonIds = [...related].sort();
    if (own.length > 0) c.identity = { ...c.identity, status: 'conflict', reasons: [...own, ...shared] };
    else if (shared.length > 0) c.identity = { ...c.identity, status: 'possible_duplicate', reasons: shared };
    else if (c.identity.kind === 'row') c.identity = { ...c.identity, status: 'unanchored', reasons: ['no email, LinkedIn URL or contact ID'] };
  }

  candidates.sort((a, b) => a.candidateKey.localeCompare(b.candidateKey));
  return { jobs, employees, candidates, warnings };
}
