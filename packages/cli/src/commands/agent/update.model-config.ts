/**
 * The model fields an `agent update` PATCH sends, and the one pairing it refuses.
 *
 * `customModelId` lives INSIDE modelConfig and has no top-level mirror,
 * so carrying it means sending the whole object — which REPLACES the
 * stored one. Filling the two model fields from defaults here would
 * silently reset the agent's model as a side effect of attaching an
 * endpoint, so the pair is required instead of guessed.
 */

/** The refusal `--custom-model-id` earns when it arrives without the pair. */
export const CUSTOM_MODEL_ID_NEEDS_PAIR_MESSAGE =
  "--custom-model-id must be sent together with --model-name and --model-provider.";

export const CUSTOM_MODEL_ID_NEEDS_PAIR_HINT =
  'A custom model is attached inside "modelConfig", and sending that object replaces ' +
  "the stored one — so this command needs the platform model to fall back to rather " +
  "than inventing one. Add both flags, or send the whole config yourself with " +
  `--body '{"modelConfig":{"modelName":"…","modelProvider":"…","customModelId":"…"}}'.`;

/** True when `--custom-model-id` arrived without the platform pair it needs. */
export function customModelIdNeedsThePair(opts: {
  modelName?: string;
  modelProvider?: string;
  customModelId?: string;
}): boolean {
  return (
    opts.customModelId !== undefined &&
    (opts.modelName === undefined || opts.modelProvider === undefined)
  );
}

/** ONE MODEL FLAG MERGES, BOTH REPLACE — one definition for the whole PATCH. */
export function agentUpdateModelFields(opts: {
  modelName?: string;
  modelProvider?: string;
  customModelId?: string;
}): Record<string, unknown> {
  if (opts.modelName !== undefined && opts.modelProvider !== undefined) {
    return {
      modelConfig: {
        modelName: opts.modelName,
        modelProvider: opts.modelProvider,
        ...(opts.customModelId !== undefined && { customModelId: opts.customModelId })
      }
    };
  }
  if (opts.modelName !== undefined) return { modelName: opts.modelName };
  if (opts.modelProvider !== undefined) return { modelProvider: opts.modelProvider };
  return {};
}
