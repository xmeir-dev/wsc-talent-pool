/**
 * The list page's model: every attendee once, with the jobs they are worth a look for.
 * Every decision still comes from the pipeline (assessJob); this file only groups and filters it.
 */
import { assessJob, splitName, toCsv, toOutputRows } from '../pipeline';
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

export interface Conference {
  name: string;
  date: string;
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
    items.set(job.jobId, new Map(result.candidates.map((a, i) => [a.candidate.candidateKey, { a, row: rows[i]! }])));
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

  const seen = new Map<string, Conference>();
  for (const c of dataset.candidates)
    for (const at of c.attendances) if (!seen.has(at.conferenceName)) seen.set(at.conferenceName, { name: at.conferenceName, date: at.conferenceDate });
  const conferences = [...seen.values()].sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name));

  return { jobs: dataset.jobs, results, items, attendees, conferences };
}

/** True when the person attended any of the chosen conferences; none chosen means every conference. */
export const attended = (c: Candidate, conferences: readonly string[]): boolean =>
  conferences.length === 0 || c.attendances.some((at) => conferences.includes(at.conferenceName));

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
 * needs review, in job order, no relevant job last. Descending reverses the order.
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
    const best = Math.min(...p.relevantFor.map((r) => rank[r.outcome] * jobs.length + jobs.indexOf(r.job)));
    return [Number.isFinite(best) ? best : Infinity];
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

/** How many attendees went to each conference, and how many are shortlist or needs review for each job. */
export function filterCounts(pool: Pool): { conferences: Map<string, number>; jobs: Map<string, number> } {
  const conferences = new Map(pool.conferences.map((c) => [c.name, 0]));
  for (const p of pool.attendees)
    for (const name of new Set(p.candidate.attendances.map((at) => at.conferenceName)))
      conferences.set(name, (conferences.get(name) ?? 0) + 1);
  const jobs = new Map(pool.jobs.map((j) => [j.jobId, jobItems(pool, j.jobId, []).length]));
  return { conferences, jobs };
}

/**
 * The job a profile opens on: shortlist before needs review, then points, then job order.
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
      (order[a.recommendation] === order[bestA.recommendation] && a.points.total > bestA.points.total);
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

/**
 * The attendee list as shown (filtered rows, same order). A person's several conferences are joined with "; ".
 * The file name carries the filter: attendees_<conference slugs>_<job ids>.csv.
 */
export function attendeesCsv(
  attendees: Attendee[],
  conferences: readonly string[] = [],
  jobIds: readonly string[] = [],
  countries: readonly string[] = [],
): { fileName: string; text: string } {
  const rows = attendees.map(({ candidate: c, any, relevantFor }) => ({
    full_name: c.fullName,
    ...splitName(c.fullName),
    email: c.email,
    company: String(any.row.current_company ?? ''),
    title: String(any.row.current_title ?? ''),
    conference_name: c.attendances.map((at) => at.conferenceName).join('; '),
    conference_date: c.attendances.map((at) => at.conferenceDate).join('; '),
    linkedin_url: c.linkedinUrl,
    relevant_for: relevantFor.map((r) => `${r.job.jobId} ${OUTCOME_WORDS[r.outcome]}`).join('; '),
  }));
  const parts = [...conferences.map(slug), ...jobIds.map((id) => id.toLowerCase()), ...countries.map((c) => c.toLowerCase())];
  return { fileName: ['attendees', ...parts].join('_') + '.csv', text: toCsv(ATTENDEE_COLUMNS, rows) };
}
