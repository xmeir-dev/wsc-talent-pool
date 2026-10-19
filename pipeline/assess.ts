/**
 * Job fit for one person and one role. Pure: same inputs, same result.
 *
 * Skill counts rank people; gates decide the outcome:
 * 1. No usable profile, or a conflicting one → needs_review (missing info is not missing ability).
 * 2. No evidence of the role's core discipline → not_recommended_for_role.
 * 3. Every essential present, at least 60% of the required skills on the profile by name, and minimum years → shortlist.
 *    A role whose seniority is not a supported level has no known minimum, so nobody is shortlisted for it.
 * 4. Anything else → needs_review. A related skill counts as "likely": it sends someone to review, never to the shortlist.
 * Connections never enter this function.
 */

import { assessEvent } from './conference';
import { NAME_CONFLICT_FLAG } from './dataset';
import { findPossibleReferences } from './history';
import {
  MIN_YEARS_BY_SENIORITY,
  ROLE_POLICIES,
  SHORTLIST_REQUIRED_SHARE,
  SKILL_EVIDENCE,
  SUPPORTED_SENIORITIES,
  type RolePolicy,
  type SkillEvidenceRule,
} from './rules';
import { assessSeniority } from './seniority';
import { canonicalSkill, containsTerm, normalize, ownEntry } from './text';
import type {
  Candidate,
  CandidateAssessment,
  ConnectionInfo,
  Employee,
  Job,
  MatchKind,
  Recommendation,
  SkillMatch,
  SkillTally,
} from './types';

