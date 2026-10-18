import { assessmentToCsv, outputFileName, type JobAssessment } from '../pipeline';

/** The exact text the CLI writes to output/candidates_<job_id>.csv. */
export function exportCsv(result: JobAssessment): { fileName: string; text: string } {
  return { fileName: outputFileName(result.job.jobId), text: assessmentToCsv(result) };
}

export function downloadFile({ fileName, text }: { fileName: string; text: string }): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
