import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from '../cli/load-sources';
import { assessJob, buildDataset, toCsv, type CandidateAssessment, type CsvRecord, type Dataset, type JobAssessment, type SourceTexts } from '../pipeline';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
/** Made-up records with deliberate edge cases. Never mixed into data/. */
export const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures', 'synthetic');

export function realDataset(): Dataset {
  return buildDataset(loadSources(DATA_DIR));
}

export function fixtureDataset(): Dataset {
  return buildDataset(loadSources(FIXTURE_DIR));
}

export function byName(result: JobAssessment, name: string): CandidateAssessment {
  const found = result.candidates.filter((c) => c.candidate.fullName === name);
  if (found.length !== 1) throw new Error(`expected exactly one "${name}", found ${found.length}`);
  return found[0]!;
}

export function shortlistNames(result: JobAssessment): string[] {
  return result.candidates.filter((c) => c.recommendation === 'shortlist').map((c) => c.candidate.fullName);
}

export { assessJob };

/** The attendee columns of the synthetic one-file sources below, in the supplied files' order. */
export const SYNTHETIC_ATTENDEE_COLUMNS = ['hubspot_id', 'full_name', 'email', 'company', 'title', 'conference_name', 'conference_domain', 'conference_date', 'source', 'notes', 'linkedin_url'];

/** One made-up attendee at one 2026 edition; the email and LinkedIn URL follow from the name. */
export const syntheticPerson = (id: string, name: string): CsvRecord => ({
  hubspot_id: id,
  full_name: name,
  email: `${name.toLowerCase()}@example.test`,
  company: 'Synthetic Company',
  title: 'Engineer',
  conference_name: 'Synthetic Summit',
  conference_domain: 'Data Engineering & AI/ML',
  conference_date: '2026-01-15',
  source: 'Synthetic review',
  notes: '',
  linkedin_url: `linkedin.com/in/${name.toLowerCase()}-review`,
});

/** Synthetic one-file sources: each attendee row gets a matching profile, and there is one synthetic ML role. */
export const syntheticSources = (attendees: CsvRecord[], jobId = 'JOB900'): SourceTexts => ({
  attendees: toCsv(SYNTHETIC_ATTENDEE_COLUMNS, attendees),
  profiles: toCsv(
    ['linkedin_url', 'full_name', 'current_company', 'current_title', 'years_experience', 'top_skills', 'industry', 'wsc_mutual_connections'],
    [...new Map(attendees.map((row) => [row.linkedin_url, row])).values()].map((row) => ({
      linkedin_url: row.linkedin_url!,
      full_name: row.full_name!,
      current_company: 'Synthetic Company',
      current_title: 'Engineer',
      years_experience: '8',
      top_skills: 'Python;Object Detection;AWS',
      industry: 'Software',
      wsc_mutual_connections: '',
    })),
  ),
  employees: toCsv(['employee_id', 'full_name', 'title'], []),
  jobs: toCsv(['job_id', 'title', 'seniority', 'required_skills', 'nice_to_have'], [
    { job_id: jobId, title: 'Synthetic ML Engineer', seniority: 'Senior', required_skills: 'Python;PyTorch;Computer Vision;Object Detection;AWS', nice_to_have: '' },
  ]),
});
