/**
 * Validate the four source files and combine them into one record per person.
 *
 * Identity rules:
 * - Attendee rows with the same LinkedIn URL (any spelling) are one person (repeat attendee); a row with no
 *   URL joins the one LinkedIn person with its email. Names alone never merge anyone (identity.ts: resolvePeople).
 * - Exact duplicate rows are dropped and flagged; conflicting details are flagged, not resolved.
 * - Attendee rows belong to event editions (events.ts); one person at one edition is one attendance, however
 *   many rows recorded it. Files are read strictly (csv.ts): a broken file stops with its line and column.
 * - Records combined by one URL that give different names are an unresolved identity: the profile
 *   is shown but held for review. Different emails alone do not block (work vs personal is common).
 * - Each person gets a durable ID from their identifiers (see identity.ts), never
 *   from a name, the row order or which source ID sorts first. Duplicate IDs are an error.
 */

import { CsvFormatError, parseCsv, type CsvRecord } from './csv';
import { DataValidationError } from './errors';
import { assignEditions, isIsoDate } from './events';
import { parseHistory } from './history';
import { assertUnique, attendanceIdFor, REGISTERED_IDS, resolvePeople, type IdentityRow } from './identity';
import { isValidLinkedinUrl, normalize, normalizeEmail, normalizeLinkedinUrl, splitList, uniqueSkills } from './text';
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

/** Every attendee column the pipeline reads. `event_id` is optional and not warned about when absent. */
export const ATTENDEE_SOURCE_COLUMNS = [...REQUIRED_COLUMNS.attendees, ...OPTIONAL_COLUMNS.attendees, 'event_id'] as const;

type FileName = keyof typeof REQUIRED_COLUMNS;

/** Reads one source file strictly: a structural CSV problem is reported with its line and column, never guessed around. */
function readFile(name: FileName, text: string, problems: string[], warnings: string[]): { records: CsvRecord[]; lines: number[] } {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (err) {
    if (!(err instanceof CsvFormatError)) throw err;
    problems.push(...err.problems.map((p) => `${name}: ${p}`));
    return { records: [], lines: [] };
  }
  const { header, records, lines } = parsed;
  if (header.length === 0) {
    problems.push(`${name}: file is empty`);
    return { records: [], lines: [] };
  }
  const missing = REQUIRED_COLUMNS[name].filter((c) => !header.includes(c));
  if (missing.length > 0) problems.push(`${name}: missing column(s) ${missing.join(', ')}`);
  const missingOptional = OPTIONAL_COLUMNS[name].filter((c) => !header.includes(c));
  if (missingOptional.length > 0) warnings.push(`${name}: optional column(s) absent: ${missingOptional.join(', ')}`);
  return { records: records.map(trimRecord), lines };
}

function trimRecord(r: CsvRecord): CsvRecord {
  const trimmed: CsvRecord = {};
  for (const [k, v] of Object.entries(r)) trimmed[k] = v.trim();
  return trimmed;
}

