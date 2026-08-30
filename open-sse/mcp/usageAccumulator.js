/**
 * Create a zeroed usage object in standard OpenAI shape.
 */
export function createZeroUsage() {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
}

/**
 * Accumulate usage from turn usage object into total usage object.
 * Normalizes input_tokens/output_tokens (Claude/Gemini) and prompt_tokens/completion_tokens (OpenAI).
 */
export function accumulateUsage(total, turnUsage) {
  if (!total || !turnUsage || typeof turnUsage !== "object") return total;

  const prompt = Number(turnUsage.prompt_tokens ?? turnUsage.input_tokens ?? turnUsage.promptTokenCount ?? 0);
  const completion = Number(turnUsage.completion_tokens ?? turnUsage.output_tokens ?? turnUsage.candidatesTokenCount ?? 0);
  const totalTokens = Number(turnUsage.total_tokens ?? turnUsage.totalTokenCount ?? (prompt + completion));

  total.prompt_tokens = (total.prompt_tokens || 0) + prompt;
  total.completion_tokens = (total.completion_tokens || 0) + completion;
  total.total_tokens = (total.total_tokens || 0) + (totalTokens || (prompt + completion));

  return total;
}
