/**
 * Tokens of a recorded usage, counted the same way everywhere (a run's `maxTokens`, budgets per
 * period, `getRunCost`): the input and output tokens a call reported, a missing one counting 0
 * (`promptTokens` and `completionTokens`, or a typed decision's `inputTokens` and
 * `outputTokens`); when it reported neither, its total alone (`totalTokens`), whose cost is
 * unknown. A cognitive thought's usage adds `totalOnlyTokens`, the totals of its calls that
 * reported nothing else. Counts nothing that is not a number.
 */
export function tokensOfUsage(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const {
    totalTokens,
    promptTokens,
    completionTokens,
    inputTokens,
    outputTokens,
    totalOnlyTokens,
  } = usage as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === 'number' ? value : 0);
  const split = [promptTokens, completionTokens, inputTokens, outputTokens].some(
    (value) => typeof value === 'number'
  );
  const counted = split
    ? count(promptTokens) + count(completionTokens) + count(inputTokens) + count(outputTokens)
    : count(totalTokens);
  return counted + count(totalOnlyTokens);
}
