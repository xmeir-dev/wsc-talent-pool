import { HugeiconsIcon } from '@hugeicons/react';
import { AiFileIcon } from '@hugeicons/core-free-icons';
import { Avatar, Hint } from '@meir-labs/ui-kit';
import type { Candidate } from '../pipeline';
import ai from '../data/ai_summaries.json';
import recruiters from '../data/demo_recruiters.json';
import { AVATAR, initials } from './avatars';
import { shortDate } from './format';

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
      {o.by ? (
        <Hint tip={<NoteTip o={o} by={o.by} />} focusable={false}>
          {o.text}
        </Hint>
      ) : (
        <span>{o.text}</span>
      )}
    </span>
  );
}

/** The note again, then who wrote it and when. */
function NoteTip({ o, by }: { o: OverviewLine; by: NonNullable<OverviewLine['by']> }) {
  return (
    <span className="note-tip">
      <span>{o.text}</span>
      <span className="note-tip-by">
        <Avatar size="xs" src={AVATAR[by.id]} fallback={initials(by.name)} aria-hidden="true" />
        {by.name} · {shortDate(by.date)}
      </span>
    </span>
  );
}
