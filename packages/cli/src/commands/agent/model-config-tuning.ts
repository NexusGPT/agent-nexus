/**
 * The body-only declarations `agent create` and `agent update` share.
 *
 * The five TUNING enums under modelConfig have no flag and are declared
 * body-only rather than exposed. They are not interchangeable knobs: each one
 * belongs to ONE provider family (thinkingLevel and thinkingDisplay to
 * Anthropic, reasoningEffort to OpenAI-shaped models, geminiThinkingLevel to
 * Google, kimiReasoningEffort to Kimi), and most of them are silently ignored
 * for whatever provider you picked. Five flags whose validity depends on the
 * value of a sixth is a worse surface than one JSON object, and --body
 * already carries the whole modelConfig.
 */

const TUNING_IS_PROVIDER_SPECIFIC =
  "set it inside --body's modelConfig — the field only applies to one provider family, " +
  "so a flag would advertise it for every model";

/**
 * `reasoningLevel` needs its OWN reason, because the one above is false about it.
 *
 * It is not provider-specific — it is the single level field every provider reads.
 * What stops it being a flag is the shape of its vocabulary: the six dialects'
 * value sets are disjoint and not nested, so the enum is their sum and `--choices()`
 * would offer all ten to every model while only a subset is valid for any one of
 * them. A flag bounded per model is not expressible in a static descriptor.
 *
 * Read `supportedReasoningLevels` off `GET /models` for the set a model accepts.
 */
const LEVEL_VOCABULARY_IS_PER_MODEL =
  "set it inside --body's modelConfig — valid values depend on the model's thinking " +
  "dialect, so a flag's --choices() would offer every dialect's vocabulary for every model";

// `--model-provider` writes BOTH contract paths, so the flat mirror needs no
// flag of its own. The handler sends `modelConfig.modelProvider` when a name
// and a provider are both given, and the flat `modelProvider` when only the
// provider is — one option, two paths, and the server folds the flat pair
// into the same stored key either way.
//
// The flat field only entered this gate's population when it stopped being a
// bare `z.string()`: an enum-less field carries no `enumValues`, so it LEFT
// the population rather than failing it. A second `--model-provider-flat`
// would offer the identical four values under a name no caller wants.
const FLAT_MIRROR_IS_THE_SAME_FLAG =
  "written by --model-provider, which sets this flat mirror when only the " +
  "provider is given and modelConfig.modelProvider when the name is given too";

export const MODEL_CONFIG_TUNING = {
  "Body.modelConfig.reasoningLevel": LEVEL_VOCABULARY_IS_PER_MODEL,
  "Body.modelConfig.thinkingLevel": TUNING_IS_PROVIDER_SPECIFIC,
  "Body.modelConfig.thinkingDisplay": TUNING_IS_PROVIDER_SPECIFIC,
  "Body.modelConfig.reasoningEffort": TUNING_IS_PROVIDER_SPECIFIC,
  "Body.modelConfig.geminiThinkingLevel": TUNING_IS_PROVIDER_SPECIFIC,
  "Body.modelConfig.kimiReasoningEffort": TUNING_IS_PROVIDER_SPECIFIC,
  "Body.modelProvider": FLAT_MIRROR_IS_THE_SAME_FLAG
};
