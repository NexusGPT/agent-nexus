/** `nexus agent create` — the hand-written prose. */
export const AGENT_CREATE_HELP = `
Examples:
  $ nexus agent create --first-name Ada --last-name Lovelace --role "Assistant"
  $ nexus agent create --first-name Bot --last-name Helper --role "Support" --model-name gpt-4o --model-provider OPEN_AI
  $ cat prompt.md | nexus agent create --first-name Ada --last-name Lovelace --role "Assistant" --prompt -
  $ nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'

Notes:
  --first-name, --last-name and --role are REQUIRED and must each carry at least
  one character; the API refuses an empty string. Nothing else is required.
  objective, tone, explanation and behaviour are REMOVED fields — sending any of
  them, as a flag or inside --body, is a 400 DEPRECATED_FIELDS. Behavioural rules
  go in the system prompt via --prompt.
  PASS BOTH MODEL FLAGS OR NEITHER. --model-name alone fills the provider with
  OPEN_AI and --model-provider alone fills the name with gpt-5.6-sol, so
  "--model-provider ANTHROPIC" stores an OpenAI model name under Anthropic and
  nothing reports it. Omitting both stores gpt-5.6-sol / OPEN_AI. Take the pair
  from "nexus model list" (modelId → --model-name, provider → --model-provider).
  THAT PAIR RULE DOES NOT APPLY TO YOUR OWN MODELS, AND FOLLOWING IT ON ONE IS A
  400. "nexus model list" also returns the endpoints you added with
  "nexus custom-model create", as source "custom", provider "CUSTOM_<PROTOCOL>"
  (CUSTOM_OPENAI, CUSTOM_ANTHROPIC or CUSTOM_GOOGLE) and modelId "custom:<uuid>".
  None of those is a member of --model-provider and none is going to become one
  — a custom model is selected BY ID:
    --custom-model-id <the id from "nexus custom-model list">
  Pass --model-name / --model-provider alongside it naming the PLATFORM model to
  fall back to; they stay required, and a stored config missing either is
  discarded whole at inference, taking the custom model with it. Omit them and
  the fallback is gpt-5.6-sol / OPEN_AI.
  An id that is not your organization's is a 404, never a 403.
  --prompt accepts a file path (auto-detected), literal text, or '-' for stdin.
  It publishes a CHECKPOINT version rather than writing a column; over 1,000,000
  characters is a 400. Omit it to start with no prompt at all.
  --body accepts JSON string, .json file, or '-' for stdin. Flags override --body
  fields. It also takes shortBio, bio, tags, gender, playgroundFirstMessage,
  model (the legacy enum) and modelConfig{modelName, modelProvider, thinkingLevel,
  thinkingDisplay, reasoningEffort, geminiThinkingLevel, kimiReasoningEffort,
  temperature, customModelId}.
  TAGS IS ONE STRING DESPITE THE PLURAL NAME. Sending an array is a 400 naming
  the field; put your own separator inside the string.
  AN UNKNOWN --body KEY IS SILENTLY STRIPPED, not refused. A typo returns 201
  having ignored the field, so check spelling against the list above.
  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.
  THE MODEL YOU PICK HERE DECIDES WHETHER SKILLS ARE AVAILABLE AT ALL.
  "nexus agent-skill" refuses with a 400 unless the agent's model supports the
  code interpreter, and that is settled by this command — so choose the model
  against what the agent will need to do, not after the 400 lands on a later
  command. Changing it afterwards is "nexus agent update --model-name".
  THIS DOES NOT ECHO THE AGENT. --json prints exactly
  {success, message, id, name, dashboardUrl} — and name is
  "<firstName> <lastName>" joined by this CLI, not a field the API returns.
  Nothing else you sent comes back, so read the stored agent with
  "nexus agent get <id>" before trusting a write.
  dashboardUrl IS ALSO THIS CLI'S, NOT THE API'S. It is the page for the agent
  you just made — open it, or hand it to whoever asked for the agent, instead
  of building a URL from a path pattern that can be renamed underneath you.`;
