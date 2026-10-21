/**
 * Learning skill variants: which words are worth asking Claude about, what to ask, and how two answers become saved
 * variants. Pure, like the rest of pipeline/: the model call itself lives in cli/learn-skills.ts, and scoring only
 * ever reads the saved table (variants.ts).
 *
 * Words are compared with skill names, never people with jobs: the same word always gets the same answer, and each
 * word is asked about once, not once per person.
 */

import { evidenceRule } from './criteria';
import { policyFor } from './assess';
import { normalize } from './text';
import type { Dataset, Job } from './types';
import { configuredSkillNames, validateVariants, variantSkill, VARIANT_KINDS, type SkillVariant, type SkillVariantFile } from './variants';

/** Ask whether each word is one of these skill names written differently. */
export interface VariantQuestion {
  words: string[];
  skills: string[];
}

export interface VariantMatch {
  word: string;
  skill: string;
  kind: string;
}

/** Words per question: keeps each answer short. */
const WORDS_PER_QUESTION = 60;

/** Every name a job is scored on: its skills, their accepted aliases and related names, must-haves and core terms. */
export function jobSkillNames(job: Job): string[] {
  const { policy } = policyFor(job);
  const skills = [...job.requiredSkills, ...job.niceToHave, ...policy.essentials.flatMap((e) => e.anyOf)];
  const names = [
    ...skills.flatMap((s) => {
      const rule = evidenceRule(s);
      return [...rule.named, ...(rule.equivalent ?? []), ...(rule.inferred ?? [])];
    }),
    ...policy.coreDiscipline.terms,
  ];
  return unique(names);
}

function unique(names: string[]): string[] {
  return [...new Set(names.map(normalize).filter(Boolean))].sort();
}

/** A word is already understood when rules.ts or a learned variant gives it a meaning. */
function understood(word: string, configured: Set<string>): boolean {
  return configured.has(word) || variantSkill(word) !== undefined;
}

/**
 * The questions still open for these jobs: the pool's skill words against each job's skill names, and a job's own
 * unfamiliar skill words against the pool's (a new role asking for "K8s" when profiles say "Kubernetes"). A word
 * that already matches, is understood, or was already compared with every skill name in question is left out.
 */
export function planVariantQuestions(dataset: Dataset, jobs: readonly Job[], file: SkillVariantFile): VariantQuestion[] {
  const configured = configuredSkillNames();
  const pool = unique(dataset.candidates.flatMap((c) => c.profile?.skills ?? []));
  const pairs = new Map<string, Set<string>>();
  const ask = (words: string[], skills: string[]) => {
    for (const word of words) {
      if (understood(word, configured)) continue;
      const open = skills.filter((s) => s !== word && !(file.checked[word] ?? []).includes(s));
      if (open.length === 0) continue;
      const set = pairs.get(word) ?? new Set<string>();
      for (const s of open) set.add(s);
      pairs.set(word, set);
    }
  };
  for (const job of jobs) {
    const names = jobSkillNames(job);
    ask(pool.filter((w) => !names.includes(w)), names);
    const ownWords = unique([...job.requiredSkills, ...job.niceToHave]);
    ask(ownWords, pool.filter((w) => !ownWords.includes(w)));
  }
  // Group words that are compared with the same skill names, then split into short questions.
  const groups = new Map<string, VariantQuestion>();
  for (const [word, skills] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...skills].sort();
    const key = sorted.join('\n');
    const group = groups.get(key) ?? { words: [], skills: sorted };
    group.words.push(word);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((g) => {
    const out: VariantQuestion[] = [];
    for (let i = 0; i < g.words.length; i += WORDS_PER_QUESTION) out.push({ words: g.words.slice(i, i + WORDS_PER_QUESTION), skills: g.skills });
    return out;
  });
}

