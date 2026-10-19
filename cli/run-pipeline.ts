/**
 * Node entry point: reads data/*.csv, runs the shared pipeline, prints the shortlist and review queue,
 * and writes output/candidates_<job_id>.csv. Run with --help for usage.
 *
 *   npm run pipeline -- JOB001
 *   npm run pipeline -- --all
 *   npm run pipeline -- JOB001 --data path/to/data --out path/to/output
 */

import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessJob, assessmentToCsv, buildDataset, DataValidationError, outputFileName, UnknownJobError } from '../pipeline';
import { parseArgs, USAGE } from './args';
import { loadSources } from './load-sources';
import { cleanForTerminal, formatReport } from './report';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

class CliError extends Error {}

function fileProblem(err: unknown, action: string, fallbackPath: string, writing = false): CliError | null {
  if (!(err instanceof Error) || !('code' in err)) return null;
  // Node names the exact file that failed; fall back to the folder we were working in.
  const path = 'path' in err && typeof err.path === 'string' && err.path ? err.path : fallbackPath;
  const reasons: Record<string, string> = {
    ENOENT: writing ? 'the folder could not be created' : 'it does not exist',
    EACCES: 'permission denied',
    EPERM: 'permission denied',
    EISDIR: 'it is a folder, not a file',
    ENOTDIR: 'part of the path is a file, not a folder',
    EEXIST: 'a file with that name is in the way',
    EROFS: 'the location is read-only',
  };
  return new CliError(`Cannot ${action} ${path}: ${reasons[String(err.code)] ?? err.message}.`);
}

function run(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.kind === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (args.kind === 'error') {
    console.error(`${cleanForTerminal(args.message)}\nRun "npm run pipeline -- --help" for usage.`);
    return 2;
  }

  const dataDir = resolve(args.dataDir ?? join(ROOT, 'data'));
  const outDir = resolve(args.outDir ?? join(ROOT, 'output'));

  // Everything is read, assessed and rendered before the first file is written.
  let sources;
  try {
    sources = loadSources(dataDir);
  } catch (err) {
    throw fileProblem(err, 'read source file', dataDir) ?? err;
  }
  const dataset = buildDataset(sources);
  for (const w of dataset.warnings) console.warn(cleanForTerminal(`warning: ${w}`));
  const jobIds = args.all ? dataset.jobs.map((j) => j.jobId) : [args.jobId!];
  const results = jobIds.map((jobId) => assessJob(dataset, jobId));
  const files = results.map((r) => ({ path: join(outDir, outputFileName(r.job.jobId)), csv: assessmentToCsv(r) }));

  try {
    mkdirSync(outDir, { recursive: true });
    accessSync(outDir, constants.W_OK);
  } catch (err) {
    throw fileProblem(err, 'write to output folder', outDir, true) ?? err;
  }
  for (const f of files) {
    try {
      writeFileSync(f.path, f.csv, 'utf8');
    } catch (err) {
      throw fileProblem(err, 'write', f.path, true) ?? err;
    }
  }
  console.log(results.map((r, i) => formatReport(r, files[i]!.path)).join('\n\n' + '='.repeat(72) + '\n\n'));
  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  if (err instanceof UnknownJobError) {
    console.error(cleanForTerminal(`Unknown job ID "${err.jobId}". Valid job IDs: ${err.knownJobIds.join(', ')}.`));
  } else if (err instanceof CliError || err instanceof DataValidationError) {
    console.error(cleanForTerminal(err.message));
  } else {
    console.error(cleanForTerminal(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
    if (process.env.DEBUG && err instanceof Error && err.stack) console.error(err.stack);
  }
  process.exitCode = 1;
}