/** Attendee dates must be YYYY-MM-DD or blank (blank = an undated edition, see events.ts). */
function checkDates(rows: CsvRecord[], lines: number[], problems: string[]): void {
  const bad = rows.flatMap((r, i) => (r.conference_date && !isIsoDate(r.conference_date) ? [i] : []));
  for (const i of bad.slice(0, 10)) {
    problems.push(`attendees: line ${lines[i]}, conference_date: "${rows[i]!.conference_date}" is not a date; use YYYY-MM-DD, or leave it blank if unknown`);
  }
  if (bad.length > 10) problems.push(`attendees: …and ${bad.length - 10} more rows with a conference_date that is not a date`);
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
    // Every job, including one created in the demo, enters here: a repeated skill is one requirement.
    requiredSkills: uniqueSkills(splitList(r.required_skills)),
    niceToHave: uniqueSkills(splitList(r.nice_to_have)),
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
export interface BuildOptions {
  /** Identifier (`linkedin:<url>`, `email:<email>`) → person ID of people with saved history, so they keep their ID. */
  knownPeople?: ReadonlyMap<string, string>;
}

export function buildDataset(sources: SourceTexts, options: BuildOptions = {}): Dataset {
  const problems: string[] = [];
  const warnings: string[] = [];
  const attendeeFile = readFile('attendees', sources.attendees, problems, warnings);
  checkDates(attendeeFile.records, attendeeFile.lines, problems);
  // Same rule as both importers: a list with no attendees is a mistake, not an empty pool.
  if (attendeeFile.records.length === 0 && !problems.some((p) => p.startsWith('attendees:')))
    problems.push('attendees: the file has a header but no attendee rows');
  const attendeeRows = attendeeFile.records as unknown as AttendeeRecord[];
  const profileRows = readFile('profiles', sources.profiles, problems, warnings).records as unknown as ProfileRecord[];
  const employeeRows = readFile('employees', sources.employees, problems, warnings).records;
  const jobRows = readFile('jobs', sources.jobs, problems, warnings).records;
  if (problems.length > 0) throw new DataValidationError(problems);

  // Jobs
  const jobs: Job[] = [];
  for (const r of jobRows) {
    const job = toJob(r);
    if (!job.jobId) warnings.push('jobs: a row without job_id was ignored');
    else if (jobs.some((j) => j.jobId === job.jobId)) warnings.push(`jobs: duplicate ${job.jobId} ignored (first kept)`);
    else jobs.push(job);
    const listed = splitList(r.required_skills).length + splitList(r.nice_to_have).length;
    if (job.jobId && listed > job.requiredSkills.length + job.niceToHave.length) {
      warnings.push(`jobs: ${job.jobId} lists a skill more than once; each skill is counted once`);
    }
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
  // Event editions, decided over every row at once (events.ts): which run of which conference each row is.
  const { keys: editionKeys, editions } = assignEditions(attendees as unknown as AttendeeRecord[]);
  const editionOf = new Map(attendees.map((r, i) => [r, editionKeys[i]!]));
  const editionByKey = new Map(editions.map((e) => [e.key, e]));
  for (const e of editions) {
    if (!e.startDate) warnings.push(`attendees: ${e.label} has no date; kept as its own edition, not combined with any dated one`);
    // Same name and overlapping dates, but only some rows carry an event ID: probably one event split in two.
    if (e.eventId && e.startDate) {
      const twin = editions.find(
        (o) => !o.eventId && o.startDate && normalize(o.name) === normalize(e.name) && o.startDate <= e.endDate && e.startDate <= o.endDate,
      );
      if (twin)
        warnings.push(
          `attendees: ${e.label} (event_id ${e.eventId}) and ${twin.label} (no event_id) share a name and dates; kept apart. Add the event_id to every row if they are one event`,
        );
    }
  }
  // One person per group of rows sharing a strong identifier (identity.ts: resolvePeople). Names never merge.
  const people = resolvePeople(attendees as unknown as AttendeeRecord[], identityRowOf, knownMap(options.knownPeople));
  const groups = new Map(people.map((g) => [g.anchor, { ...g, flags: [] as string[] }]));
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
  for (const { anchor, kind, rows, flags, personId, identifiers, reasons: groupReasons } of groups.values()) {
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
    // One attendance per person and edition: several rows for the same edition (a second sign-up, a re-imported
    // list) are one attendance, not two events.
    const byEdition = new Map<string, AttendeeRecord[]>();
    for (const r of rows) {
      const key = editionOf.get(r as unknown as CsvRecord)!;
      byEdition.set(key, [...(byEdition.get(key) ?? []), r]);
    }
    for (const [key, same] of byEdition) {
      if (same.length > 1) {
        const ids = same.map((r) => r.hubspot_id || '(no id)').join(', ');
        dataQualityFlags.push(`${same.length} records for ${editionByKey.get(key)!.label} (${ids}); combined into one attendance`);
      }
    }
    if (byEdition.size > 1) dataQualityFlags.push(`attended ${byEdition.size} events; records combined by ${urls.length === 1 && isValidLinkedinUrl(urls[0]!) ? 'LinkedIn URL' : 'email'}`);

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

    const reasons: string[] = [...groupReasons];
    if (names.length > 1) reasons.push(`records give different names: ${names.join(' / ')}`);
    if (urls.length > 1) reasons.push('records give different LinkedIn URLs');
    if (profileStatus === 'conflict' && names.length <= 1) reasons.push('the LinkedIn profile does not match the attendee');
    const candidate: Candidate = {
      candidateKey: personId,
      identity: { anchor, kind, identifiers, status: 'resolved', relatedPersonIds: [], reasons: [] },
      sourceContactIds: ids,
      fullName: names[0] ?? profile?.fullName ?? '',
      email: emails.length === 1 ? emails[0]! : '',
      linkedinUrl: url,
      attendances: [...byEdition].map(([key, same]): Attendance => {
        const r = same[0]!;
        const edition = editionByKey.get(key)!;
        return {
          attendanceId: attendanceIdFor(personId, `edition:${key}`),
          editionKey: key,
          editionLabel: edition.label,
          eventId: edition.eventId,
          hubspotId: r.hubspot_id,
          conferenceName: r.conference_name,
          conferenceDomain: r.conference_domain,
          conferenceDate: r.conference_date,
          source: r.source ?? '',
          // Notes from every record of this attendance, each once.
          notes: [...new Set(same.map((x) => x.notes ?? '').filter(Boolean))].join(' / '),
          listedTitle: r.title ?? '',
          listedCompany: r.company ?? '',
        };
      }),
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
    // Same full name, nothing else in common: never merged, but neither record is trusted until someone checks
    // (e.g. "Ryan Patel" with a mistyped email must not slip past the real Ryan's active process).
    if (normalize(c.fullName)) share(`the name "${normalize(c.fullName)}"`, c);
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
  return { jobs, employees, candidates, editions, warnings };
}

/** What person resolution (identity.ts: resolvePeople) reads from one attendee row. */
function identityRowOf(r: AttendeeRecord): IdentityRow {
  const url = r.linkedin_url ? normalizeLinkedinUrl(r.linkedin_url) : '';
  return {
    linkedinUrl: url && isValidLinkedinUrl(url) ? url : '',
    email: r.email ? normalizeEmail(r.email) : '',
    sourceId: r.hubspot_id,
    name: r.full_name,
    signature: rowSignature(r as unknown as CsvRecord),
  };
}

const knownMap = (knownPeople?: ReadonlyMap<string, string>) =>
  knownPeople ? new Map([...knownPeople, ...REGISTERED_IDS]) : REGISTERED_IDS;

/**
 * Which new attendee rows would add something. A row whose person (resolved exactly as buildDataset does, with the
 * same known people) is already recorded at the same event edition on the same date, with no new LinkedIn URL or
 * email, in the pool or earlier in the same file, adds nothing: re-importing a list is harmless. Every other row is
 * kept (several rows of one person and edition still make one attendance in the build). `added` rows must already
 * be trimmed. People and editions are decided over existing + new rows together, as the build will, and skipping
 * only such rows leaves both unchanged.
 */
export function planAttendeeImport(
  existingAttendees: string,
  added: readonly CsvRecord[],
  options: BuildOptions = {},
): { add: number[]; alreadyRecorded: number[]; editionKeys: string[]; editions: Map<string, string> } {
  const existing = parseCsv(existingAttendees).records.map(trimRecord);
  const all = [...existing, ...added] as unknown as AttendeeRecord[];
  const { keys, editions } = assignEditions(all);
  const personOf = new Map<AttendeeRecord, string>();
  for (const g of resolvePeople(all, identityRowOf, knownMap(options.knownPeople))) for (const r of g.rows) personOf.set(r, g.personId);
  // A row is skipped only when it adds nothing at all: the same person, edition and date is already recorded, and
  // every LinkedIn URL / email on it is already on those rows. Then dropping it changes neither the editions (the
  // name still has that date) nor who is who, so the preview, the committed pool and the CLI on the same rows agree.
  // A new day of the same edition, or a row adding an identifier, is kept and joins that one attendance.
  const seen = new Map<string, Set<string>>();
  const identifiersOf = (r: AttendeeRecord) => {
    const k = identityRowOf(r);
    return [...(k.linkedinUrl ? [`linkedin:${k.linkedinUrl}`] : []), ...(k.email ? [`email:${k.email}`] : [])];
  };
  const record = (i: number) => {
    const key = `${personOf.get(all[i]!)}|${keys[i]}|${all[i]!.conference_date}`;
    const ids = seen.get(key) ?? new Set<string>();
    const isNew = !seen.has(key) || identifiersOf(all[i]!).some((id) => !ids.has(id));
    for (const id of identifiersOf(all[i]!)) ids.add(id);
    seen.set(key, ids);
    return isNew;
  };
  existing.forEach((_, i) => record(i));
  const add: number[] = [];
  const alreadyRecorded: number[] = [];
  added.forEach((_, j) => (record(existing.length + j) ? add : alreadyRecorded).push(j));
  return {
    add,
    alreadyRecorded,
    editionKeys: keys.slice(existing.length),
    editions: new Map(editions.map((e) => [e.key, e.label])),
  };
}
