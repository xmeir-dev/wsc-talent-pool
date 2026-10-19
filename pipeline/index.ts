/**
 * Public API of the assessment pipeline. Pure TypeScript: no file system, no network,
 * so the browser view and the Node CLI share exactly the same logic.
 *
 *   const dataset = buildDataset({ attendees, profiles, employees, jobs }); // raw CSV text
 *   const result = assessJob(dataset, 'JOB001');
 *   const csv = assessmentToCsv(result);
 */

import { assessCandidate } from './assess';
import { rankAssessments } from './rank';
import { ASSESSMENT_VERSION } from './rules';
import type { Dataset, JobAssessment, Recommendation, SourceTexts } from './types';
import { buildDataset } from './dataset';
import { assessmentToCsv } from './output';

export class UnknownJobError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly knownJobIds: string[],
  ) {
    super(`Unknown job_id "${jobId}". Known: ${knownJobIds.join(', ')}`);
    this.name = 'UnknownJobError';
  }
}

export function assessJob(dataset: Dataset, jobId: string): JobAssessment {
  const job = dataset.jobs.find((j) => j.jobId.toUpperCase() === jobId.trim().toUpperCase());
  if (!job) throw new UnknownJobError(jobId, dataset.jobs.map((j) => j.jobId));
  const candidates = rankAssessments(dataset.candidates.map((c) => assessCandidate(c, job, dataset.employees)));
  const counts: Record<Recommendation, number> = { shortlist: 0, needs_review: 0, not_recommended_for_role: 0 };
  for (const c of candidates) counts[c.recommendation]++;
  return { job, assessmentVersion: ASSESSMENT_VERSION, candidates, counts, warnings: [...dataset.warnings] };
}

/** Convenience: raw CSV texts in, assessment and output CSV out. */
export function runPipeline(sources: SourceTexts, jobId: string): { result: JobAssessment; csv: string } {
  const result = assessJob(buildDataset(sources), jobId);
  return { result, csv: assessmentToCsv(result) };
}

export { buildDataset, DataValidationError } from './dataset';
export { assessCandidate, matchSkill, minYearsFor, policyFor, requiredNeeded, unresolvedSeniority } from './assess';
export { assessEvent } from './conference';
export { findPossibleReferences, sameEmployer } from './history';
export { compareSkills, rankAssessments, skillKey, skillSummary } from './rank';
export { assessmentToCsv, outputFileName, OUTPUT_COLUMNS, splitName, toOutputRows, type OutputColumn, type OutputRow } from './output';
export { parseCsv, toCsv } from './csv';
export * as rules from './rules';
export { ASSESSMENT_VERSION, SUPPORTED_SENIORITIES } from './rules';
export type * from './types';
