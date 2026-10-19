/**
 * The "AI-assisted" criteria step of Comeet's New position dialog, scripted for the demo: a small deterministic
 * extractor over the job description plus a per-example fixture of inferred rows. Same text in, same rows out.
 * In production this is an LLM extraction the recruiter confirms before matching (docs/design.md).
 *
 * Extraction: each sentence is classified by its wording, and every known skill named in it becomes a row of that
 * list, quoting the sentence. "A plus", "nice to have", "bonus", "preferred" → Nice to have; "must", "essential" →
 * Must-have; "you will", "you'll", "day to day", "focus on" → Core; any other sentence that names a skill → Required.
 * A list subject ("Prometheus and Go are a plus") adds every listed name, known or not (listItems).
 * An opening "We're hiring…" line names the role, not its requirements, and is skipped.
 */

import { normalize } from '../pipeline/text';

export type CriteriaList = 'core' | 'mustHave' | 'required' | 'niceToHave';

export interface CriteriaRow {
  id: string;
  list: CriteriaList;
  skill: string;
  /** The description sentence that supports the row; empty for a row the recruiter added. */
  quote: string;
  /** "description": named in an explicit sentence. "ai": inferred (scripted fixture). "recruiter": added by hand. */
  origin: 'description' | 'ai' | 'recruiter';
}

export const CRITERIA_LISTS: { list: CriteriaList; label: string; hint: string; row: string }[] = [
  { list: 'core', label: 'Core skills', hint: 'any one makes the person relevant', row: 'Core skill' },
  { list: 'mustHave', label: 'Must-have skills', hint: 'each required for the shortlist', row: 'Must-have skill' },
  { list: 'required', label: 'Required skills', hint: '60% needed for the shortlist', row: 'Required skill' },
  { list: 'niceToHave', label: 'Nice to have', hint: '', row: 'Nice to have' },
];

/** Skills the extractor recognises, as they are written in the job tables. Short names match their exact case. */
const VOCABULARY = [
  'Python', 'PyTorch', 'TensorFlow', 'Computer Vision', 'Object Detection', 'OpenCV', 'YOLO', 'Pose Estimation',
  'Sports Tracking', 'Deep Learning', 'Machine Learning', 'Video Analytics', 'AWS', 'GCP', 'Azure', 'SageMaker',
  'Sports Analytics', 'Real-time processing', 'Docker', 'Kubernetes', 'Helm', 'Terraform', 'CI/CD', 'Jenkins',
  'Monitoring', 'Go', 'Golang', 'Java', 'Node.js', 'Kafka', 'Microservices', 'REST APIs', 'FFmpeg', 'Video streaming',
  'HLS', 'CDN', 'Redis', 'Product Management', 'Stakeholder Management', 'SQL', 'Snowflake', 'Spark', 'dbt', 'Airflow',
];

