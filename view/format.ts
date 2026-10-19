/**
 * Display wording only. Every decision (outcome, rank, gaps, references) comes from the pipeline;
 * this file just chooses which pipeline field to show and how to label it.
 */

import type {
  CandidateAssessment,
  ConferenceRelevance,
  Job,
  MatchKind,
  OutputRow,
  PossibleReference,
  Recommendation,
} from '../pipeline';
import { minYearsFor, policyFor } from '../pipeline';

/** "JOB001 · Senior ML Engineer": how a job reads in pickers. */
export function jobLabel(job: Job): string {
  return `${job.jobId} · ${job.title}`;
}

const CONFERENCE_SHORT: Record<string, string> = {
  'SportsTech Innovation Summit': 'SportsTech',
  'Broadcast & Streaming Technology Expo': 'Broadcast Expo',
  'Data & AI Summit Europe': 'Data & AI Summit',
  'DevOps World 2025': 'DevOps World',
  'WSC Product Meetup': 'WSC Meetup',
};

/** "Data & AI Summit Europe" → "Data & AI Summit": how a conference reads in the filter. Unknown names stay whole. */
export function conferenceShort(name: string): string {
  return CONFERENCE_SHORT[name] ?? name;
}

/** "Senior Product Manager - Sports Data" → "Senior PM - Sports Data": the job filter's button only. */
export function jobShort(job: Job): string {
  return job.title.replace(/\bProduct Manager\b/, 'PM');
}

/** "2024-11-14" → "14 Nov 2024"; anything else is shown as given. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

export const OUTCOME_LABEL: Record<Recommendation, string> = {
  shortlist: 'Shortlist',
  needs_review: 'Needs review',
  not_recommended_for_role: 'Not recommended for this role',
};

/** Shorter outcome wording for the table's status pill; the detail keeps OUTCOME_LABEL. */
export const TABLE_OUTCOME_LABEL: Record<Recommendation, string> = {
  shortlist: 'Shortlist',
  needs_review: 'Needs review',
  not_recommended_for_role: 'Not recommended',
};

export const OUTCOME_TONE: Record<Recommendation, 'good' | 'warn' | 'neutral'> = {
  shortlist: 'good',
  needs_review: 'warn',
  not_recommended_for_role: 'neutral',
};

export const RELEVANCE_LABEL: Record<ConferenceRelevance, string> = {
  relevant: 'Relevant',
  adjacent: 'Adjacent',
  not_relevant: 'Not relevant',
  unknown: 'Unknown',
};

export function hasProfile(a: CandidateAssessment): boolean {
  return a.candidate.profile !== null;
}

export function currentRole(row: OutputRow): string {
  const title = String(row.current_title ?? '');
  const company = String(row.current_company ?? '');
  if (title && company) return `${title}, ${company}`;
  return title || company;
}

export function fitReason(a: CandidateAssessment): string {
  return a.outcomeReasons[0] ?? '';
}

/** Missing information reads as "Unknown", never as a gap the person was found to have. */
export function mainGap(a: CandidateAssessment): { text: string; unknown: boolean } {
  if (!hasProfile(a)) return { text: 'Unknown: no usable profile', unknown: true };
  const gap = a.missingEssentials[0] ? `Missing must-have: ${a.missingEssentials[0]}` : a.skillGaps[0];
  return { text: gap ?? 'None identified', unknown: false };
}

export function referenceSummary(a: CandidateAssessment): { text: string; unknown: boolean } {
  const c = a.connections;
  if (c.status === 'unknown') return { text: 'Unknown', unknown: true };
  const names = c.resolved.map((e) => e.fullName);
  if (c.unresolvedIds.length > 0) names.push(`${c.unresolvedIds.length} unresolved ID${c.unresolvedIds.length > 1 ? 's' : ''}`);
  return { text: names.length > 0 ? names.join(', ') : 'None listed', unknown: false };
}

export function matchLabel(skill: string, kind: MatchKind, evidence: string | null): string {
  switch (kind) {
    case 'named':
      return evidence && evidence.toLowerCase() !== skill.toLowerCase() ? `On profile as ${evidence}` : 'On profile';
    case 'equivalent':
      return `Related skill: ${evidence}`;
    case 'inferred':
      return `Likely, from ${evidence}; please confirm`;
    default:
      return 'Not on profile';
  }
}

export function years(start: number, end: number | null): string {
  const to = end === null || end === Infinity ? 'present' : String(end);
  return start === end ? String(start) : `${start}–${to}`;
}

export function referenceLine(r: PossibleReference): string {
  return `Both at ${r.company}, ${years(r.overlapStart, r.overlapEnd)}`;
}

export type FitCheckKey = 'must' | 'skills' | 'years';

export interface FitCheck {
  key: FitCheckKey;
  ok: boolean;
  /** What was checked: "Must-have skills". */
  name: string;
  /** What the profile shows: "missing Sports Analytics". */
  detail: string;
  /** One line for the hover: name and detail. */
  tip: string;
}

const CHECK_NAME: Record<FitCheckKey, string> = {
  must: 'Must-have skills',
  skills: 'Required skills',
  years: 'Experience',
};

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const check = (key: FitCheckKey, ok: boolean, detail: string): FitCheck => ({
  key,
  ok,
  name: CHECK_NAME[key],
  detail,
  tip: `${CHECK_NAME[key]}: ${detail}`,
});

/**
 * The three shortlist checks, shown one icon each. All three pass exactly when the pipeline shortlists
 * (pipeline/assess.ts). A profile that cannot be judged fails all three, with the reason, never a guess.
 */
export function fitChecks(a: CandidateAssessment, job: Job): FitCheck[] {
  const c = a.candidate;
  const profile = c.profile;
  const unknown = !profile
    ? 'no usable LinkedIn profile'
    : c.profileStatus === 'conflict'
      ? 'the profile may belong to someone else'
      : profile.skills.length === 0
        ? 'the profile lists no skills'
        : null;
  if (unknown || !profile) {
    return (['must', 'skills', 'years'] as const).map((key) => check(key, false, `unknown, ${unknown}`));
  }
  const essentials = policyFor(job).policy.essentials.map((e) => e.label);
  const minYears = minYearsFor(job);
  const years = profile.yearsExperience;
  return [
    check(
      'must',
      a.missingEssentials.length === 0,
      essentials.length === 0
        ? 'none set for this role'
        : a.missingEssentials.length > 0
          ? `missing ${and(a.missingEssentials)}`
          : `has ${and(essentials)}`,
    ),
    check(
      'skills',
      a.tally.required >= a.tally.requiredNeeded,
      `${a.tally.required} of ${a.tally.requiredTotal} on the profile (needs ${a.tally.requiredNeeded})${a.tally.requiredLikely > 0 ? `, ${a.tally.requiredLikely} likely` : ''}`,
    ),
    check(
      'years',
      minYears === null || (years !== null && years >= minYears),
      minYears === null ? 'no minimum for this role' : `${years === null ? 'years not stated' : `${years} years`} (needs ${minYears})`,
    ),
  ];
}