/** Fallback for a job added to job_openings.csv without a written policy: core = any required skill named. */
export function policyFor(job: Job): { policy: RolePolicy; isDefault: boolean } {
  const policy = ownEntry(ROLE_POLICIES, job.jobId);
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

/**
 * Evidence for a job skill, looked up by its canonical skill so every accepted spelling ("Go", "Golang") gets the
 * same rule. The skill's own name always counts as named, before any alias; related and inferred evidence stay as
 * configured. A skill that is not configured matches its own name only.
 */
export function evidenceRule(skill: string): SkillEvidenceRule {
  const own = normalize(skill);
  const key = canonicalSkill(skill);
  const rule = ownEntry(SKILL_EVIDENCE, key);
  if (!rule) return { named: [own] };
  // An alias is already one of the skill's named terms, so the set is the same for every spelling.
  return { ...rule, named: [key, ...rule.named.filter((t) => t !== key)] };
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

export function scoreSkills(profileSkills: string[], job: Job): SkillMatch[] {
  const required = job.requiredSkills.map((skill): SkillMatch => {
    const { match, evidence } = matchSkill(profileSkills, skill);
    return { skill, kind: 'required', match, evidence };
  });
  const nice = job.niceToHave.map((skill): SkillMatch => {
    const { match, evidence } = matchSkill(profileSkills, skill);
    // Inferred evidence is too indirect to count for a nice-to-have.
    const counts = match === 'named' || match === 'equivalent';
    return { skill, kind: 'nice_to_have', match: counts ? match : 'none', evidence: counts ? evidence : null };
  });
  return [...required, ...nice];
}

/** Minimum total years for the job's seniority; null when the seniority is blank or not a supported level. */
export function minYearsFor(job: Job): number | null {
  const min = ownEntry(MIN_YEARS_BY_SENIORITY, normalize(job.seniority));
  return typeof min === 'number' && Number.isFinite(min) ? min : null;
}

/** Why the years minimum is unknown, or null when the job's seniority is supported. */
export function unresolvedSeniority(job: Job): string | null {
  if (minYearsFor(job) !== null) return null;
  const supported = SUPPORTED_SENIORITIES.join(', ');
  return job.seniority.trim()
    ? `Role seniority "${job.seniority.trim()}" is not a supported level (${supported}), so the minimum years is unknown`
    : `Role has no seniority (${supported}), so the minimum years is unknown`;
}

/** Named required skills the shortlist needs: SHORTLIST_REQUIRED_SHARE of them, rounded up. */
export function requiredNeeded(requiredTotal: number): number {
  return Math.ceil(requiredTotal * SHORTLIST_REQUIRED_SHARE - 1e-9);
}

function industryBonus(candidate: Candidate, policy: RolePolicy): { match: boolean; evidence: string } {
  const p = candidate.profile;
  if (!policy.industryBonus) return { match: false, evidence: 'not part of this role' };
  if (!p) return { match: false, evidence: 'unknown: no profile' };
  const terms = policy.industryBonus.terms;
  const industryHit = p.industry && terms.some((t) => containsTerm(p.industry, t));
  const skillHits = p.skills.filter((s) => terms.some((t) => containsTerm(s, t)));
  if (industryHit || skillHits.length > 0) {
    const parts = [
      ...(industryHit ? [`industry "${p.industry}"`] : []),
      ...(skillHits.length > 0 ? [`skills ${skillHits.map((s) => `"${s}"`).join(', ')}`] : []),
    ];
    return { match: true, evidence: `yes: ${parts.join(' and ')}` };
  }
  return { match: false, evidence: `none: industry "${p.industry || 'not given'}" is not ${policy.industryBonus.label}` };
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

function yearsText(n: number | null): string {
  if (n === null) return 'Unknown';
  return n === 1 ? "1 year's" : `${n} years'`;
}

type Draft = Omit<CandidateAssessment, 'shortlistRank' | 'tieNote'>;

/** Assess one person for one job. Ranking and tie labels are added later by rankAssessments(). */
export function assessCandidate(candidate: Candidate, job: Job, employees: Map<string, Employee>): Draft {
  const { policy, isDefault } = policyFor(job);
  const profile = candidate.profile;
  const skills = profile ? scoreSkills(profile.skills, job) : [];
  const requiredSkills = skills.filter((s) => s.kind === 'required');
  const required = requiredSkills.filter((s) => s.match === 'named').length;
  const requiredLikely = requiredSkills.filter((s) => s.match === 'equivalent' || s.match === 'inferred').length;
  const requiredTotal = job.requiredSkills.length;
  const needed = requiredNeeded(requiredTotal);
  const bonus = industryBonus(candidate, policy);
  const tally: SkillTally = {
    required,
    requiredLikely,
    requiredTotal,
    requiredNeeded: needed,
    niceToHave: skills.filter((s) => s.kind === 'nice_to_have' && s.match !== 'none').length,
    niceToHaveTotal: job.niceToHave.length,
    industryMatch: bonus.match,
  };

  // By canonical skill, so a must-have written "Go" is met by a job skill written "Golang".
  const byName = new Map(requiredSkills.map((s) => [canonicalSkill(s.skill), s]));
  const meets = (e: { allowRelated: boolean }, m: SkillMatch | undefined) =>
    !!m && (m.match === 'named' || (e.allowRelated && m.match !== 'none'));
  const unmet = policy.essentials.filter((e) => !e.anyOf.some((skill) => meets(e, byName.get(canonicalSkill(skill)))));
  const missingEssentials = unmet.map((e) => e.label);
  // Say when related evidence exists but is not enough (e.g. "Sports Broadcasting" for Sports Analytics).
  const missingEssentialDetail = unmet.map((e) => {
    const partial = e.anyOf.map((skill) => byName.get(canonicalSkill(skill))).find((m) => m && m.match !== 'none');
    return partial ? `${e.label} (only a related skill, ${partial.evidence}, which is not enough)` : e.label;
  });
  const coreEvidence = profile ? profile.skills.filter((s) => policy.coreDiscipline.terms.includes(normalize(s))) : [];
  const minYears = minYearsFor(job);
  const seniorityProblem = unresolvedSeniority(job);
  const seniority = assessSeniority(profile);
  const connections = connectionInfo(candidate, employees);
  const dataQualityFlags = [...candidate.dataQualityFlags];
  if (isDefault) dataQualityFlags.push(`no written policy for ${job.jobId}; provisional default rules applied (no must-haves)`);
  if (seniorityProblem) dataQualityFlags.push(`${seniorityProblem}; no one is shortlisted until it is set`);
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
    reasons.push(
      hasNameConflict(candidate)
        ? 'Records sharing this LinkedIn URL give different names; confirm who this is before trusting this assessment'
        : 'Profile may belong to someone else; confirm who this is before trusting this assessment',
    );
  } else if (profile.skills.length === 0) {
    recommendation = 'needs_review';
    reasons.push('Profile lists no skills, so fit cannot be judged');
  } else if (coreEvidence.length === 0) {
    recommendation = 'not_recommended_for_role';
    reasons.push(`No ${policy.coreDiscipline.label} skill on profile; stays in the pool for other roles`);
  } else {
    if (missingEssentials.length > 0) reasons.push(`Missing must-have: ${missingEssentialDetail.join(', ')}`);
    if (required < needed) {
      reasons.push(
        required + requiredLikely >= needed
          ? `${required} of ${requiredTotal} required skills on the profile (needs ${needed}); ${requiredLikely} more likely, please confirm`
          : `Only ${required} of ${requiredTotal} required skills on the profile (needs ${needed})`,
      );
    }
    if (seniorityProblem) reasons.push(`${seniorityProblem}; not shortlisted until the role's seniority is set`);
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
          `${required} of ${requiredTotal} required skills (needs ${needed})`,
          `${yearsText(profile.yearsExperience)} experience${early ? ' (includes intern or junior roles; confirm non-intern years)' : ''}`,
        ].join(' · '),
      );
    }
  }

  const gaps = profile ? skillGaps(skills) : [];
  return {
    candidate,
    jobId: job.jobId,
    recommendation,
    tally,
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
      seniorityProblem !== null,
    ),
    dataQualityFlags,
  };
}

