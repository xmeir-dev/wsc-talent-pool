/**
 * Node entry point: reads data/*.csv, runs the shared pipeline, writes output/candidates_<job_id>.csv.
 *
 *   npm run pipeline -- JOB001
 *   npm run pipeline -- --all
 *   npm run pipeline -- JOB001 --data path/to/data --out path/to/output
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessJob, assessmentToCsv, buildDataset, DataValidationError, outputFileName, UnknownJobError } from '../pipeline';
import type { JobAssessment } from '../pipeline';
import { loadSources } from './load-sources';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function summary(result: JobAssessment, file: string): string {
  const counts = result.counts;
  const lines = [
    `${result.job.jobId} ${result.job.title}: ${counts.shortlist} shortlist, ${counts.needs_review} needs_review, ${counts.not_recommended_for_role} not_recommended_for_role (${result.candidates.length} people)`,
  ];
  const shortlist = result.candidates.filter((c) => c.recommendation === 'shortlist');
  for (const a of shortlist) {
    const tied = shortlist.some((o) => o !== a && o.shortlistRank === a.shortlistRank);
    lines.push(`  #${a.shortlistRank} ${a.candidate.fullName} (${a.points.total} pts)${tied ? ' [tied]' : ''}`);
  }
  if (shortlist.length === 0) lines.push('  (no one meets every shortlist condition; see needs_review)');
  lines.push(`  → ${file}`);
  return lines.join('\n');
}

function main(argv: string[]): number {
  const args = [...argv];
  const take = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const dataDir = resolve(take('--data') ?? join(ROOT, 'data'));
  const outDir = resolve(take('--out') ?? join(ROOT, 'output'));
  const all = args.includes('--all');
  const jobArg = args.find((a) => !a.startsWith('--'));

  if (!all && !jobArg) {
    console.error('Usage: npm run pipeline -- <job_id>   (e.g. JOB001)\n       npm run pipeline -- --all');
    return 2;
  }

  try {
    const dataset = buildDataset(loadSources(dataDir));
    for (const w of dataset.warnings) console.warn(`warning: ${w}`);
    const jobIds = all ? dataset.jobs.map((j) => j.jobId) : [jobArg!];
    mkdirSync(outDir, { recursive: true });
    for (const jobId of jobIds) {
      const result = assessJob(dataset, jobId);
      const file = join(outDir, outputFileName(result.job.jobId));
      writeFileSync(file, assessmentToCsv(result), 'utf8');
      console.log(summary(result, file));
    }
    return 0;
  } catch (err) {
    if (err instanceof UnknownJobError || err instanceof DataValidationError) {
      console.error(err.message);
      return 1;
    }
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.error(`Cannot read source file: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

process.exitCode = main(process.argv.slice(2));
