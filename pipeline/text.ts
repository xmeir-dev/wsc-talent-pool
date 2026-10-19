/** Small text helpers shared by the assessment modules. */

import { SKILL_EVIDENCE } from './rules';

export function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Split a semicolon-separated cell into trimmed, non-empty items. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Accepted names for a configured skill ("golang" for Go) → that skill. A configured skill is always its own key. */
const ALIAS_OF = new Map<string, string>();
for (const [key, rule] of Object.entries(SKILL_EVIDENCE)) {
  for (const term of rule.named) if (!(term in SKILL_EVIDENCE) && !ALIAS_OF.has(term)) ALIAS_OF.set(term, key);
}

/** The skill a job skill name stands for: "Golang" and "go" are both Go. Related skills stay distinct. */
export function canonicalSkill(skill: string): string {
  const n = normalize(skill);
  return ALIAS_OF.get(n) ?? n;
}

/**
 * A job's skill list as scored: extra spaces collapsed and repeats dropped, compared by canonical skill, so
 * "Python; python ;  Python" and "Go; Golang" are one requirement each. The first spelling is kept for display.
 */
export function uniqueSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    const skill = raw.replace(/\s+/g, ' ').trim();
    const key = canonicalSkill(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** True when `term` appears in `text` starting at a word boundary ("sport" matches "Sports Media"). */
export function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(term))}`).test(normalize(text));
}

/** "linkedin.com/in/jane-doe/" and "https://www.LinkedIn.com/in/jane-doe" → "linkedin.com/in/jane-doe". */
export function normalizeLinkedinUrl(url: string): string {
  return normalize(url)
    .replace(/^https?:\/\//, '')
    // Any subdomain is the same profile: www., uk., m., mobile. … linkedin.com/in/<slug>.
    .replace(/^(?:[a-z0-9-]+\.)+(?=linkedin\.com\/)/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

export function isValidLinkedinUrl(url: string): boolean {
  return /^linkedin\.com\/in\/[a-z0-9\-_%.]+$/.test(normalizeLinkedinUrl(url));
}

export function normalizeEmail(email: string): string {
  return normalize(email);
}

export function joinOr(items: string[], empty: string): string {
  return items.length > 0 ? items.join('; ') : empty;
}
