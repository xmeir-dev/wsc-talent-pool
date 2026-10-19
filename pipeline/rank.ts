/**
 * Ordering and ties.
 *
 * Order: shortlist, then needs_review, then not_recommended_for_role. Within each: more required skills on the
 * profile, then more likely required skills, then more nice-to-haves, then the role's industry. A tie means all
 * of those are equal. Inside a tie, a person with at least one resolved WSC connection ranks first (the number
 * of connections is ignored). People still level after that share a rank and are labelled "tied"; their display
 * order is alphabetical, not a preference. Connections never cross a skills gap.
 */

import type { CandidateAssessment, Recommendation, SkillTally } from './types';

type Draft = Omit<CandidateAssessment, 'shortlistRank' | 'tieNote'>;

const OUTCOME_ORDER: Record<Recommendation, number> = { shortlist: 0, needs_review: 1, not_recommended_for_role: 2 };

export function hasConnection(a: Draft): boolean {
  return (a.connections.count ?? 0) > 0;
}

/** Skill counts, most important first; higher is better. */
export function skillKey(t: SkillTally): number[] {
  return [t.required, t.requiredLikely, t.niceToHave, Number(t.industryMatch)];
}

/** Negative when x has the better skills. */
export function compareSkills(x: SkillTally, y: SkillTally): number {
  const a = skillKey(x);
  const b = skillKey(y);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i]! - a[i]!;
  return 0;
}

/** "4 of 6 required, 1 nice to have": what a tie is a tie on. */
export function skillSummary(t: SkillTally): string {
  return [
    `${t.required} of ${t.requiredTotal} required`,
    ...(t.requiredLikely > 0 ? [`${t.requiredLikely} likely`] : []),
    `${t.niceToHave} nice to have`,
    ...(t.industryMatch ? ['industry match'] : []),
  ].join(', ');
}

export function compareAssessments(a: Draft, b: Draft): number {
  return (
    OUTCOME_ORDER[a.recommendation] - OUTCOME_ORDER[b.recommendation] ||
    compareSkills(a.tally, b.tally) ||
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
    const sameAsPrev = prev && compareSkills(prev.tally, d.tally) === 0 && hasConnection(prev) === hasConnection(d);
    ranks.set(d, sameAsPrev ? ranks.get(prev)! : i + 1);
  });

  // Tie notes: group by identical skill counts.
  const bySkills = new Map<string, Draft[]>();
  for (const d of shortlist) {
    const k = skillKey(d.tally).join(',');
    bySkills.set(k, [...(bySkills.get(k) ?? []), d]);
  }
  for (const group of bySkills.values()) {
    const same = skillSummary(group[0]!.tally);
    if (group.length < 2) continue;
    for (const d of group) {
      const sameRank = group.filter((o) => o !== d && ranks.get(o) === ranks.get(d));
      const connected = hasConnection(d);
      const parts: string[] = [];
      if (sameRank.length > 0) {
        parts.push(
          `tied with ${names(sameRank)} (same skills: ${same}; ${connected ? 'all have a WSC connection' : 'none has a WSC connection'}); listed alphabetically, not a preference`,
        );
      }
      const below = group.filter((o) => ranks.get(o)! > ranks.get(d)!);
      const above = group.filter((o) => ranks.get(o)! < ranks.get(d)!);
      if (below.length > 0) parts.push(`ranked above ${names(below)} (same skills: ${same}) only because of a WSC connection`);
      if (above.length > 0) {
        parts.push(`same skills as ${names(above)} (${same}), who ${above.length === 1 ? 'ranks' : 'rank'} higher only because of a WSC connection`);
      }
      notes.set(d, parts.join('; '));
    }
  }

  return sorted.map((d) => ({ ...d, shortlistRank: ranks.get(d) ?? null, tieNote: notes.get(d) ?? '' }));
}
