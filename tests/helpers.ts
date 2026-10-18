import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from '../cli/load-sources';
import { assessJob, buildDataset, type CandidateAssessment, type Dataset, type JobAssessment } from '../pipeline';

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
