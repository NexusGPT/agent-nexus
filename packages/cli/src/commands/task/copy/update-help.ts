/** Appended to `nexus task update`. */
export const TASK_UPDATE_HELP = `
Examples:
  $ nexus task update 11111111-1111-4111-8111-111111111111 --prompt "Summarize the following email:"
  $ cat task-prompt.md | nexus task update 11111111-1111-4111-8111-111111111111 --prompt -
  $ nexus task update 11111111-1111-4111-8111-111111111111 --body '{"prompt":"New prompt text"}'
  $ nexus task update 11111111-1111-4111-8111-111111111111 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus task update 11111111-1111-4111-8111-111111111111 --body '{"outputFormat":"json","jsonOutputSchema":{"city":{"type":"string"}}}'

Notes:
  SEND outputFormat LOWERCASE, AT THE BODY ROOT. "task get" returns "JSON";
  echoing that value back here is a 400. The accepted values are "text", "json"
  and "template" for outputFormat, "text" and "json" for inputFormat.

  Unlike create, "generation" is OPTIONAL here and its sub-fields are accepted
  at the body ROOT as well — jsonOutputSchema, expectedInput, multimodal and the
  rest are folded in for you. When you send both, the nested value wins.

  A PATCH ONLY TOUCHES WHAT IT NAMES. Omitting "generation" leaves the whole
  generation config alone; it does not reset it. An explicit null on
  jsonInputSchema or jsonOutputSchema is the one way to clear a field.

  "fewShots" REPLACES THE WHOLE SET, IT DOES NOT APPEND. The array you send is
  the array the task ends up with, and [] removes every example. Omitting the
  key leaves them alone, like everything else here. --body only:
    --body '{"fewShots":[{"input":"2 + 2","output":"4"}]}'
  A fewShots-only PATCH counts as a change and writes a version — but the
  version snapshot covers the task's own fields, NOT its examples, so restoring
  it puts the prompt back and leaves the examples as this call left them.

  CHANGING outputFormat DOES NOT CHANGE THE SCHEMA — send the matching schema in
  the same call, or the task keeps the one it had. Naming a NON-json format and
  a schema together in one body is refused with a 400, because that combination
  could never take effect. A schema on its own is always persisted.

  CHANGING --model-provider DISCARDS THE PROVIDER-SPECIFIC MODEL SETTINGS —
  thinking level, thinking display and reasoning effort are stripped, because
  they mean nothing to the new provider. Nothing in the response says so.

  --custom-model-id ATTACHES A CUSTOM ENDPOINT; CHANGING THE MODEL WITHOUT IT
  DETACHES ONE. A PATCH carrying --model-name or --model-provider and no
  --custom-model-id clears the stored id, so "put this task back on a platform
  model" is exactly that call. A PATCH that touches neither leaves the
  attachment alone. Read it back with "nexus task get <id>" → .customModelId.
  An id belonging to another organization is a 404 here, not a 403, and an
  anthropic- or google-protocol endpoint is a 400 naming the protocol — this
  surface serves "openai" only and refuses at the write rather than at execute.

  A TASK'S TYPE NEVER CHANGES, AND EVERY PATCH IS JUDGED AGAINST IT on the
  stored task with this patch applied. A generative task cannot move onto a
  decision model (jev-1.13.0), and a decision task cannot move onto a model
  that writes or take a free-text schema: each is 400 MODEL_CANNOT_ANSWER_TASK.
  To turn a generative task into a decision one, create a new task with
  "task create --type decision". A decision task's schema change that stays
  answerable is accepted:
    --body '{"jsonOutputSchema":{"urgent":{"type":"boolean","description":"Is the ticket urgent?"}}}'

  EVERY ACCEPTED UPDATE CREATES A VERSION, INCLUDING ONE THAT CHANGES NOTHING.
  The check is whether the body named a recognized field, never whether the
  value differs, so re-sending a byte-identical prompt writes a fresh version
  with a new versionId. A null versionId therefore does NOT mean "your edit
  matched what was stored" — it means the body carried no field this route
  recognizes, and nothing at all was written. Never use it as a no-op detector.

  The duplicate-prompt check does NOT apply to update: two tasks can end up with
  identical prompts by editing one into the other.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`;
