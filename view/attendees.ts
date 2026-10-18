/**
 * The list page's model: every attendee once, with the jobs they are worth a look for.
 * Every decision still comes from the pipeline (assessJob); this file only groups and filters it.
 */

import { assessJob, splitName, toCsv, toOutputRows } from '../pipeline';
import type { Candidate, CandidateAssessment, Dataset, Job, JobAssessment, OutputRow } from '../pipeline';
import { currentRole } from './format';

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

export const attended = (c: Candidate, conference: string | null): boolean =>
  conference === null || c.attendances.some((at) => at.conferenceName === conference);

/** The job's shortlist then needs review, in pipeline rank order, at the chosen conference. */
export function jobItems(pool: Pool, jobId: string, conference: string | null): Item[] {
  return [...pool.items.get(jobId)!.values()].filter(({ a }) => isRelevant(a) && attended(a.candidate, conference));
}

/** The job a profile opens on when no job is chosen: shortlist before needs review, then points, then job order. */
export function bestJobId(pool: Pool, key: string): string {
  const order = { shortlist: 0, needs_review: 1, not_recommended_for_role: 2 } as const;
  let best = pool.jobs[0]!.jobId;
  let bestA = pool.items.get(best)!.get(key)!.a;
  for (const job of pool.jobs.slice(1)) {
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

/** The attendee list as shown (filtered rows, same order). Several conferences are joined with "; ". */
export function attendeesCsv(attendees: Attendee[], conference: string | null): { fileName: string; text: string } {
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
  const slug = conference ? '_' + conference.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
  return { fileName: `attendees${slug}.csv`, text: toCsv(ATTENDEE_COLUMNS, rows) };
}
