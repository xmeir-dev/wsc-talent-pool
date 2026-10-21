/** Command-line parsing for the pipeline CLI. Pure: nothing is read or written until the arguments are accepted. */

export type ParsedArgs =
  | { kind: 'help' }
  | { kind: 'run'; jobId: string | null; all: boolean; learnSkills: boolean; dataDir: string | null; outDir: string | null }
  | { kind: 'error'; message: string };

const VALUE_FLAGS = ['--data', '--out'] as const;

export const USAGE = `Usage:
  npm run pipeline -- <job_id> [--learn-skills] [--data <folder>] [--out <folder>]
  npm run pipeline -- --all [--learn-skills] [--data <folder>] [--out <folder>]
  npm run pipeline -- --help

Assesses the attendees for one job (or every job with --all), prints the shortlist and
the people who need review, and writes one CSV per job.

Arguments:
  <job_id>         A job from job_openings.csv, e.g. JOB001 (any letter case).
  --all            Run every job in job_openings.csv. Cannot be combined with a job ID.
  --learn-skills   Before scoring, ask Claude whether unfamiliar skill words are known skills
                   written differently ("K8s" for Kubernetes) and save the agreed answers to
                   data/skill-variants.json. Needs ANTHROPIC_API_KEY. Without it, nothing is sent.
  --data <folder>  Folder with the four source CSVs. Default: ./data in this project.
  --out <folder>   Folder for the CSVs. Created if missing. Default: ./output in this project.
  -h, --help       Show this help. Reads and writes no files.

Output: <out>/candidates_<job_id>.csv. An existing file with the same name is overwritten.
Paths with spaces work when quoted: --data "my data".
Exit status: 0 success, 1 data, file or unknown-job problem, 2 invalid command.`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };

  const values: Record<string, string> = {};
  const jobIds: string[] = [];
  let all = false;
  let learnSkills = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--all') {
      if (all) return { kind: 'error', message: 'Option --all was given more than once.' };
      all = true;
    } else if (arg.startsWith('--all=')) {
      return { kind: 'error', message: 'Option --all takes no value.' };
    } else if (arg === '--learn-skills') {
      if (learnSkills) return { kind: 'error', message: 'Option --learn-skills was given more than once.' };
      learnSkills = true;
    } else if (arg.startsWith('--learn-skills=')) {
      return { kind: 'error', message: 'Option --learn-skills takes no value.' };
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const flag = eq < 0 ? arg : arg.slice(0, eq);
      if (!(VALUE_FLAGS as readonly string[]).includes(flag)) return { kind: 'error', message: `Unknown option ${flag}.` };
      if (flag in values) return { kind: 'error', message: `Option ${flag} was given more than once.` };
      const value = eq < 0 ? argv[i + 1] : arg.slice(eq + 1);
      if (value === undefined || value === '' || (eq < 0 && value.startsWith('-'))) return { kind: 'error', message: `Option ${flag} needs a folder path.` };
      values[flag] = value;
      if (eq < 0) i++;
    } else if (arg.startsWith('-') && arg !== '-') {
      return { kind: 'error', message: `Unknown option ${arg}.` };
    } else {
      jobIds.push(arg);
    }
  }

  if (jobIds.length > 1) return { kind: 'error', message: `Give one job ID, not ${jobIds.length} (${jobIds.join(', ')}). Use --all for every job.` };
  if (all && jobIds.length === 1) return { kind: 'error', message: `Give either a job ID (${jobIds[0]}) or --all, not both.` };
  if (!all && jobIds.length === 0) return { kind: 'error', message: 'Give a job ID (e.g. JOB001) or --all.' };
  return { kind: 'run', jobId: jobIds[0] ?? null, all, learnSkills, dataDir: values['--data'] ?? null, outDir: values['--out'] ?? null };
}
