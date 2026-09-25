import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { LLMProvider } from '../providers/llm-provider.js';
import { stableJson } from '../utils/stable-json.js';
import { guidingQuestion } from './study-labels.js';
import type { StudyCharter, StudyConfig, StudyLimits } from './study-types.js';

export const DEFAULT_STUDY_LIMITS: Readonly<StudyLimits> = Object.freeze({
  maxModelCalls: 60,
  maxSearches: 20,
  maxLoops: 1,
  timeoutMs: 20 * 60_000,
  maxResultsPerSearch: 5,
});

/** Share of a passage's items that may be rejected before the passage is redone. */
export const DEFAULT_DRIFT_THRESHOLD = 1 / 3;

/** The longest delay a Node.js timer holds; longer ones would fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const text = z.string().trim().min(1, 'must be a non-empty string');

const limitsSchema = z
  .object({
    maxModelCalls: z.number().int().min(1).max(10_000),
    maxSearches: z.number().int().min(0).max(10_000),
    maxLoops: z.number().int().min(0).max(10),
    timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS),
    maxResultsPerSearch: z.number().int().min(1).max(50),
  })
  .strict();

const configSchema = z.object({
  name: text,
  object: text,
  objective: text,
  question: text.optional(),
  needs: z.array(text).default([]),
  leads: z.array(text).default([]),
  scope: z.object({ exclude: z.array(text).default([]) }).default({}),
  sources: z.array(text).default([]),
  model: z.string().default(''),
  language: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/, 'must be a language tag such as "en" or "fr"')
    .default('en'),
  driftThreshold: z.number().min(0).max(1).default(DEFAULT_DRIFT_THRESHOLD),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

/** A study's configuration once checked: the frozen charter and the settings of its runs. */
export interface StudySettings {
  name: string;
  charter: StudyCharter;
  charterHash: string;
  sources: string[];
  model: string;
  language: string;
  limits: StudyLimits;
  driftThreshold: number;
  temperature: number;
  maxTokens?: number;
  llmProvider?: LLMProvider;
}

/** Checks a study's configuration and freezes its charter. Throws a `ValidationError`. */
export function studySettings(config: StudyConfig): StudySettings {
  if (typeof config !== 'object' || config === null) {
    throw new ValidationError('config', 'must be an object');
  }
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) throw validationError(parsed.error, '');
  const limits = limitsSchema.safeParse({
    ...DEFAULT_STUDY_LIMITS,
    ...definedFields(config.limits),
  });
  if (!limits.success) throw validationError(limits.error, 'limits.');
  const provider = config.llmProvider;
  if (provider !== undefined && typeof provider?.generateCompletion !== 'function') {
    throw new ValidationError('llmProvider', 'must be an LLM provider');
  }
  const settings = parsed.data;
  const charter = freezeCharter({
    object: settings.object,
    question: settings.question ?? guidingQuestion(settings.language),
    objective: settings.objective,
    needs: distinct(settings.needs),
    leads: distinct(settings.leads),
    scope: { exclude: distinct(settings.scope.exclude) },
  });
  return {
    name: settings.name,
    charter,
    charterHash: charterHash(charter),
    sources: distinct(settings.sources),
    model: settings.model,
    language: settings.language,
    limits: limits.data,
    driftThreshold: settings.driftThreshold,
    temperature: settings.temperature ?? 0.4,
    ...(settings.maxTokens !== undefined ? { maxTokens: settings.maxTokens } : {}),
    ...(provider ? { llmProvider: provider } : {}),
  };
}

/** SHA-256 of the charter, written with sorted keys so that equal charters hash equally. */
export function charterHash(charter: StudyCharter): string {
  return createHash('sha256').update(stableJson(charter)).digest('hex');
}

/** The charter and everything in it, frozen: it cannot be changed once the study exists. */
function freezeCharter(charter: StudyCharter): StudyCharter {
  Object.freeze(charter.needs);
  Object.freeze(charter.leads);
  Object.freeze(charter.scope.exclude);
  Object.freeze(charter.scope);
  return Object.freeze(charter);
}

/** The fields given a value: a limit left `undefined` keeps its default. */
function definedFields(record: object | undefined): Record<string, unknown> {
  if (typeof record !== 'object' || record === null) return {};
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

/** The values in their first order, without repeats that differ only by case. */
function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validationError(error: z.ZodError, prefix: string): ValidationError {
  const issue = error.issues[0];
  return new ValidationError(
    `${prefix}${issue?.path.join('.') ?? ''}`,
    issue?.message ?? 'invalid value'
  );
}
