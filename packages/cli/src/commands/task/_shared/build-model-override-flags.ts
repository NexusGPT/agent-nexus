/**
 * The `modelOverride` object for `task execute`, from its three model flags.
 *
 * Returns `undefined` when none of them was given, which is the ordinary case
 * and must send no `modelOverride` key at all — an empty object is a different
 * request, and the server refuses it for a missing `modelName`.
 *
 * 🚨 HALF A PAIR IS REFUSED HERE RATHER THAN SENT. `--model-name` alone would
 * reach the server as a 400 anyway, but the flag it names is the one thing about
 * this call that costs 15x, so the failure is worth stating in the terms the
 * operator typed. Completing the pair from the task's own provider is the one
 * thing this must never do: `claude-haiku-4-5` under a stored `OPEN_AI` would
 * address an OpenAI endpoint with an Anthropic model id.
 */
export function buildModelOverrideFlags(opts: {
  modelName?: string;
  modelProvider?: string;
  customModelId?: string;
}): Record<string, unknown> | undefined {
  if (!opts.modelName && !opts.modelProvider && !opts.customModelId) return undefined;

  if (!opts.modelName || !opts.modelProvider) {
    throw new Error(
      "--model-name and --model-provider must be given together to override the model for this " +
        "call. Omit both to run the task on its own model."
    );
  }

  return {
    modelName: opts.modelName,
    modelProvider: opts.modelProvider,
    ...(opts.customModelId !== undefined && { customModelId: opts.customModelId })
  };
}
