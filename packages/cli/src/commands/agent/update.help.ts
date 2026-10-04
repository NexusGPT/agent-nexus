/** `nexus agent update` — the hand-written prose. */
export const AGENT_UPDATE_HELP = `
Examples:
  $ nexus agent update 11111111-1111-4111-8111-111111111111 --role "Senior Assistant"
  $ echo "You are helpful" | nexus agent update 11111111-1111-4111-8111-111111111111 --prompt -
  $ nexus agent update 11111111-1111-4111-8111-111111111111 --prompt ./prompt.md --no-publish
  $ nexus agent update 11111111-1111-4111-8111-111111111111 --model-name gpt-4o --model-provider OPEN_AI
  $ nexus agent update 11111111-1111-4111-8111-111111111111 --body '{"shortBio":"Handles refunds"}'

Notes:
  objective, tone, explanation and behaviour are REMOVED fields — sending any of
  them is a 400 DEPRECATED_FIELDS. Behavioural rules go in the prompt.
  --prompt PUBLISHES BY DEFAULT, SO THE EDIT IS LIVE THE MOMENT THIS RETURNS.
  There is no mutable prompt field: --prompt creates a CHECKPOINT version and
  makes it the production version, on every deployment the agent is wired to,
  with no confirmation step. Pass --no-publish to write the draft and leave the
  published version serving traffic — that is the safe way to stage an edit on a
  live agent. The verdict line says which of the two happened.
  --no-publish DOES NOTHING ON AN AGENT THAT NEVER PUBLISHED. Until a version is
  published, the DRAFT is what the agent serves, so writing the draft changes
  behaviour whatever this flag says. Check with "nexus version list <agent-id>":
  no row in the PROD column means the flag cannot protect you here.
  This command prints only the id, so confirm the write with
  "nexus agent get <id>" → .prompt. Over 1,000,000 characters is a 400.
  ON AN AGENT THAT ALREADY HAS A PROMPT, ONE --prompt WRITES TWO VERSION ROWS:
  an AUTO snapshot of the prompt it is about to overwrite, then the CHECKPOINT
  carrying the new text. "version list" therefore grows by two per write, not
  one. That AUTO row is the undo — it holds the prompt you just replaced, so
  rolling back means publishing IT, not the CHECKPOINT above it. The first
  --prompt on an agent that never had one writes a single row.
  ONE MODEL FLAG MERGES, BOTH REPLACE. --model-name or --model-provider alone is
  merged into the stored modelConfig, keeping temperature and thinking level;
  sending both replaces the whole config and DROPS those settings. To change the
  model and keep them, send --body '{"modelConfig":{...}}' carrying every field.
  A CUSTOM MODEL IS ATTACHED BY ID, NEVER BY --model-provider: the
  "CUSTOM_<PROTOCOL>" string "nexus model list" prints on the row is not one of
  that flag's values.
    $ nexus agent update 11111111-1111-4111-8111-111111111111 --custom-model-id <id> \\
        --model-name gpt-4o --model-provider OPEN_AI
  --custom-model-id needs both model flags because it travels inside modelConfig,
  and sending that object replaces the stored one — the pair is the fallback,
  not decoration. Sent alone the command refuses and sends nothing.
  CHANGING THE MODEL DETACHES A CUSTOM ONE. Any call that writes modelConfig
  without a customModelId clears the stored id, which is how an agent goes back
  to a platform model. Read it back with "nexus agent get <id>" →
  .modelConfig.customModelId.
  A PATCH whose only field is --prompt writes nothing on the agent row and still
  answers 200 — the version write is the change, not a no-op.
  dashboardUrl in the payload is this agent's page, added by this CLI rather
  than returned by the API — open it to see the edit you just made.
  Every field is optional, but the ones you do send must be non-empty:
  --first-name, --last-name and --role each still require at least one character.
  An unknown --body key is silently stripped, exactly as on create.
  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`;
