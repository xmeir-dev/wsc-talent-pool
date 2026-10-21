/**
 * Skill evidence lookup and a role's own criteria. Kept apart from assess.ts so the dataset reader can turn a
 * job row's `core_skills` and `must_have_skills` into a policy without importing the assessment.
 */

import { SKILL_EVIDENCE, type Essential, type SkillEvidenceRule } from './rules';
import { canonicalSkill, normalize, ownEntry } from './text';
import type { JobPolicy } from './types';

/**
 * Evidence for a job skill, looked up by its canonical skill so every accepted spelling ("Go", "Golang") gets the
 * same rule. The skill's own name (and, for a learned variant, the skill it stands for) always counts as named, before
 * any alias; related and inferred evidence stay as configured. A skill that is not configured matches its own name only.
 */
export function evidenceRule(skill: string): SkillEvidenceRule {
  const own = normalize(skill);
  const key = canonicalSkill(skill);
  const rule = ownEntry(SKILL_EVIDENCE, key);
  if (!rule) return { named: [...new Set([key, own])] };
  // An alias is already one of the skill's named terms, so the set is the same for every spelling.
  return { ...rule, named: [key, ...rule.named.filter((t) => t !== key)] };
}

/** "A", "A or B", "A, B or C". */
function orList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/**
 * The criteria a recruiter confirmed when creating a role (job_openings.csv `core_skills` and `must_have_skills`).
 * Core skills: any one on the profile, by name or an accepted alias, establishes the core discipline.
 * Must-haves: each must be on the profile by name or alias; a related skill is not enough.
 * Empty core skills leave `terms` empty, and policyFor() falls back to the provisional default for the core.
 */
export function criteriaPolicy(coreSkills: string[], mustHaveSkills: string[]): JobPolicy {
  const essentials: Essential[] = mustHaveSkills.map((skill) => ({ label: skill, anyOf: [skill], allowRelated: false }));
  return {
    essentials,
    coreDiscipline: { label: orList(coreSkills), terms: [...new Set(coreSkills.flatMap((s) => evidenceRule(s).named))] },
    industryBonus: null,
  };
}
