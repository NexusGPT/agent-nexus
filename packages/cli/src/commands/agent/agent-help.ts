/** `nexus agent` — the namespace epilogue. */
export const AGENT_HELP = `
Every <id> argument is the agent UUID reported by "nexus agent list".

Three facts that decide whether a write does what you meant:
  • objective, tone, explanation and behaviour are REMOVED fields. Sending any
    of them — as a flag or inside --body — is a 400 DEPRECATED_FIELDS. Every
    behavioural rule now belongs in the system prompt, set with --prompt.
  • THE PROMPT IS NOT A COLUMN, AND --prompt PUBLISHES. It creates a CHECKPOINT
    version and makes it live on every deployment — on update too, every time,
    not only the first. "agent update --no-publish" writes the draft instead.
    Read the prompt back with "nexus agent get", at top-level .prompt.
  • model READS "DEFAULT", NOT null, ON AN AGENT THAT WAS NEVER GIVEN ONE, so a
    "model === null" test never fires. It is the legacy enum, and the model
    actually used is modelConfig.modelName, which create defaults to
    gpt-5.6-sol / OPEN_AI.`;
