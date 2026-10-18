import { HugeiconsIcon } from '@hugeicons/react';
import { AiFileIcon } from '@hugeicons/core-free-icons';
import { Hint } from '@meir-labs/ui-kit';
import type { Candidate } from '../pipeline';
import ai from '../data/ai_summaries.json';

export type OverviewSource = 'recruiter' | 'ai';

export interface OverviewLine {
  text: string;
  source: OverviewSource;
  /** Where it came from, for the tooltip. */
  origin: string;
}

const AI_SUMMARIES: Record<string, string> = ai.summaries;

/** The recruiter's note from the conference wins; an AI-written line fills in only when there is none. */
export function overviewFor(c: Candidate): OverviewLine | null {
  const noted = c.attendances.find((at) => at.notes.trim());
  if (noted) return { text: noted.notes.trim(), source: 'recruiter', origin: `Recruiter's note, ${noted.conferenceName}` };
  for (const id of c.sourceContactIds) {
    const text = AI_SUMMARIES[id];
    if (text) return { text, source: 'ai', origin: 'AI-written from the LinkedIn profile' };
  }
  return null;
}

export function Overview({ c }: { c: Candidate }) {
  const o = overviewFor(c);
  if (!o) return null;
  return (
    <span className={`overview overview-${o.source}`}>
      {o.source === 'ai' && (
        <Hint tip={o.origin} focusable={false} className="overview-mark">
          <HugeiconsIcon icon={AiFileIcon} size={14} strokeWidth={1.75} aria-label="AI-written" />
        </Hint>
      )}
      <span>{o.text}</span>
    </span>
  );
}
