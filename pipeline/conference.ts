/**
 * Conference relevance: does the attendee's own work match the event's domain?
 * Reported next to job fit; it never removes anyone from job matching.
 */

import { CONFERENCE_DOMAINS } from './rules';
import { containsTerm, normalize } from './text';
import type { Attendance, EventAssessment, Profile } from './types';

export function assessEvent(attendance: Attendance, profile: Profile | null): EventAssessment {
  const domain = attendance.conferenceDomain;
  if (!profile) {
    return {
      attendance,
      relevance: 'unknown',
      matchedTerms: [],
      explanation: 'no LinkedIn profile to assess',
    };
  }
  const rule = CONFERENCE_DOMAINS[normalize(domain)];
  if (!rule) {
    return {
      attendance,
      relevance: 'unknown',
      matchedTerms: [],
      explanation: `no relevance rule for domain "${domain}"`,
    };
  }
  // Evidence comes from what the person does (skills) and where (industry), not from their title.
  const items = [...profile.skills, ...(profile.industry ? [`industry: ${profile.industry}`] : [])];
  const matched = items.filter((item) => rule.terms.some((t) => containsTerm(item, t)));
  const hasRequired = !rule.mustInclude || matched.some((item) => rule.mustInclude!.some((t) => containsTerm(item, t)));
  const relevance = matched.length >= 2 && hasRequired ? 'relevant' : matched.length >= 1 ? 'adjacent' : 'not_relevant';
  const explanation =
    relevance === 'not_relevant'
      ? `nothing in skills or industry matches ${domain}`
      : relevance === 'adjacent' && matched.length >= 2
        ? `${matched.join(', ')} are related, but none is specific to ${domain}`
        : `${matched.join(', ')}`;
  return { attendance, relevance, matchedTerms: matched, explanation };
}
