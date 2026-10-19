/**
 * Terminal report for one job: the shortlist and the review queue with the evidence behind each person.
 * Plain text, so it reads the same on screen and when redirected to a file. Every sentence comes from the
 * assessment; nothing here decides or scores.
 */

import { formatYears } from '../pipeline/history';
import type { CandidateAssessment, JobAssessment, SkillMatch } from '../pipeline';

const NOT_AVAILABLE = 'Not available';

// Escape sequences first (so "ESC[31m" leaves nothing behind), then any other control or direction-override character.
const ESCAPE_SEQUENCES = /\u001b\[[0-?]*[ -\/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-Z\\-_]/g;
// Tab, CR, LF, NEL (\x85), and the Unicode line and paragraph separators.
const LINE_BREAKS = /[\t\r\n\x85\p{Zl}\p{Zp}]+/gu;
// C0 and C1 controls, plus the bidirectional marks, embeddings, overrides and isolates that reorder displayed text.
const CONTROL_CHARACTERS = /[\p{Cc}\p{Bidi_Control}]/gu;

/** Imported text as one safe terminal line: no escape sequences or control characters, line breaks and tabs as spaces. */
export function cleanForTerminal(text: string): string {
  return text.replace(ESCAPE_SEQUENCES, '').replace(LINE_BREAKS, ' ').replace(CONTROL_CHARACTERS, '');
}

const list = (items: string[]) => items.join('; ');


function confirmed(m: SkillMatch): string {
  return m.evidence && m.evidence.trim().toLowerCase() !== m.skill.trim().toLowerCase() ? `${m.skill} (listed as ${m.evidence})` : m.skill;
}

function roleLine(a: CandidateAssessment): string {
  const c = a.candidate;
  const latest = c.attendances[c.attendances.length - 1];
  const title = c.profile?.currentTitle || latest?.listedTitle || '';
  const company = c.profile?.currentCompany || latest?.listedCompany || '';
  if (title && company) return `${title} at ${company}`;
  return title || company || NOT_AVAILABLE;
}

function candidateLines(a: CandidateAssessment, heading: string): string[] {
  const c = a.candidate;
  const pad = '    ';
  const required = a.skills.filter((s) => s.kind === 'required');
  const hasProfile = c.profile !== null;
  const lines = [`  ${heading}${a.tieNote ? `  (${a.tieNote})` : ''}`];
  const add = (label: string, value: string) => lines.push(`${pad}${label}: ${value}`);

  add('Role', roleLine(a));
  if (!hasProfile) {
    add('Required skills', `${NOT_AVAILABLE} (no LinkedIn profile matched)`);
    add('Gaps', NOT_AVAILABLE);
  } else {
    const named = required.filter((s) => s.match === 'named').map(confirmed);
    const related = required.filter((s) => s.match === 'equivalent').map((s) => `${s.skill} (related skill: ${s.evidence})`);
    const inferred = required.filter((s) => s.match === 'inferred').map((s) => `${s.skill} (likely, from ${s.evidence}; to confirm)`);
    add('Required skills', `${a.tally.required} of ${a.tally.requiredTotal} confirmed on the profile (shortlist needs ${a.tally.requiredNeeded})`);
    add('  Confirmed', named.length ? list(named) : 'None');
    if (related.length) add('  Related only', list(related));
    if (inferred.length) add('  Inferred only', list(inferred));
    add('Gaps', a.skillGaps.length ? list(a.skillGaps) : 'None identified');
  }
  add('Experience', hasProfile ? a.seniority.summary || NOT_AVAILABLE : NOT_AVAILABLE);

  if (!hasProfile) {
    add('WSC references', NOT_AVAILABLE);
  } else {
    const refs = a.possibleReferences.map(
      (r) => `${r.employeeName} (${r.employeeId}): both at ${r.company}, overlap ${formatYears({ start: r.overlapStart, end: r.overlapEnd })}${r.alsoListedConnection ? '; also a listed connection' : ''}`,
    );
    const conns = [
      ...a.connections.resolved.map((e) => `${e.fullName} (${e.employeeId}, ${e.title})`),
      ...a.connections.unresolvedIds.map((id) => `${id} (not in employee roster)`),
    ];
    add('WSC references', refs.length ? list(refs) : 'None found');
    add('Listed WSC connections', conns.length ? list(conns) : 'None listed');
  }
  if (a.outcomeReasons.length) add('Why', a.outcomeReasons.join(' · '));
  add('Next step', a.reviewNextStep || NOT_AVAILABLE);
  const flags = a.dataQualityFlags;
  if (flags.length) add('Data notes', list(flags));
  return lines;
}

/** Report lines for one job. `file` is where the CSV was written, or null when nothing was written. */
export function formatReport(result: JobAssessment, file: string | null): string {
  const { job, counts, candidates } = result;
  const shortlist = candidates.filter((c) => c.recommendation === 'shortlist');
  const review = candidates.filter((c) => c.recommendation === 'needs_review');
  const lines = [
    `${job.jobId}  ${job.title}`,
    `${counts.shortlist} shortlisted, ${counts.needs_review} need review, ${counts.not_recommended_for_role} not recommended for this role (${candidates.length} people)`,
    '',
    `SHORTLIST (${shortlist.length})`,
  ];
  if (shortlist.length === 0) lines.push('  No one meets every shortlist condition; see Needs review below.');
  for (const a of shortlist) lines.push('', ...candidateLines(a, `#${a.shortlistRank} ${a.candidate.fullName}`));
  lines.push('', `NEEDS REVIEW (${review.length})`);
  if (review.length === 0) lines.push('  No one needs review.');
  for (const a of review) lines.push('', ...candidateLines(a, `- ${a.candidate.fullName}`));
  lines.push('', `Not recommended for this role: ${counts.not_recommended_for_role} (listed in the CSV only)`);
  if (file) lines.push(`CSV: ${file}`);
  return lines.map(cleanForTerminal).join('\n');
}