/** An opening line ("We're hiring a Computer Vision Engineer…") names the role, not its requirements. */
const INTRO = /\b(we('re| are) hiring|join (us|our))\b/i;

const CUES: { list: CriteriaList; pattern: RegExp }[] = [
  { list: 'niceToHave', pattern: /\b(nice to have|a plus|bonus|preferred|ideally)\b/i },
  { list: 'mustHave', pattern: /\b(must|essential|non-negotiable)\b/i },
  { list: 'core', pattern: /\b(you will|you'll|day to day|day-to-day|focus on)\b/i },
];

/** Inferred rows per example role (normalized title fragment). A row appears only when a sentence matches its cue. */
const AI_FIXTURES: { title: string; rows: { list: CriteriaList; skill: string; cue: RegExp }[] }[] = [
  {
    title: 'computer vision engineer',
    rows: [{ list: 'niceToHave', skill: 'Pose Estimation', cue: /\btrack/i }],
  },
  {
    title: 'site reliability engineer',
    rows: [
      { list: 'core', skill: 'Kubernetes', cue: /kubernetes|k8s|cluster|container/i },
      { list: 'core', skill: 'Terraform', cue: /terraform|infrastructure as code|\biac\b/i },
      { list: 'core', skill: 'CI/CD', cue: /ci\/cd|pipeline|deploy|release/i },
      { list: 'core', skill: 'Monitoring', cue: /monitor|alert|observability|on-call|incident|uptime|availab/i },
      { list: 'mustHave', skill: 'AWS', cue: /\baws\b|amazon web services/i },
      { list: 'niceToHave', skill: 'Helm', cue: /kubernetes|k8s|helm/i },
    ],
  },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const PATTERNS = VOCABULARY.map((skill) => ({
  skill,
  // Short names ("Go", "AWS", "dbt") must match their exact case, so "go live" is not the Go language.
  pattern: new RegExp(`(^|[^A-Za-z0-9])${escape(skill)}(?![A-Za-z0-9])`, skill.length <= 4 ? '' : 'i'),
}));

export function sentences(description: string): string[] {
  return description
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Known skills named in a sentence, in reading order; a name inside a longer match counts once. */
export function skillsIn(sentence: string): string[] {
  const hits = PATTERNS.flatMap(({ skill, pattern }) => {
    const m = pattern.exec(sentence);
    if (!m) return [];
    const start = m.index + m[1]!.length;
    return [{ skill, start, end: start + skill.length }];
  });
  return hits
    .filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
    .sort((a, b) => a.start - b.start)
    .map((h) => h.skill);
}

/**
 * "X, Y and Z are a plus / are required / are a must": the subject is a list of skills, so each item becomes a row
 * even when it is not in VOCABULARY ("Prometheus and Go are a plus"). Leading "Experience with" and a trailing
 * "experience" are dropped. Unknown items are kept only in a list of two or more where every item looks like a name
 * (capitalised, at most three words), so a sentence like "Teamwork is essential" adds nothing.
 */
const LIST_PREDICATE =
  /\s+(?:is|are)\s+(?:also\s+)?(?:a\s+)?(?:(?:big|strong|real)\s+)?(?:plus|must(?:-have)?|required|essential|nice to have|preferred|bonus|non-negotiable)\b/i;
const LIST_LEAD = /^(?:(?:hands-on|strong|solid|proven|deep|good)\s+)?(?:experience|knowledge|familiarity|expertise|skills?|proficiency)\s+(?:with|in|of)\s+/i;
const LIST_TAIL = /\s+(?:experience|skills?|knowledge)$/i;

function listItems(sentence: string): string[] {
  const predicate = LIST_PREDICATE.exec(sentence);
  if (!predicate) return [];
  const subject = sentence.slice(0, predicate.index).trim().replace(LIST_LEAD, '').replace(LIST_TAIL, '');
  const items = subject
    .split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or|&)\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ item, known: skillsIn(item) }));
  // Unknown names are trusted only inside a list of names: "Teamwork is essential" is not a tool.
  const allNames = items.length >= 2 && items.every(({ item, known }) => known.length > 0 || looksLikeName(item));
  return items.flatMap(({ item, known }) => (known.length > 0 ? known : allNames ? [item] : []));
}

const looksLikeName = (item: string) =>
  item.length <= 30 && /^[A-Z0-9][\w.+#/-]*(?: [\w.+#/-]+){0,2}$/.test(item) && !/^(strong|good|great|excellent|solid|proven|some)\b/i.test(item);

/** Skills a sentence names: its subject list first, then any other known skill in it, each once. */
function skillsOf(sentence: string): string[] {
  const out: string[] = [];
  for (const skill of [...listItems(sentence), ...skillsIn(sentence)]) {
    if (!out.some((o) => normalize(o) === normalize(skill))) out.push(skill);
  }
  return out;
}

function listFor(sentence: string): CriteriaList {
  return CUES.find((c) => c.pattern.test(sentence))?.list ?? 'required';
}

/** Suggested criteria for a role: description rows first, then the example's inferred rows not already present. */
export function suggestCriteria(title: string, description: string): CriteriaRow[] {
  const rows: CriteriaRow[] = [];
  const has = (list: CriteriaList, skill: string) => rows.some((r) => r.list === list && normalize(r.skill) === normalize(skill));
  for (const sentence of sentences(description)) {
    if (INTRO.test(sentence)) continue;
    const list = listFor(sentence);
    for (const skill of skillsOf(sentence)) {
      if (!has(list, skill)) rows.push({ id: `${list}-${rows.length}`, list, skill, quote: sentence, origin: 'description' });
    }
  }
  const fixture = AI_FIXTURES.find((f) => normalize(title).includes(f.title));
  for (const { list, skill, cue } of fixture?.rows ?? []) {
    const quote = sentences(description).find((s) => cue.test(s));
    if (quote && !has(list, skill)) rows.push({ id: `${list}-${rows.length}`, list, skill, quote, origin: 'ai' });
  }
  return rows;
}

/**
 * The recruiter changed a row's text. A suggested row then becomes the recruiter's own: it loses its "From description"
 * or "AI suggestion" label and the quoted sentence, which supported the old text, not the new one.
 */
export function editRow(row: CriteriaRow, skill: string): CriteriaRow {
  if (skill === row.skill) return row;
  return row.origin === 'recruiter' ? { ...row, skill } : { ...row, skill, quote: '', origin: 'recruiter' };
}
