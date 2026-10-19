/**
 * F14 test data: harmless formula-like names and companies, run through the app's real import and export code.
 * Nothing here is a harmful payload, a link or an external data request: `=1+2` would only ever show 3.
 */
import { assessJob, assessmentToCsv, type JobAssessment } from '../pipeline';
import { bundledSources } from '../view/data';
import { attendeesXlsx, buildPool, filterAttendees, type Attendee, type Pool } from '../view/attendees';
import { exportCsv, exportXlsx } from '../view/download';
import { importAttendeeList } from '../view/importList';

/** Start a cell with a formula sign: equals, plus, minus, at. */
export const FORMULA_LIKE = ['=1+2', '+1+2', '-1+2', '@SUM(1,2)'] as const;

/**
 * The same formula behind leading whitespace or a control character. Imports trim surrounding whitespace, so
 * these reach the download through the export functions directly (still the real export code).
 */
export const LEADING_VARIANTS = [' =1+2', '\t=1+2', '\r=1+2', '\n=1+2', '\u000b=1+2', '\u0001=1+2', ' =1+2'] as const;

const EVENT = 'Formula Check Meetup';

/** Every payload as both the name and the company of one imported attendee (the import keeps U+0001; it is not whitespace). */
export function payloadPool(): { pool: Pool; imported: string[]; assessment: JobAssessment } {
  const imported = [...FORMULA_LIKE, '\u0001=1+2'];
  const header = 'full_name,email,company,title,conference_name,conference_domain,conference_date,linkedin_url';
  const lines = imported.map((v, i) => [v, `formula${i}@example.test`, v, 'Engineer', EVENT, 'Sports Technology', '2026-10-19', ''].map(csvCell).join(','));
  const result = importAttendeeList(bundledSources, [header, ...lines].join('\n') + '\n');
  if (!result.ok) throw new Error(result.problems.join('; '));
  const pool = buildPool(result.dataset);
  return { pool, imported, assessment: assessJob(result.dataset, 'JOB001') };
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The imported attendees as the recruiter view's Excel download, filtered to the check's event. */
export function attendeesDownload(pool: Pool) {
  const key = pool.conferences.find((c) => c.name === EVENT)!.key;
  return attendeesXlsx(filterAttendees(pool, [key], []), [EVENT]);
}

/** Attendees whose name and company carry the leading variants exactly, through the same Excel export. */
export function variantsDownload(pool: Pool, values: readonly string[] = LEADING_VARIANTS) {
  const template = filterAttendees(pool, [pool.conferences.find((c) => c.name === EVENT)!.key], [])[0]!;
  const people: Attendee[] = values.map((v, i) => ({
    ...template,
    candidate: { ...template.candidate, candidateKey: `P-variant-${i}`, fullName: v },
    any: { ...template.any, row: { ...template.any.row, current_company: v } },
  }));
  return { file: attendeesXlsx(people, ['leading variants']), people };
}

/** The job assessment as the CRM CSV (exact) and as the Excel download. */
export function assessmentDownloads(assessment: JobAssessment) {
  return { csv: exportCsv(assessment), xlsx: exportXlsx(assessment), cli: assessmentToCsv(assessment) };
}
