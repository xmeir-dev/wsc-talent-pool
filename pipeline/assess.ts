/**
 * Job fit for one person and one role. Pure: same inputs, same result.
 *
 * Points rank people; gates decide the outcome:
 * 1. No usable profile, or a conflicting one → needs_review (missing info is not missing ability).
 * 2. No evidence of the role's core discipline → not_recommended_for_role.
 * 3. Every essential present, required points ≥ 60%, and minimum years → shortlist.
 * 4. Anything else → needs_review.
 * Connections never enter this function.
 */

import { assessEvent } from './conference';
import { findPossibleReferences } from './history';
import {
  MIN_YEARS_BY_SENIORITY,
  POINTS,
  ROLE_POLICIES,
  SHORTLIST_REQUIRED_SHARE,
  SKILL_EVIDENCE,
  type RolePolicy,
  type SkillEvidenceRule,
} from './rules';
import { assessSeniority } from './seniority';
import { containsTerm, normalize } from './text';
import type {
  Candidate,
  CandidateAssessment,
  ConnectionInfo,
  Employee,
  Job,
  MatchKind,
  Points,
  Recommendation,
  SkillMatch,
} from './types';

/** Fallback for a job added to job_openings.csv without a written policy: core = any required skill named. */
export function policyFor(job: Job): { policy: RolePolicy; isDefault: boolean } {
  const policy = ROLE_POLICIES[job.jobId];
  if (policy) return { policy, isDefault: false };
  return {
    isDefault: true,
    policy: {
      essentials: [],
      coreDiscipline: {
        label: `required (${job.requiredSkills.join(', ')})`,
        terms: job.requiredSkills.flatMap((s) => evidenceRule(s).named),
      },
      industryBonus: null,
    },
  };
}

export function evidenceRule(skill: string): SkillEvidenceRule {
  return SKILL_EVIDENCE[normalize(skill)] ?? { named: [normalize(skill)] };
}

/** Best match for one job skill among the profile's skills: named beats equivalent beats inferred. */
export function matchSkill(profileSkills: string[], skill: string): { match: MatchKind; evidence: string | null } {
  const rule = evidenceRule(skill);
  const find = (terms: string[] | undefined) => profileSkills.find((s) => (terms ?? []).includes(normalize(s))) ?? null;
  const named = find(rule.named);
  if (named) return { match: 'named', evidence: named };
  const equivalent = find(rule.equivalent);
  if (equivalent) return { match: 'equivalent', evidence: equivalent };
  const inferred = find(rule.inferred);
  if (inferred) return { match: 'inferred', evidence: inferred };
  return { match: 'none', evidence: null };
}

const REQUIRED_POINTS: Record<MatchKind, number> = {
  named: POINTS.requiredNamed,
  equivalent: POINTS.requiredEquivalent,
  inferred: POINTS.requiredInferred,
  none: 0,
};

export function scoreSkills(profileSkills: string[], job: Job): SkillMatch[] {
  const required = job.requiredSkills.map((skill): SkillMatch => {
    const { match, evidence } = matchSkill(profileSkills, skill);
    return { skill, kind: 'required', match, points: REQUIRED_POINTS[match], evidence };
  });
  const nice = job.niceToHave.map((skill): SkillMatch => {
    const { match, evidence } = matchSkill(profileSkills, skill);
    // Inferred evidence is too indirect to earn a nice-to-have point.
    const earns = match === 'named' || match === 'equivalent';
    return { skill, kind: 'nice_to_have', match: earns ? match : 'none', points: earns ? POINTS.niceToHave : 0, evidence: earns ? evidence : null };
  });
  return [...required, ...nice];
}

export function minYearsFor(job: Job): number | null {
  return MIN_YEARS_BY_SENIORITY[normalize(job.seniority)] ?? null;
}

export function requiredThreshold(requiredMax: number): number {
  return Math.ceil(requiredMax * SHORTLIST_REQUIRED_SHARE - 1e-9);
}

function industryBonus(candidate: Candidate, policy: RolePolicy): { points: number; evidence: string } {
  const p = candidate.profile;
  if (!policy.industryBonus) return { points: 0, evidence: 'not part of this role' };
  if (!p) return { points: 0, evidence: 'unknown: no profile' };
  const terms = policy.industryBonus.terms;
  const industryHit = p.industry && terms.some((t) => containsTerm(p.industry, t));
  const skillHits = p.skills.filter((s) => terms.some((t) => containsTerm(s, t)));
  if (industryHit || skillHits.length > 0) {
    const parts = [
      ...(industryHit ? [`industry "${p.industry}"`] : []),
      ...(skillHits.length > 0 ? [`skills ${skillHits.map((s) => `"${s}"`).join(', ')}`] : []),
    ];
    return { points: POINTS.industryBonus, evidence: `+1: ${parts.join(' and ')}` };
  }
  return { points: 0, evidence: `none: industry "${p.industry || 'not given'}" is not ${policy.industryBonus.label}` };
}

