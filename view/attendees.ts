/**
 * The list page's model: every attendee once, with the jobs they are worth a look for.
 * Every decision still comes from the pipeline (assessJob); this file only groups and filters it.
 */
import { assessJob, compareSkills, indexByPersonId, skillKey, splitName, toOutputRows, toXlsx, XLSX_MIME } from '../pipeline';
import type { Candidate, CandidateAssessment, Dataset, Job, JobAssessment, OutputRow } from '../pipeline';
import { currentRole } from './format';
import { placeOf } from './place';

/** One person's assessment for one job, with its CSV row. */
export interface Item {
  a: CandidateAssessment;
  row: OutputRow;
}

export type Relevant = 'shortlist' | 'needs_review';

export interface Attendee {
  candidate: Candidate;
  role: string;
  /** Any job's assessment: connections and contact details do not depend on the job. */
  any: Item;
  /** Jobs where the person is shortlist or needs review, in job order. */
  relevantFor: { job: Job; outcome: Relevant; a: CandidateAssessment }[];
}

/** One event edition (pipeline/events.ts): the filter value is its key, never the bare name. */
export interface Conference {
  key: string;
  name: string;
  /** First day; '' when the edition has no date. */
  date: string;
  /** The name alone, or with its year/date when another edition shares the name. */
  label: string;
}

export interface Pool {
  jobs: Job[];
  results: Map<string, JobAssessment>;
  /** jobId → candidateKey → item. */
  items: Map<string, Map<string, Item>>;
  attendees: Attendee[];
  conferences: Conference[];
}

const isRelevant = (a: CandidateAssessment): a is CandidateAssessment & { recommendation: Relevant } =>
  a.recommendation === 'shortlist' || a.recommendation === 'needs_review';

export function buildPool(dataset: Dataset): Pool {
  const results = new Map<string, JobAssessment>();
  const items = new Map<string, Map<string, Item>>();
  for (const job of dataset.jobs) {
    const result = assessJob(dataset, job.jobId);
    const rows = toOutputRows(result);
    results.set(job.jobId, result);
    // Keyed by durable person ID; a duplicate ID throws instead of handing one person another's assessment.
    items.set(job.jobId, indexByPersonId(result.candidates.map((a, i) => ({ a, row: rows[i]! })), ({ a }) => a.candidate.candidateKey));
  }

  const first = dataset.jobs[0]!.jobId;
  // Name order, A–Z; the candidate key breaks ties so the order never depends on input order.
  const attendees: Attendee[] = dataset.candidates
    .map((candidate) => {
      const key = candidate.candidateKey;
      const any = items.get(first)!.get(key)!;
      const relevantFor = dataset.jobs.flatMap((job) => {
        const a = items.get(job.jobId)!.get(key)!.a;
        return isRelevant(a) ? [{ job, outcome: a.recommendation, a }] : [];
      });
      return { candidate, role: currentRole(any.row), any, relevantFor };
    })
    .sort(
      (x, y) =>
        x.candidate.fullName.localeCompare(y.candidate.fullName, 'en') ||
        x.candidate.candidateKey.localeCompare(y.candidate.candidateKey),
    );

  // Every edition, already in date order (undated last).
  const conferences = dataset.editions.map((e) => ({ key: e.key, name: e.name, date: e.startDate, label: e.label }));

  return { jobs: dataset.jobs, results, items, attendees, conferences };
}

/** True when the person attended any of the chosen event editions (keys); none chosen means every conference. */
export const attended = (c: Candidate, conferences: readonly string[]): boolean =>
  conferences.length === 0 || c.attendances.some((at) => conferences.includes(at.editionKey));

/** True when the person is based in any of the chosen countries (ISO codes); none chosen means anywhere. */
export const basedIn = (c: Candidate, countries: readonly string[]): boolean =>
  countries.length === 0 || countries.includes(placeOf(c)?.code ?? '');

/** The job's shortlist then needs review, in pipeline rank order, at the chosen conferences and countries. */
export function jobItems(pool: Pool, jobId: string, conferences: readonly string[], countries: readonly string[] = []): Item[] {
  return [...pool.items.get(jobId)!.values()].filter(
    ({ a }) => isRelevant(a) && attended(a.candidate, conferences) && basedIn(a.candidate, countries),
  );
}

/** The attendee list: at any chosen conference, and shortlist or needs review for any chosen job. Empty = no filter. */
export function filterAttendees(
  pool: Pool,
  conferences: readonly string[],
  jobIds: readonly string[],
  countries: readonly string[] = [],
): Attendee[] {
  return pool.attendees.filter(
    (p) =>
      attended(p.candidate, conferences) &&
      basedIn(p.candidate, countries) &&
      (jobIds.length === 0 || p.relevantFor.some((r) => jobIds.includes(r.job.jobId))),
  );
}

/** Where attendees are based: one entry per country, A–Z by name, with how many attendees live there. */
export function countryCounts(pool: Pool): { code: string; country: string; count: number }[] {
  const byCode = new Map<string, { code: string; country: string; count: number }>();
  for (const p of pool.attendees) {
    const place = placeOf(p.candidate);
    if (!place) continue;
    const entry = byCode.get(place.code) ?? { code: place.code, country: place.country, count: 0 };
    entry.count += 1;
    byCode.set(place.code, entry);
  }
  return [...byCode.values()].sort((x, y) => x.country.localeCompare(y.country, 'en'));
}

/** The attendee table's sortable columns. */
export type SortKey = 'candidate' | 'conference' | 'relevant';

/**
 * The attendee list sorted by a column header; ties keep name order (the list arrives A–Z).
 * Candidate: name. Conference: earliest conference first. Relevant job: best match, shortlist before
 * needs review, in job order, best skills first within a job, no relevant job last. Descending reverses the order.
 */
