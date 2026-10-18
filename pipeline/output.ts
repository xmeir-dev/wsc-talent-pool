/**
 * The output contract: one CSV row per person for the selected job (see docs/schema-and-flow.md).
 */

import { toCsv } from './csv';
import { formatYears } from './history';
import { joinOr } from './text';
import type { CandidateAssessment, EventAssessment, JobAssessment } from './types';

export const OUTPUT_COLUMNS = [
  // Recommendation
  'recommendation',
  'shortlist_rank',
  'tie_note',
  'outcome_reason',
  'points_total',
  'required_points',
  'required_points_max',
  'nice_to_have_points',
  'industry_bonus_points',
  'fit_evidence',
  'skill_gaps',
  'seniority_evidence',
  'industry_bonus_evidence',
  // Person
  'candidate_key',
  'source_contact_ids',
  'full_name',
  'firstname',
  'lastname',
  'email',
  'linkedin_url',
  'current_company',
  'current_title',
  'years_experience',
  // Role and history
  'job_id',
  'job_title',
  'event_assessments',
  'assessment_version',
  // References
  'employee_connections',
  'connection_count',
  'connection_status',
  'possible_references',
  // Review
  'profile_status',
  'data_quality_flags',
  'review_next_step',
  'comeet_status',
  'job_interest',
] as const;

export type OutputColumn = (typeof OUTPUT_COLUMNS)[number];
export type OutputRow = Record<OutputColumn, string | number | null>;

/**
 * HubSpot's First name / Last name. First word → firstname, the rest → lastname
 * ("Maria de la Cruz" → "Maria" / "de la Cruz"); a single word leaves lastname blank.
 * A recruiter should correct unusual name orders before import.
 */
export function splitName(fullName: string): { firstname: string; lastname: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstname: words[0] ?? '', lastname: words.slice(1).join(' ') };
}

function formatEvent(e: EventAssessment): string {
  const a = e.attendance;
  const parts = [
    `${a.conferenceDate} ${a.conferenceName} [${a.conferenceDomain}]: ${e.relevance.replace('_', ' ')} (${e.explanation})`,
    `ref ${a.hubspotId}${a.source ? `, ${a.source}` : ''}`,
  ];
  if (a.notes) parts.push(`note: "${a.notes}"`);
  return parts.join('; ');
}

export function toOutputRow(a: CandidateAssessment, jobTitle: string, version: string): OutputRow {
  const c = a.candidate;
  const p = c.profile;
  const latest = c.attendances[c.attendances.length - 1];
  const conn = a.connections;
  const connections = [
    ...conn.resolved.map((e) => `${e.fullName} (${e.employeeId}, ${e.title})`),
    ...conn.unresolvedIds.map((id) => `${id} (not in employee roster)`),
  ];
  return {
    recommendation: a.recommendation,
    shortlist_rank: a.shortlistRank,
    tie_note: a.tieNote,
    outcome_reason: a.outcomeReasons.join('; '),
    points_total: p ? a.points.total : null,
    required_points: p ? a.points.required : null,
    required_points_max: a.points.requiredMax,
    nice_to_have_points: p ? a.points.niceToHave : null,
    industry_bonus_points: p ? a.points.industryBonus : null,
    fit_evidence: p ? joinOr(a.fitEvidence, 'no required skill on profile') : '',
    skill_gaps: p ? joinOr(a.skillGaps, 'none identified') : 'unknown: no profile',
    seniority_evidence: a.seniority.summary,
    industry_bonus_evidence: a.industryBonusEvidence,
    candidate_key: c.candidateKey,
    source_contact_ids: c.sourceContactIds.join(';'),
    full_name: c.fullName,
    ...splitName(c.fullName),
    email: c.email,
    linkedin_url: c.linkedinUrl,
    current_company: p?.currentCompany ?? latest?.listedCompany ?? '',
    current_title: p?.currentTitle ?? latest?.listedTitle ?? '',
    years_experience: p?.yearsExperience ?? null,
    job_id: a.jobId,
    job_title: jobTitle,
    event_assessments: a.events.map(formatEvent).join(' | '),
    assessment_version: version,
    employee_connections: p ? joinOr(connections, 'none listed') : '',
    connection_count: conn.count,
    connection_status: conn.status,
    possible_references: p
      ? joinOr(
          a.possibleReferences.map(
            (r) =>
              `${r.employeeName} (${r.employeeId}): both at ${r.company}, overlap ${formatYears({ start: r.overlapStart, end: r.overlapEnd })}${r.alsoListedConnection ? '; also a listed connection' : ''}`,
          ),
          'none found',
        )
      : '',
    profile_status: c.profileStatus,
    data_quality_flags: joinOr(a.dataQualityFlags, 'none'),
    review_next_step: a.reviewNextStep,
    comeet_status: 'unknown',
    job_interest: 'unknown',
  };
}

export function toOutputRows(result: JobAssessment): OutputRow[] {
  return result.candidates.map((a) => toOutputRow(a, result.job.title, result.assessmentVersion));
}

export function assessmentToCsv(result: JobAssessment): string {
  return toCsv(OUTPUT_COLUMNS, toOutputRows(result));
}

export function outputFileName(jobId: string): string {
  return `candidates_${jobId}.csv`;
}
