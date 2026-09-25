/**
 * A token count a usage reported: a finite number, 0 or more. Anything else (`null`, `NaN`, a
 * negative number, a string) is no count, as if the field were missing.
 */
export function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The tokens of one model call, as they are counted everywhere (see `tokensOfCall`). */
export interface CallTokens {
  /** It reported both its input and its output tokens: its cost is known. */
  metered: boolean;
  inputTokens: number;
  outputTokens: number;
  /** Tokens of a call whose cost is unknown. */
  unmeteredTokens: number;
}

/**
 * How one model call's usage is counted everywhere (a run's `maxTokens`, budgets per period,
 * `getRunCost`). A call that reported both its input and its output tokens (`promptTokens` and
 * `completionTokens`, or a typed decision's `inputTokens` and `outputTokens`) is metered: these
 * are its tokens, whatever total it also gave, and they give its cost. Any other call (no
 * usage, a total alone, one side only) has an unknown cost, and its tokens are the largest of
 * the total and the sides it reported: never fewer than it said it used.
 */
export function tokensOfCall(usage: unknown): CallTokens {
  const fields = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  const input = tokenCount(fields.promptTokens) ?? tokenCount(fields.inputTokens);
  const output = tokenCount(fields.completionTokens) ?? tokenCount(fields.outputTokens);
  if (input !== undefined && output !== undefined) {
    return { metered: true, inputTokens: input, outputTokens: output, unmeteredTokens: 0 };
  }
  const reported = (input ?? 0) + (output ?? 0);
  return {
    metered: false,
    inputTokens: 0,
    outputTokens: 0,
    unmeteredTokens: Math.max(tokenCount(fields.totalTokens) ?? 0, reported),
  };
}

/**
 * Tokens of a recorded usage (see `tokensOfCall`). A cognitive thought's usage, which adds up
 * several calls, adds `unmeteredTokens`, the tokens of its calls whose cost is unknown.
 */
export function tokensOfUsage(usage: unknown): number {
  const call = tokensOfCall(usage);
  const fields = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  return (
    call.inputTokens +
    call.outputTokens +
    call.unmeteredTokens +
    (tokenCount(fields.unmeteredTokens) ?? 0)
  );
}
