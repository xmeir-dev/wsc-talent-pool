/**
 * Ordering and ties.
 *
 * Order: shortlist, then needs_review, then not_recommended_for_role; within each, more points first.
 * A close tie means identical total points. Inside a tie, a person with at least one resolved WSC
 * connection ranks first (the number of connections is ignored). People still level after that share
 * a rank and are labelled "tied"; their display order is alphabetical, not a preference.
 * Connections never cross a points gap.
 */

import type { CandidateAssessment, Recommendation } from './types';

type Draft = Omit<CandidateAssessment, 'shortlistRank' | 'tieNote'>;

const OUTCOME_ORDER: Record<Recommendation, number> = { shortlist: 0, needs_review: 1, not_recommended_for_role: 2 };

export function hasConnection(a: Draft): boolean {
  return (a.connections.count ?? 0) > 0;
}

export function compareAssessments(a: Draft, b: Draft): number {
  return (
    OUTCOME_ORDER[a.recommendation] - OUTCOME_ORDER[b.recommendation] ||
    b.points.total - a.points.total ||
    Number(hasConnection(b)) - Number(hasConnection(a)) ||
    a.candidate.fullName.localeCompare(b.candidate.fullName) ||
    a.candidate.candidateKey.localeCompare(b.candidate.candidateKey)
  );
}

function names(list: Draft[]): string {
  return list.map((d) => d.candidate.fullName).join(', ');
}

export function rankAssessments(drafts: Draft[]): CandidateAssessment[] {
  const sorted = [...drafts].sort(compareAssessments);
  const shortlist = sorted.filter((d) => d.recommendation === 'shortlist');
  const ranks = new Map<Draft, number>();
  const notes = new Map<Draft, string>();

  shortlist.forEach((d, i) => {
    const prev = shortlist[i - 1];
    const sameAsPrev = prev && prev.points.total === d.points.total && hasConnection(prev) === hasConnection(d);
    ranks.set(d, sameAsPrev ? ranks.get(prev)! : i + 1);
  });

  // Tie notes: group by identical points.
  const byPoints = new Map<number, Draft[]>();
  for (const d of shortlist) byPoints.set(d.points.total, [...(byPoints.get(d.points.total) ?? []), d]);
  for (const [total, group] of byPoints) {
    if (group.length < 2) continue;
    for (const d of group) {
      const sameRank = group.filter((o) => o !== d && ranks.get(o) === ranks.get(d));
      const connected = hasConnection(d);
      const parts: string[] = [];
      if (sameRank.length > 0) {
        parts.push(
          `tied with ${names(sameRank)} (${total} points each; ${connected ? 'all have a WSC connection' : 'none has a WSC connection'}); listed alphabetically, not a preference`,
        );
      }
      const below = group.filter((o) => ranks.get(o)! > ranks.get(d)!);
      const above = group.filter((o) => ranks.get(o)! < ranks.get(d)!);
      if (below.length > 0) parts.push(`ranked above ${names(below)} (same ${total} points) only because of a WSC connection`);
      if (above.length > 0) {
        parts.push(`same ${total} points as ${names(above)}, who ${above.length === 1 ? 'ranks' : 'rank'} higher only because of a WSC connection`);
      }
      notes.set(d, parts.join('; '));
    }
  }

  return sorted.map((d) => ({ ...d, shortlistRank: ranks.get(d) ?? null, tieNote: notes.get(d) ?? '' }));
}
