/**
 * Tokens of a recorded usage, as a run's `maxTokens` counts them: the total a model call
 * reported, else its prompt and completion tokens, or a typed decision's input and output
 * tokens. Counts nothing that is not a number.
 */
export function tokensOfUsage(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const { totalTokens, promptTokens, completionTokens, inputTokens, outputTokens } =
    usage as Record<string, unknown>;
  if (typeof totalTokens === 'number') return totalTokens;
  const count = (value: unknown) => (typeof value === 'number' ? value : 0);
  return count(promptTokens) + count(completionTokens) + count(inputTokens) + count(outputTokens);
}
