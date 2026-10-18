import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessJob, buildDataset } from '../pipeline';
import { ROOT } from '../tests/helpers';
import { bundledSources } from './data';
import { exportCsv } from './download';

// The browser bundles data/ as raw text; its export must be the committed CLI output, byte for byte.
describe('browser export', () => {
  const dataset = buildDataset(bundledSources);
  for (const job of dataset.jobs) {
    it(`matches output/candidates_${job.jobId}.csv`, () => {
      const { fileName, text } = exportCsv(assessJob(dataset, job.jobId));
      expect(fileName).toBe(`candidates_${job.jobId}.csv`);
      const committed = readFileSync(join(ROOT, 'output', fileName));
      expect(Buffer.from(text, 'utf8').equals(committed)).toBe(true);
    });
  }
});
