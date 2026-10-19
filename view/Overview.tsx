import type { Candidate } from '../pipeline';
import ai from '../data/ai_summaries.json';
import recruiters from '../data/demo_recruiters.json';

export type OverviewSource = 'recruiter' | 'ai';

export interface OverviewLine {
  text: string;
  source: OverviewSource;
  /** Where it came from, for the tooltip. */
  origin: string;
  /** A recruiter's note: who wrote it (made up, see data/demo_recruiters.json) and when (the conference date). */
  by?: { id: string; name: string; date: string };
}

const RECRUITERS: Record<string, { id: string; name: string }> = recruiters.byConference;

const AI_SUMMARIES: Record<string, string> = ai.summaries;

/** The recruiter's note from the conference wins; an AI-written line fills in only when there is none. */
export function overviewFor(c: Candidate): OverviewLine | null {
  const noted = c.attendances.find((at) => at.notes.trim());
  if (noted) {
    const r = RECRUITERS[noted.conferenceName];
    return {
      text: noted.notes.trim(),
      source: 'recruiter',
      origin: `Recruiter's note, ${noted.conferenceName}`,
      by: r && { ...r, date: noted.conferenceDate },
    };
  }
  for (const id of c.sourceContactIds) {
    const text = AI_SUMMARIES[id];
    if (text) return { text, source: 'ai', origin: 'AI-written from the LinkedIn profile' };
  }
  return null;
}
