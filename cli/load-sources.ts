/** File loading for Node. Kept apart from pipeline/ so the assessment stays browser-safe. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceTexts } from '../pipeline';

export const SOURCE_FILES: Record<keyof SourceTexts, string> = {
  attendees: 'conference_attendees.csv',
  profiles: 'linkedin_profiles.csv',
  employees: 'wsc_employees.csv',
  jobs: 'job_openings.csv',
};

export function loadSources(dataDir: string): SourceTexts {
  const read = (file: string) => readFileSync(join(dataDir, file), 'utf8');
  return {
    attendees: read(SOURCE_FILES.attendees),
    profiles: read(SOURCE_FILES.profiles),
    employees: read(SOURCE_FILES.employees),
    jobs: read(SOURCE_FILES.jobs),
  };
}
