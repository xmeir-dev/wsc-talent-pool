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
import { rules } from '../pipeline';

/** "JOB001 · Senior ML Engineer": how a job reads in pickers. */
export function jobLabel(job: Job): string {
  return `${job.jobId} · ${job.title}`;
}

const CONFERENCE_SHORT: Record<string, string> = {
  'SportsTech Innovation Summit': 'SportsTech',
  'Broadcast & Streaming Technology Expo': 'Broadcast Expo',
  'Data & AI Summit Europe': 'Data & AI Summit',
  'DevOps World 2025': 'DevOps World',
};

/** "Data & AI Summit Europe" → "Data & AI Summit": how a conference reads in the filter. Unknown names stay whole. */
export function conferenceShort(name: string): string {
  return CONFERENCE_SHORT[name] ?? name;
}

/** "Senior Product Manager - Sports Data" → "Senior PM - Sports Data": the job filter's button only. */
/** The most points a person could score for a job: every required skill named, every nice-to-have, the industry bonus if the role has one. */
export function maxPoints(a: CandidateAssessment, job: Job): number {
  const bonus = a.industryBonusEvidence === 'not part of this role' ? 0 : rules.POINTS.industryBonus;
  return a.points.requiredMax + job.niceToHave.length * rules.POINTS.niceToHave + bonus;
}

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
