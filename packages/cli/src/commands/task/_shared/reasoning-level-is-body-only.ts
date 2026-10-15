/**
 * Why `task create` and `task update` expose `reasoningLevel` through `--body`
 * and not through a flag.
 *
 * The values a model accepts depend on its thinking dialect, and the dialects'
 * vocabularies are disjoint — so a flag's static `--choices()` would offer every
 * word for every model while only a subset is valid for any one of them. The
 * server refuses a level the model does not offer, naming the ones it does.
 *
 * One reason for both verbs, so the two cannot drift apart. `task execute` keeps
 * its own: its level sits under `modelOverride` and is not inherited from the
 * task, which is a different thing to say.
 */
export const REASONING_LEVEL_IS_BODY_ONLY =
  "--body only. Valid values depend on the model's thinking dialect, which a flag's " +
  "--choices() cannot bound; read supportedReasoningLevels off 'nexus model list'";
