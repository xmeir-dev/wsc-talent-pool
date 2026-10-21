/**
 * The one place that calls Claude: asks whether unfamiliar skill words are known skills written differently, and
 * saves agreed answers to data/skill-variants.json. Runs only with --learn-skills, which needs Anthropic credentials
 * (ANTHROPIC_API_KEY or an `ant auth login` profile); without the flag the pipeline reads the saved file and makes no
 * network call.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  agreedMatches,
  mergeVariants,
  planVariantQuestions,
  readAnswer,
  VARIANT_ANSWER_SCHEMA,
  VARIANT_SYSTEM_PROMPT,
  variantPrompt,
  type VariantMatch,
  type VariantQuestion,
} from '../pipeline/learn-variants';
import { useSkillVariants, type SkillVariant, type SkillVariantFile } from '../pipeline/variants';
import type { Dataset, Job } from '../pipeline';

export const VARIANT_MODEL = 'claude-opus-5-5';

/** One answer to one question; injectable so tests run without a model. */
export type AskVariants = (q: VariantQuestion) => Promise<unknown>;

export function claudeAsker(client = new Anthropic()): AskVariants {
  return async (q) => {
    const response = await client.beta.messages.create({
      model: VARIANT_MODEL,
      max_tokens: 16000,
      // Matching names is a simple task; low effort keeps it quick and cheap.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: VARIANT_ANSWER_SCHEMA } },
      // On a policy decline, the API retries on a fallback model instead of returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: VARIANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: variantPrompt(q) }],
    });
    // A refusal or a cut-off answer is no answer: that question simply learns nothing this run.
    if (response.stop_reason !== 'end_turn') return null;
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
}

/**
 * Asks every open question twice, keeps the matches both answers agree on, saves the file and switches scoring to
 * it. A question whose call fails or gets no usable answer records nothing and is asked again next run. Returns what
 * was learned, how many words got an answer, what the loader refused and the failed calls.
 */
export async function learnSkillVariants(
  dataset: Dataset,
  jobs: readonly Job[],
  path: string,
  ask: AskVariants,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ questions: number; checked: number; added: SkillVariant[]; dropped: string[]; failures: string[] }> {
  const file = JSON.parse(readFileSync(path, 'utf8')) as SkillVariantFile;
  file.checked ??= {};
  file.variants ??= [];
  const questions = planVariantQuestions(dataset, jobs, file);
  const answered: { question: VariantQuestion; matches: VariantMatch[] }[] = [];
  const failures: string[] = [];
  const tryAsk = async (q: VariantQuestion) => {
    try {
      return await ask(q);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
      return null;
    }
  };
  for (const question of questions) {
    const [first, second] = await Promise.all([tryAsk(question), tryAsk(question)]);
    // Without two answers nothing is recorded, so the question is asked again next run.
    if (first === null || second === null) continue;
    answered.push({ question, matches: agreedMatches(readAnswer(question, first), readAnswer(question, second)) });
  }
  const merged = mergeVariants(file, answered, { model: VARIANT_MODEL, date: today });
  if (answered.length > 0) writeFileSync(path, `${JSON.stringify(merged.file, null, 2)}\n`, 'utf8');
  useSkillVariants(merged.file);
  return {
    questions: questions.length,
    checked: answered.reduce((n, a) => n + a.question.words.length, 0),
    added: merged.added,
    dropped: merged.dropped,
    failures,
  };
}
