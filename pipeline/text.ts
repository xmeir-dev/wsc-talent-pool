/** Small text helpers shared by the assessment modules. */

import { SKILL_EVIDENCE, SKILL_SYNONYMS } from './rules';

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

/**
 * A configured table's own entry for a key from source or typed text, never an inherited property: "constructor",
 * "__proto__" or "toString" are unknown text, like any other name that is not configured.
 */
export function ownEntry<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * The skill a job skill name is scored as: a configured spelling variant ("golang", "rest api", see SKILL_SYNONYMS)
 * is its skill, so either spelling, in any order, scores the same. Any other name is itself: a narrower tool listed
 * under a broad skill ("SageMaker" under AWS) matches only its own name when a job requires it.
 */
export function canonicalSkill(skill: string): string {
  const n = normalize(skill);
  return ownEntry(SKILL_SYNONYMS, n) ?? n;
}

/**
 * A name that is not a configured skill but counts as one ("opencv" counts as Computer Vision) → the first
 * configured skill, in rules order, that lists it as on profile ("football analytics" → Sports Analytics).
 * Requiring both adds nothing: the narrower name folds into the skill.
 */
const FOLDS_INTO = (() => {
  const map = new Map<string, string>();
  for (const [key, rule] of Object.entries(SKILL_EVIDENCE)) {
    for (const term of rule.named) {
      if (Object.hasOwn(SKILL_EVIDENCE, term) || Object.hasOwn(SKILL_SYNONYMS, term) || map.has(term)) continue;
      map.set(term, key);
    }
  }
  return map;
})();

/**
 * A job's skill list as scored. Extra spaces are collapsed and the list counts each skill once, whatever the order:
 * - repeats and spelling variants are one requirement ("Python; python ; Python", "Go; Golang", "Golang; Go"); the
 *   first spelling is kept for display only, since scoring looks the skill up by canonicalSkill();
 * - a narrower name is dropped when the skill it counts as is also required ("Computer Vision; OpenCV" and
 *   "OpenCV; Computer Vision" are Computer Vision). Without that skill it stays, matching its own name only.
 */
export function uniqueSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const kept: { skill: string; key: string }[] = [];
  for (const raw of skills) {
    const skill = raw.replace(/\s+/g, ' ').trim();
    const key = canonicalSkill(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push({ skill, key });
  }
  return kept.filter(({ key }) => !seen.has(FOLDS_INTO.get(key) ?? '')).map(({ skill }) => skill);
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
  const bare = normalize(url)
    .replace(/^https?:\/\//, '')
    // Any subdomain is the same profile: www., uk., m., mobile. … linkedin.com/in/<slug>.
    .replace(/^(?:[a-z0-9-]+\.)+(?=linkedin\.com\/)/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  // A profile link is linkedin.com/in/<slug>: anything after the slug (/en, /details/experience) is a page of
  // that same profile, and a percent-encoded slug (%2D) is the same slug.
  const profile = /^linkedin\.com\/in\/([^/]+)/.exec(bare);
  if (!profile) return bare;
  let slug = profile[1]!;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Not valid percent-encoding: keep it as written (it will not pass isValidLinkedinUrl if it is broken).
  }
  return `linkedin.com/in/${normalize(slug)}`;
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
