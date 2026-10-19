import { assessmentToCsv, assessmentToXlsx, outputFileName, outputXlsxFileName, XLSX_MIME, type JobAssessment } from '../pipeline';

export interface DownloadFile {
  fileName: string;
  /** Text is written as UTF-8. */
  data: string | Uint8Array;
  type: string;
}

/**
 * The CRM import file: exactly the text the CLI writes to output/candidates_<job_id>.csv. Values are unaltered
 * (no prefixes), so a formula-like name stays as typed; it is meant for HubSpot import, not for opening in a spreadsheet.
 */
export function exportCsv(result: JobAssessment): DownloadFile {
  return { fileName: outputFileName(result.job.jobId), data: assessmentToCsv(result), type: 'text/csv;charset=utf-8' };
}

/** The same assessment for people to open: an Excel workbook with text cells and numeric counts/ranks (pipeline/xlsx.ts). */
export function exportXlsx(result: JobAssessment): DownloadFile {
  return { fileName: outputXlsxFileName(result.job.jobId), data: assessmentToXlsx(result), type: XLSX_MIME };
}

export function downloadFile({ fileName, data, type }: DownloadFile): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
