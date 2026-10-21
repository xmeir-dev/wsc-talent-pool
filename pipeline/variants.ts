/**
 * Skill variants: other ways of writing a skill name ("K8s" for Kubernetes, "Amazon Web Services" for AWS), proposed
 * by Claude (cli/learn-skills.ts) and saved in data/skill-variants.json. This module only reads the saved table:
 * scoring never calls a model, so the same profile always gets the same result.
 *
 * A variant is the same skill under another name and counts exactly like it. Nothing broader, narrower or related
 * belongs here; those stay hand-written in rules.ts, and hand-written rules always win: a name already configured
 * there (an alias, a related or inferred skill) is never reassigned, so "TensorFlow" can never become PyTorch.
 */

import saved from '../data/skill-variants.json';
import { SKILL_EVIDENCE, SKILL_SYNONYMS } from './rules';

export const VARIANT_KINDS = ['spelling', 'plural', 'abbreviation', 'full_name'] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];

export interface SkillVariant {
  /** The other way of writing it, as found on a profile or a job. */
  variant: string;
  /** The skill name it stands for. */
  skill: string;
  kind: VariantKind;
  /** Which model proposed it and when, for review. */
  model: string;
  added: string;
}

export interface SkillVariantFile {
  note?: string;
  variants: SkillVariant[];
  /** Word → the skill names it was already compared with, so the same question is never asked twice. */
  checked: Record<string, string[]>;
}

/** Same as text.normalize(); repeated because text.ts imports this module. */
const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Every name rules.ts already gives a meaning: these are never learned or reassigned. */
export function configuredSkillNames(): Set<string> {
  const names = new Set<string>(Object.keys(SKILL_SYNONYMS));
  for (const [key, rule] of Object.entries(SKILL_EVIDENCE)) {
    for (const name of [key, ...rule.named, ...(rule.equivalent ?? []), ...(rule.inferred ?? [])]) names.add(name);
  }
  return names;
}

/**
 * The usable variants, normalized variant → skill, and why each other entry was dropped. Dropped: an unknown kind,
 * a variant equal to its skill, a name rules.ts already configures, a chain (a skill that is itself a variant) and a
 * variant given two different skills.
 */
export function validateVariants(entries: readonly SkillVariant[]): { table: Map<string, string>; problems: string[] } {
  const configured = configuredSkillNames();
  const problems: string[] = [];
  const candidates = new Map<string, string>();
  const conflicting = new Set<string>();
  for (const e of entries) {
    const variant = norm(String(e?.variant ?? ''));
    const skill = norm(String(e?.skill ?? ''));
    const label = `"${e?.variant}" → "${e?.skill}"`;
    if (!variant || !skill) problems.push(`${label}: empty name`);
    else if (!(VARIANT_KINDS as readonly string[]).includes(e.kind)) problems.push(`${label}: unknown kind "${e.kind}"`);
    else if (variant === skill) problems.push(`${label}: the same name`);
    else if (configured.has(variant)) problems.push(`${label}: "${e.variant}" already has a rule in rules.ts`);
    else if (candidates.has(variant) && candidates.get(variant) !== skill) conflicting.add(variant);
    else candidates.set(variant, skill);
  }
  for (const variant of conflicting) {
    problems.push(`"${variant}": given more than one skill`);
    candidates.delete(variant);
  }
  for (const [variant, skill] of candidates) {
    if (candidates.has(skill)) {
      problems.push(`"${variant}" → "${skill}": "${skill}" is itself a variant`);
      candidates.delete(variant);
    }
  }
  return { table: candidates, problems };
}

let active = new Map<string, string>();
let activeProblems: string[] = [];

/** Score with this table from now on (the saved file at start-up; the CLI swaps in what it just learned). */
export function useSkillVariants(file: Pick<SkillVariantFile, 'variants'>): void {
  const { table, problems } = validateVariants(file.variants ?? []);
  active = table;
  activeProblems = problems;
}

/** Entries of the active file that were dropped, for the CLI to report. */
export function skillVariantProblems(): string[] {
  return [...activeProblems];
}

/** The skill a name stands for, when it is a learned variant. */
export function variantSkill(name: string): string | undefined {
  return active.get(norm(name));
}

useSkillVariants(saved as unknown as SkillVariantFile);