export function connectionInfo(candidate: Candidate, employees: Map<string, Employee>): ConnectionInfo {
  const p = candidate.profile;
  if (!p) return { status: 'unknown', count: null, resolved: [], unresolvedIds: [] };
  const ids = [...new Set(p.connectionIds)];
  const resolved = ids.flatMap((id) => (employees.has(id) ? [employees.get(id)!] : []));
  const unresolvedIds = ids.filter((id) => !employees.has(id));
  const status = ids.length === 0 ? 'none_listed' : unresolvedIds.length > 0 ? 'partially_resolved' : 'listed';
  return { status, count: resolved.length, resolved, unresolvedIds };
}

function describeMatch(m: SkillMatch): string {
  if (m.match === 'named') return m.evidence && normalize(m.evidence) !== normalize(m.skill) ? `${m.skill} (listed as ${m.evidence})` : m.skill;
  if (m.match === 'equivalent') return `${m.skill} (related skill: ${m.evidence})`;
  if (m.match === 'inferred') return `${m.skill} (likely, from ${m.evidence}; please confirm)`;
  return m.skill;
}

function fitEvidence(skills: SkillMatch[]): string[] {
  const req = skills.filter((s) => s.kind === 'required' && s.match !== 'none');
  const nice = skills.filter((s) => s.kind === 'nice_to_have' && s.match !== 'none');
  const out: string[] = [];
  if (req.length > 0) out.push(`Required skills: ${req.map(describeMatch).join(', ')}`);
  if (nice.length > 0) out.push(`Nice to have: ${nice.map(describeMatch).join(', ')}`);
  return out;
}

function skillGaps(skills: SkillMatch[]): string[] {
  return skills
    .filter((s) => s.kind === 'required' && s.match !== 'named')
    .map((s) =>
      s.match === 'none'
        ? `${s.skill}: not on profile`
        : s.match === 'equivalent'
          ? `${s.skill}: only a related skill (${s.evidence})`
          : `${s.skill}: likely (from ${s.evidence}), please confirm`,
    );
}

function yearsText(n: number): string {
  return n === 1 ? "1 year's" : `${n} years'`;
}

type Draft = Omit<CandidateAssessment, 'shortlistRank' | 'tieNote'>;

