/**
 * Seniority evidence. Titles earn no points; history is surfaced so a recruiter can judge
 * relevant years (total years include internships and junior roles).
 */

import { formatYears } from './history';
import { SENIOR_TITLE_PATTERNS } from './rules';
import type { EmploymentSpell, Profile, Seniority } from './types';

function describeRole(r: EmploymentSpell): string {
  const years = r.periods.map(formatYears).join(', ');
  const name = r.title && r.company ? `${r.title} at ${r.company}` : r.title || r.company;
  return `${name}${years ? ` (${years})` : ''}${r.isEarlyCareer ? ' [early career]' : ''}`;
}

export function seniorTitleFlag(title: string): string | null {
  return SENIOR_TITLE_PATTERNS.some((p) => p.test(title))
    ? `current title "${title}" suggests a leadership role; confirm hands-on`
    : null;
}

export function assessSeniority(profile: Profile | null): Seniority {
  if (!profile) {
    return { totalYears: null, roles: [], earlyCareerRoles: [], seniorTitleFlag: null, summary: 'unknown: no profile' };
  }
  const roles = profile.pastRoles;
  const early = roles.filter((r) => r.isEarlyCareer);
  const flag = seniorTitleFlag(profile.currentTitle);
  const parts: string[] = [];
  parts.push(
    profile.yearsExperience === null
      ? 'total years not given'
      : `${profile.yearsExperience}y total (profile; not necessarily in this specialty)`,
  );
  parts.push(`now ${profile.currentTitle || 'title not given'}${profile.currentCompany ? ` at ${profile.currentCompany}` : ''}`);
  if (roles.length > 0) parts.push(`before: ${roles.map(describeRole).join('; ')}`);
  if (early.length > 0) parts.push('early-career roles are included in the total, so relevant years may be lower');
  if (flag) parts.push(flag);
  return { totalYears: profile.yearsExperience, roles, earlyCareerRoles: early, seniorTitleFlag: flag, summary: parts.join('. ') };
}