export const VARIANT_SYSTEM_PROMPT = `You match skill names from recruiting profiles and job descriptions.

You get a list of words and a list of skill names. For each word, say whether it is one of the skill names written differently. That means only:
- spelling: a different spelling, spacing, punctuation or letter case ("Pytorch" and "PyTorch", "Node JS" and "Node.js")
- plural: singular and plural ("Microservice" and "Microservices")
- abbreviation: an abbreviation or acronym of the other ("K8s" and "Kubernetes", "ML" and "Machine Learning")
- full_name: the full name of the other ("Amazon Web Services" and "AWS")

A recruiter will treat a match as the same skill, so a wrong match puts the wrong person on a shortlist. Never match a broader, narrower, related or adjacent skill: not a tool to its field, a library to the tool it builds on, a product to its platform, or a role to a skill. Not matches: "TensorFlow" and "PyTorch" (different tools), "ML Architecture" and "Machine Learning" (a narrower specialty), "PySpark" and "Spark" (a library on top of it), "SageMaker" and "AWS" (one product of a platform), "Data Science" and "Machine Learning" (overlapping fields).

Leave out every word that has no such match, and every word you are unsure about. Use the word and the skill name exactly as given.`;

/** The user message for one question. */
export function variantPrompt(q: VariantQuestion): string {
  return `Words:\n${JSON.stringify(q.words)}\n\nSkill names:\n${JSON.stringify(q.skills)}`;
}

/** The answer shape requested from the model. */
export const VARIANT_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          skill: { type: 'string' },
          kind: { type: 'string', enum: [...VARIANT_KINDS] },
        },
        required: ['word', 'skill', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const;

/** The matches in one answer that are about this question's words and skill names; anything else is ignored. */
export function readAnswer(q: VariantQuestion, answer: unknown): VariantMatch[] {
  const matches = (answer as { matches?: unknown } | null)?.matches;
  if (!Array.isArray(matches)) return [];
  return matches.flatMap((m): VariantMatch[] => {
    if (typeof m?.word !== 'string' || typeof m?.skill !== 'string' || typeof m?.kind !== 'string') return [];
    const word = normalize(m.word);
    const skill = normalize(m.skill);
    if (!q.words.includes(word) || !q.skills.includes(skill) || !(VARIANT_KINDS as readonly string[]).includes(m.kind)) return [];
    return [{ word, skill, kind: m.kind }];
  });
}

/** Only matches both answers give, same word to the same skill, are kept. */
export function agreedMatches(first: VariantMatch[], second: VariantMatch[]): VariantMatch[] {
  return first.filter((a) => second.some((b) => b.word === a.word && b.skill === a.skill));
}

/**
 * The saved file with these answers added: agreed matches become variants, except those the loader would drop (see
 * validateVariants), and every word asked is recorded as compared with its skill names, match or not.
 */
export function mergeVariants(
  file: SkillVariantFile,
  answered: { question: VariantQuestion; matches: VariantMatch[] }[],
  source: { model: string; date: string },
): { file: SkillVariantFile; added: SkillVariant[]; dropped: string[] } {
  const checked: Record<string, string[]> = { ...file.checked };
  const learned: SkillVariant[] = [];
  for (const { question, matches } of answered) {
    for (const word of question.words) checked[word] = [...new Set([...(checked[word] ?? []), ...question.skills])].sort();
    for (const m of matches) {
      if (learned.some((v) => v.variant === m.word)) continue;
      learned.push({ variant: m.word, skill: m.skill, kind: m.kind as SkillVariant['kind'], model: source.model, added: source.date });
    }
  }
  const { table } = validateVariants([...file.variants, ...learned]);
  const isNew = (v: SkillVariant) => !file.variants.some((o) => normalize(o.variant) === v.variant);
  const added = learned.filter((v) => isNew(v) && table.get(v.variant) === v.skill);
  const variants = [...file.variants, ...added].sort((a, b) => a.variant.localeCompare(b.variant));
  const sortedChecked = Object.fromEntries(Object.entries(checked).sort(([a], [b]) => a.localeCompare(b)));
  return {
    file: { ...file, variants, checked: sortedChecked },
    added,
    dropped: learned.filter((v) => !added.includes(v)).map((v) => `"${v.variant}" → "${v.skill}"`),
  };
}
