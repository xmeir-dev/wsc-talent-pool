/** The four supplied CSVs, bundled as raw text so the view runs with no server or credentials. */

import type { SourceTexts } from '../pipeline';
import attendees from '../data/conference_attendees.csv?raw';
import jobs from '../data/job_openings.csv?raw';
import profiles from '../data/linkedin_profiles.csv?raw';
import employees from '../data/wsc_employees.csv?raw';

export const bundledSources: SourceTexts = { attendees, profiles, employees, jobs };