/** Assess one person for one job. Ranking and tie labels are added later by rankAssessments(). */
export function assessCandidate(candidate: Candidate, job: Job, employees: Map<string, Employee>): Draft {
  const { policy, isDefault } = policyFor(job);
  const profile = candidate.profile;
  const skills = profile ? scoreSkills(profile.skills, job) : [];
  const required = skills.filter((s) => s.kind === 'required').reduce((n, s) => n + s.points, 0);
  const requiredMax = job.requiredSkills.length * POINTS.requiredNamed;
  const niceToHave = skills.filter((s) => s.kind === 'nice_to_have').reduce((n, s) => n + s.points, 0);
  const bonus = industryBonus(candidate, policy);
  const points: Points = { required, requiredMax, niceToHave, industryBonus: bonus.points, total: required + niceToHave + bonus.points };

  const byName = new Map(skills.filter((s) => s.kind === 'required').map((s) => [normalize(s.skill), s]));
  const unmet = policy.essentials.filter(
    (e) => !e.anyOf.some((skill) => (byName.get(normalize(skill))?.points ?? 0) >= e.minPoints),
  );
  const missingEssentials = unmet.map((e) => e.label);
  // Say when related evidence exists but is not enough (e.g. "Sports Broadcasting" for Sports Analytics).
  const missingEssentialDetail = unmet.map((e) => {
    const partial = e.anyOf.map((skill) => byName.get(normalize(skill))).find((m) => m && m.points > 0);
    return partial ? `${e.label} (only a related skill, ${partial.evidence}, which is not enough)` : e.label;
  });
  const coreEvidence = profile ? profile.skills.filter((s) => policy.coreDiscipline.terms.includes(normalize(s))) : [];
  const minYears = minYearsFor(job);
  const threshold = requiredThreshold(requiredMax);
  const seniority = assessSeniority(profile);
  const connections = connectionInfo(candidate, employees);
  const dataQualityFlags = [...candidate.dataQualityFlags];
  if (isDefault) dataQualityFlags.push(`no written policy for ${job.jobId}; default rules applied`);
  if (minYears === null) dataQualityFlags.push(`seniority "${job.seniority}" has no minimum-years rule; years not checked`);
  if (connections.unresolvedIds.length > 0) {
    dataQualityFlags.push(`connection ID(s) not in employee roster: ${connections.unresolvedIds.join(', ')}`);
  }

  let recommendation: Recommendation;
  const reasons: string[] = [];
  const yearsShort =
    !!profile && minYears !== null && (profile.yearsExperience === null || profile.yearsExperience < minYears);
  if (!profile) {
    recommendation = 'needs_review';
    reasons.push(`No usable LinkedIn profile (${candidate.profileStatus.replace('_', ' ')}); missing information is not proof of missing ability`);
  } else if (candidate.profileStatus === 'conflict') {
    recommendation = 'needs_review';
    reasons.push('Profile may belong to someone else; confirm who this is before trusting this assessment');
  } else if (profile.skills.length === 0) {
    recommendation = 'needs_review';
    reasons.push('Profile lists no skills, so fit cannot be judged');
  } else if (coreEvidence.length === 0) {
    recommendation = 'not_recommended_for_role';
    reasons.push(`No ${policy.coreDiscipline.label} skill on profile; stays in the pool for other roles`);
  } else {
    if (missingEssentials.length > 0) reasons.push(`Missing must-have: ${missingEssentialDetail.join(', ')}`);
    if (required < threshold) reasons.push(`Only ${required} of ${requiredMax} required-skill points (needs ${threshold})`);
    if (yearsShort) {
      reasons.push(
        profile.yearsExperience === null
          ? 'Years of experience not on profile'
          : `${yearsText(profile.yearsExperience)} experience (needs ${minYears})`,
      );
    }
    recommendation = reasons.length === 0 ? 'shortlist' : 'needs_review';
    if (recommendation === 'shortlist') {
      const early = seniority.earlyCareerRoles.length > 0;
      reasons.push(
        [
          'Has every must-have skill',
          `${required} of ${requiredMax} required-skill points (needs ${threshold})`,
          `${yearsText(profile.yearsExperience!)} experience${early ? ' (includes intern or junior roles; confirm non-intern years)' : ''}`,
        ].join(' · '),
      );
    }
  }

  const gaps = profile ? skillGaps(skills) : [];
  return {
    candidate,
    jobId: job.jobId,
    recommendation,
    points,
    skills,
    missingEssentials: profile ? missingEssentials : [],
    outcomeReasons: reasons,
    fitEvidence: profile ? fitEvidence(skills) : [],
    skillGaps: gaps,
    industryBonusEvidence: bonus.evidence,
    seniority,
    connections,
    possibleReferences: findPossibleReferences(candidate, employees.values()),
    events: candidate.attendances.map((a) => assessEvent(a, profile)),
    reviewNextStep: nextStep(
      recommendation,
      candidate,
      job,
      missingEssentials,
      skills,
      seniority.seniorTitleFlag,
      seniority.earlyCareerRoles.length > 0,
      yearsShort,
    ),
    dataQualityFlags,
  };
}

function nextStep(
  recommendation: Recommendation,
  candidate: Candidate,
  job: Job,
  missingEssentials: string[],
  skills: SkillMatch[],
  seniorFlag: string | null,
  hasEarlyCareer: boolean,
  yearsShort: boolean,
): string {
  if (recommendation === 'not_recommended_for_role') return `No action for ${job.title}; keep in the talent pool for other roles`;
  if (!candidate.profile) {
    return candidate.profileStatus === 'conflict'
      ? 'Resolve which LinkedIn profile is this person, then re-run'
      : "Find this person's LinkedIn profile (or ask them for a CV), then re-run";
  }
  if (candidate.profileStatus === 'conflict') return 'Confirm the attendee and the LinkedIn profile are the same person, then re-run';
  if (candidate.profile.skills.length === 0) return 'Get a CV or a fuller profile, then re-run';
  const unconfirmed = skills.filter((s) => s.kind === 'required' && s.match !== 'named').map((s) => s.skill);
  const steps: string[] = [];
  if (recommendation === 'needs_review') {
    if (missingEssentials.length > 0) steps.push(`Look for evidence of ${missingEssentials.join(' and ')} (CV, portfolio or a call) before deciding`);
    else if (unconfirmed.length > 0) steps.push(`Ask about ${unconfirmed.join(', ')} (not confirmed on the profile) before deciding`);
  } else {
    steps.push(unconfirmed.length > 0 ? `Screening call: confirm ${unconfirmed.join(', ')}` : 'Screening call: confirm depth of hands-on work');
  }
  if (seniorFlag) steps.push('confirm they still work hands-on');
  // One instruction about years, even when both apply.
  if (yearsShort && hasEarlyCareer) steps.push('confirm non-intern years in the specialty');
  else if (yearsShort) steps.push('confirm years in the specialty');
  else if (hasEarlyCareer) steps.push('confirm non-intern years');
  return steps.join('; ');
}
