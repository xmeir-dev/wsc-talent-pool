/**
 * Display wording only. Every decision (outcome, rank, gaps, references) comes from the pipeline;
 * this file just chooses which pipeline field to show and how to label it.
 */

import { policyFor } from '../pipeline';
import type {
  CandidateAssessment,
  JobAssessment,
  ConferenceRelevance,
  MatchKind,
  OutputRow,
  PossibleReference,
  Recommendation,
} from '../pipeline';

export type View = 'shortlist' | 'needs_review' | 'all';

export const VIEWS: { id: View; label: string }[] = [
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'all', label: 'All' },
];

export const OUTCOME_LABEL: Record<Recommendation, string> = {
  shortlist: 'Shortlist',
  needs_review: 'Needs review',
  not_recommended_for_role: 'Not recommended for this role',
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

/** Empty-shortlist copy, from the data: which must-have nobody in review has, and how many to review. */
export function emptyShortlistCopy(result: JobAssessment): { title: string; body: string } {
  const review = result.candidates.filter((c) => c.recommendation === 'needs_review');
  const n = review.length;
  const common = (review[0]?.missingEssentials ?? []).filter((e) => review.every((c) => c.missingEssentials.includes(e)));
  const title =
    common.length > 0
      ? `No ${policyFor(result.job).policy.coreDiscipline.label} candidate lists ${common.join(' or ')}.`
      : 'No one meets every shortlist condition for this role.';
  return { title, body: `${n} ${n === 1 ? 'is' : 'are'} worth a recruiter's review.` };
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