export function sortAttendees(list: Attendee[], sort: { columnId: string; direction: 'asc' | 'desc' } | null, jobs: Job[]): Attendee[] {
  if (!sort) return list;
  const sorted = sortBy(list, sort.columnId as SortKey, jobs);
  return sort.direction === 'desc' ? [...sorted].reverse() : sorted;
}

function sortBy(list: Attendee[], by: SortKey, jobs: Job[]): Attendee[] {
  if (by === 'candidate') return list;
  const rank = { shortlist: 0, needs_review: 1 } as const;
  const key = (p: Attendee): (string | number)[] => {
    if (by === 'conference') {
      const first = [...p.candidate.attendances].sort((x, y) => x.conferenceDate.localeCompare(y.conferenceDate))[0];
      return first ? [first.conferenceDate, first.conferenceName] : ['~', ''];
    }
    const scored = p.relevantFor.map((r) => ({ key: rank[r.outcome] * jobs.length + jobs.indexOf(r.job), skills: skillKey(r.a.tally) }));
    if (scored.length === 0) return [Infinity];
    const best = scored.reduce((x, y) => (y.key < x.key ? y : x));
    return [best.key, ...best.skills.map((n) => -n)];
  };
  const cmp = (x: (string | number)[], y: (string | number)[]) => {
    for (let i = 0; i < x.length; i++) {
      const a = x[i]!;
      const b = y[i]!;
      const d = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en');
      if (d) return d;
    }
    return 0;
  };
  return list
    .map((p, i) => ({ p, i, k: key(p) }))
    .sort((x, y) => cmp(x.k, y.k) || x.i - y.i)
    .map(({ p }) => p);
}

/** How many attendees went to each event edition (by key), and how many are shortlist or needs review for each job. */
export function filterCounts(pool: Pool): { conferences: Map<string, number>; jobs: Map<string, number> } {
  const conferences = new Map(pool.conferences.map((c) => [c.key, 0]));
  for (const p of pool.attendees)
    for (const key of new Set(p.candidate.attendances.map((at) => at.editionKey))) conferences.set(key, (conferences.get(key) ?? 0) + 1);
  const jobs = new Map(pool.jobs.map((j) => [j.jobId, jobItems(pool, j.jobId, []).length]));
  return { conferences, jobs };
}

/**
 * The job a profile opens on: shortlist before needs review, then skills, then job order.
 * Limited to `among` when given (the jobs chosen in the filter), else every job.
 */
export function bestJobId(pool: Pool, key: string, among: readonly string[] = []): string {
  const order = { shortlist: 0, needs_review: 1, not_recommended_for_role: 2 } as const;
  const jobs = among.length ? pool.jobs.filter((j) => among.includes(j.jobId)) : pool.jobs;
  let best = jobs[0]!.jobId;
  let bestA = pool.items.get(best)!.get(key)!.a;
  for (const job of jobs.slice(1)) {
    const a = pool.items.get(job.jobId)!.get(key)!.a;
    const better =
      order[a.recommendation] < order[bestA.recommendation] ||
      (order[a.recommendation] === order[bestA.recommendation] && compareSkills(a.tally, bestA.tally) < 0);
    if (better) {
      best = job.jobId;
      bestA = a;
    }
  }
  return best;
}

export const OUTCOME_WORDS: Record<Relevant, string> = { shortlist: 'shortlist', needs_review: 'needs review' };

export const ATTENDEE_COLUMNS = [
  'full_name',
  'firstname',
  'lastname',
  'email',
  'company',
  'title',
  'conference_name',
  'conference_date',
  'linkedin_url',
  'relevant_for',
] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export type AttendeeRow = Record<(typeof ATTENDEE_COLUMNS)[number], string>;

/**
 * The attendee list as shown (filtered rows, same order). A person's several events are joined with "; ";
 * conference_name is each event edition's label, so two runs of one conference stay apart.
 * The file name carries the filter: attendees_<edition slugs>_<job ids>_<countries>.
 */
export function attendeesTable(
  attendees: Attendee[],
  conferenceLabels: readonly string[] = [],
  jobIds: readonly string[] = [],
  countries: readonly string[] = [],
): { baseName: string; rows: AttendeeRow[] } {
  const rows = attendees.map(({ candidate: c, any, relevantFor }) => ({
    full_name: c.fullName,
    ...splitName(c.fullName),
    email: c.email,
    company: String(any.row.current_company ?? ''),
    title: String(any.row.current_title ?? ''),
    conference_name: c.attendances.map((at) => at.editionLabel).join('; '),
    conference_date: c.attendances.map((at) => at.conferenceDate).join('; '),
    linkedin_url: c.linkedinUrl,
    relevant_for: relevantFor.map((r) => `${r.job.jobId} ${OUTCOME_WORDS[r.outcome]}`).join('; '),
  }));
  const parts = [...conferenceLabels.map(slug), ...jobIds.map((id) => id.toLowerCase()), ...countries.map((c) => c.toLowerCase())];
  return { baseName: ['attendees', ...parts].join('_'), rows };
}

/** The attendee list as shown, as an Excel workbook: every cell is text, exactly as in the pool (xlsx.ts). */
export function attendeesXlsx(
  attendees: Attendee[],
  conferenceLabels: readonly string[] = [],
  jobIds: readonly string[] = [],
  countries: readonly string[] = [],
): { fileName: string; data: Uint8Array; type: string } {
  const { baseName, rows } = attendeesTable(attendees, conferenceLabels, jobIds, countries);
  return {
    fileName: `${baseName}.xlsx`,
    data: toXlsx('Attendees', ATTENDEE_COLUMNS.map((name) => ({ name, type: 'text' as const })), rows),
    type: XLSX_MIME,
  };
}
