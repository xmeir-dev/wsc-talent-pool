/**
 * Work-history parsing and the "possible reference" check: a WSC employee and a candidate
 * who worked at the same employer in overlapping years. Never scored.
 */

import { EARLY_CAREER_PATTERNS, EMPLOYER_NOISE_WORDS, GENERIC_EMPLOYERS } from './rules';
import { normalize, splitList } from './text';
import type { Candidate, Employee, EmploymentSpell, Period, PossibleReference } from './types';

const YEAR_RANGE = /(\d{4})\s*[-–]\s*(\d{4}|present|now|current)/gi;
const REJOINED = /rejoined\s+(\d{4})/gi;

export function parsePeriods(text: string): Period[] {
  const periods: Period[] = [];
  for (const m of text.matchAll(YEAR_RANGE)) {
    const start = Number(m[1]);
    const end = /^\d{4}$/.test(m[2]!) ? Number(m[2]) : Infinity;
    periods.push({ start, end });
  }
  for (const m of text.matchAll(REJOINED)) periods.push({ start: Number(m[1]), end: Infinity });
  return periods;
}

/**
 * Parse one history entry.
 * - `role` entries look like "ML Engineer at Opta Sports (2019-2022)".
 * - `employer` entries look like "Mobileye (2018-2021)".
 */
export function parseSpell(raw: string, kind: 'role' | 'employer'): EmploymentSpell {
  const text = raw.trim();
  const periods = parsePeriods(text);
  const label = text.replace(/\(.*?\)/g, '').trim();
  let title = '';
  let company = '';
  if (kind === 'employer') {
    company = label;
  } else {
    const at = label.toLowerCase().lastIndexOf(' at ');
    if (at >= 0) {
      title = label.slice(0, at).trim();
      company = label.slice(at + 4).trim();
    } else {
      title = label;
    }
  }
  const isEarlyCareer = EARLY_CAREER_PATTERNS.some((p) => p.test(title || label));
  return { raw: text, title, company, periods, isEarlyCareer };
}

export function parseHistory(cell: string | undefined, kind: 'role' | 'employer'): EmploymentSpell[] {
  return splitList(cell).map((entry) => parseSpell(entry, kind));
}

function employerTokens(name: string): string[] {
  return normalize(name)
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 0 && !EMPLOYER_NOISE_WORDS.has(t));
}

/** "Stats Perform / Opta" is two names for one employer. */
function employerAliases(name: string): string[][] {
  return name
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !GENERIC_EMPLOYERS.has(normalize(part)))
    .map(employerTokens)
    .filter((tokens) => tokens.length > 0);
}

/** Same employer when one name's words are all contained in the other's ("Akamai" ~ "Akamai Technologies"). */
export function sameEmployer(a: string, b: string): boolean {
  for (const ta of employerAliases(a)) {
    for (const tb of employerAliases(b)) {
      const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
      if (small.every((t) => large.includes(t))) return true;
    }
  }
  return false;
}

function overlap(a: Period, b: Period): Period | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start <= end ? { start, end } : null;
}

/**
 * Employees who worked at one of the candidate's past employers in overlapping years.
 * Uses dated entries only (past_titles); undated past_companies cannot show overlap.
 */
export function findPossibleReferences(candidate: Candidate, employees: Iterable<Employee>): PossibleReference[] {
  const profile = candidate.profile;
  if (!profile) return [];
  const listed = new Set(profile.connectionIds);
  const roster = [...employees];
  const found = new Map<string, PossibleReference>();
  for (const role of profile.pastRoles) {
    if (!role.company) continue;
    for (const employee of roster) {
      for (const job of employee.workHistory) {
        if (!sameEmployer(role.company, job.company)) continue;
        for (const p of role.periods) {
          for (const q of job.periods) {
            const o = overlap(p, q);
            if (!o) continue;
            const key = `${employee.employeeId}|${role.company}`;
            if (!found.has(key)) {
              found.set(key, {
                employeeId: employee.employeeId,
                employeeName: employee.fullName,
                company: role.company,
                overlapStart: o.start,
                overlapEnd: o.end,
                alsoListedConnection: listed.has(employee.employeeId),
              });
            }
          }
        }
      }
    }
  }
  return [...found.values()].sort(
    (x, y) => x.employeeId.localeCompare(y.employeeId) || x.company.localeCompare(y.company),
  );
}

export function formatYears(p: Period): string {
  const end = p.end === Infinity ? 'present' : String(p.end);
  return p.start === p.end ? String(p.start) : `${p.start}-${end}`;
}