function hasNameConflict(candidate: Candidate): boolean {
  return candidate.dataQualityFlags.some((f) => f.startsWith(NAME_CONFLICT_FLAG));
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
  seniorityUnknown: boolean,
): string {
  if (recommendation === 'not_recommended_for_role') return `No action for ${job.title}; keep in the talent pool for other roles`;
  if (!candidate.profile) {
    return candidate.profileStatus === 'conflict'
      ? 'Resolve which LinkedIn profile is this person, then re-run'
      : "Find this person's LinkedIn profile (or ask them for a CV), then re-run";
  }
  if (candidate.profileStatus === 'conflict') {
    return hasNameConflict(candidate)
      ? 'Check with the contacts whether these records are the same person (fix or split them in HubSpot), then re-run'
      : 'Confirm the attendee and the LinkedIn profile are the same person, then re-run';
  }
  if (candidate.profile.skills.length === 0) return 'Get a CV or a fuller profile, then re-run';
  const unconfirmed = skills.filter((s) => s.kind === 'required' && s.match !== 'named').map((s) => s.skill);
  const steps: string[] = [];
  if (recommendation === 'needs_review') {
    if (missingEssentials.length > 0) steps.push(`Look for evidence of ${missingEssentials.join(' and ')} (CV, portfolio or a call) before deciding`);
    else if (unconfirmed.length > 0) steps.push(`Ask about ${unconfirmed.join(', ')} (not confirmed on the profile) before deciding`);
  } else {
    steps.push(unconfirmed.length > 0 ? `Screening call: confirm ${unconfirmed.join(', ')}` : 'Screening call: confirm depth of hands-on work');
  }
  if (seniorityUnknown) steps.push(`set the role's seniority (${SUPPORTED_SENIORITIES.join(', ')}), then re-run`);
  if (seniorFlag) steps.push('confirm they still work hands-on');
  // One instruction about years, even when both apply.
  if (yearsShort && hasEarlyCareer) steps.push('confirm non-intern years in the specialty');
  else if (yearsShort) steps.push('confirm years in the specialty');
  else if (hasEarlyCareer) steps.push('confirm non-intern years');
  return steps.join('; ');
}
