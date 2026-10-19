/**
 * Every assessment the demo shows, keyed by person, job and rule version. A HubSpot contact property
 * can only hold one role's snapshot; this store is what lets the contact card switch roles without
 * losing any of them (in production, the assessment store described in docs/design.md).
 */

import { assertUnique, assessJob, toOutputRows, type CandidateAssessment, type Dataset, type JobAssessment, type OutputRow } from '../pipeline';

export interface StoredAssessment {
  a: CandidateAssessment;
  row: OutputRow;
  result: JobAssessment;
}

export interface AssessmentStore {
  dataset: Dataset;
  version: string;
  result: (jobId: string) => JobAssessment;
  get: (candidateKey: string, jobId: string) => StoredAssessment | undefined;
}

export const storeKey = (candidateKey: string, jobId: string, version: string) => `${candidateKey}|${jobId}|${version}`;

export function buildAssessmentStore(dataset: Dataset): AssessmentStore {
  const results = new Map<string, JobAssessment>();
  const entries = new Map<string, StoredAssessment>();
  for (const job of dataset.jobs) {
    const result = assessJob(dataset, job.jobId);
    results.set(job.jobId, result);
    const rows = toOutputRows(result);
    assertUnique(result.candidates.map((a) => a.candidate.candidateKey), 'person IDs');
    result.candidates.forEach((a, i) => {
      entries.set(storeKey(a.candidate.candidateKey, job.jobId, result.assessmentVersion), { a, row: rows[i]!, result });
    });
  }
  const version = results.values().next().value?.assessmentVersion ?? '';
  return {
    dataset,
    version,
    result: (jobId) => {
      const r = results.get(jobId);
      if (!r) throw new Error(`Unknown job ${jobId}`);
      return r;
    },
    get: (candidateKey, jobId) => entries.get(storeKey(candidateKey, jobId, version)),
  };
}
