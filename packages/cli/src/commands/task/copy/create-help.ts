/** Appended to `nexus task create`. */
export const TASK_CREATE_HELP = `
Every example carries --expected-input and --expected-output (or a "generation"
object). None of them is optional decoration — see the first note below.

Examples:
  $ cat task-prompt.md | nexus task create --name "Classify" --model-name gpt-4o \\
      --model-provider OPEN_AI --prompt - \\
      --expected-input "A support ticket" --expected-output "One of: bug, billing, other"
  $ nexus task create --name "Summarize" --model-name gpt-4o --model-provider OPEN_AI \\
      --prompt "Summarize the following:" \\
      --expected-input "An email body" --expected-output "Three bullet points"
  $ nexus task create --body '{"name":"Extract","modelName":"gpt-4o","modelProvider":"OPEN_AI","prompt":"Extract the city.","outputFormat":"json","generation":{"expectedInput":"An address","jsonOutputSchema":{"city":{"type":"string"}}}}'

Notes:
  "generation" IS REQUIRED AND CANNOT BE EMPTY. Omitting it is a 400, and with
  the default formats (both "text") it must carry expectedInput and
  expectedOutput too. The flags that populate it are --expected-input and
  --expected-output; a create with neither sends no "generation" at all and is
  refused. This is the most common first-time 400 on this command.

  --prompt TAKES LITERAL TEXT, DESPITE ITS <file-or--> LABEL. The value is used
  as written unless it is "-" (stdin) or the path of a file that EXISTS and is
  readable — then the file's contents are read and trimmed. So the second
  example above is not a shortcut, it is the ordinary form, and the same rule
  governs "nexus task update --prompt".
  ⚠️ THAT DETECTION IS WHY A ONE-WORD PROMPT IS A HAZARD. --prompt README.md
  from a directory holding that file sends the FILE, not the string, and nothing
  reports the substitution. Pass "-" and pipe, or a path you meant.

  THE PROMPT GOES AT THE BODY ROOT, or under "generation.prompt" — both are
  accepted and fold to the same field. What is NOT accepted: promptText,
  systemPrompt, instructions and text. Those are rejected with a 400 naming the
  right field, rather than being dropped.

  A BYTE-IDENTICAL PROMPT IS REFUSED WITH 409 DUPLICATE_TASK_PROMPT, and the
  error carries the id of the task that already has it. There are three ways on:

    IF ONLY THE MODEL DIFFERS, DO NOT CREATE A SECOND TASK. Run the existing one
    on the model you want, per call, and keep one prompt:
      $ nexus task execute <existing-id> --input ... \\
          --model-name claude-haiku-4-5 --model-provider ANTHROPIC
    A workflow node does the same with modelOverride on its aiTask node.

    TO FORK THE PROMPT DELIBERATELY, copy it rather than re-sending it:
      $ nexus task duplicate <existing-id> --name "..." \\
          --model-name claude-haiku-4-5 --model-provider ANTHROPIC
    A copy keeps every field you do not name — temperature included. Re-creating
    the variant HERE does not: an unsent field takes THIS command's default, and
    an unsent temperature is 0.7 whatever the original was set to.

    OR pass allowDuplicate to create a second task from this body anyway — there
    is no flag for it:
      --body '{"...":"...","allowDuplicate":true}'

  inputFormat ("text" | "json") and outputFormat ("text" | "json" | "template")
  are LOWERCASE and live at the body ROOT. Uppercase is rejected, not ignored.
  Each one makes a different "generation" field required:
    inputFormat  text -> expectedInput      json -> jsonInputSchema
    outputFormat text -> expectedOutput     json -> jsonOutputSchema
                                        template -> documentTemplateId

  A SCHEMA WITHOUT ITS FORMAT IS A 400, NOT A SILENT DROP. Sending
  jsonOutputSchema while outputFormat is still the default "text" is refused
  with a message naming the fix — set the format at the body root.

  The JSON schemas take EITHER a full JSON Schema document
  ({"type":"object","properties":{...}}) OR the bare field map
  ({"city":{"type":"string"}}); the bare form is wrapped at GENERATION time, not
  at write time, so "task get" reads the bare map back exactly as you sent it.
  An unchanged readback is the expected result, not a dropped wrap. What is
  refused, at save and again at execute, is a root that is not an object — a
  top-level array or scalar cannot be a structured output.

  On ANTHROPIC models the validation keywords — maxItems, maxLength, minimum,
  uniqueItems, minItems above 1 — are STRIPPED into the field's description and
  become advice the model may ignore. OpenAI enforces them mechanically. The
  same schema is therefore stricter on OpenAI than on Anthropic.

  multimodal (image, PDF, video input) belongs under "generation"; it is also
  accepted at the body root for compatibility. There is no flag:
    --body '{"...":"...","generation":{"multimodal":true,"...":"..."}}'

  FEW-SHOT EXAMPLES GO IN "fewShots", NOT IN THE PROMPT. Each pair is replayed
  as a user/assistant exchange ahead of the real input, so the prompt keeps the
  instructions and the demonstrations stay structured. --body only, and stored
  in the order given:
    --body '{"...":"...","fewShots":[{"input":"2 + 2","output":"4"}]}'
  Both halves are required and must be non-empty. "examples",
  "fewShotExamples", "samples" and "demonstrations" are NOT the field name and
  are refused with a 400 naming it, rather than dropped.

  A CUSTOM MODEL IS SELECTED BY --custom-model-id, NEVER BY --model-provider.
  "nexus model list" reports your own endpoints with provider "CUSTOM_<PROTOCOL>"
  and modelId "custom:<uuid>", and NEITHER of those strings is accepted here:
  --model-provider takes the four platform values only. Pass the row's own id
  from "nexus custom-model list" instead. An id belonging to another
  organization is a 404 on this call, not a 403.
  --model-name and --model-provider stay REQUIRED alongside it. They are the
  platform fallback, and a stored config missing either is discarded whole at
  inference — the custom model with it.
  AI TASKS RUN "openai"-PROTOCOL CUSTOM ENDPOINTS ONLY, AND THIS COMMAND SAYS SO
  RATHER THAN LETTING YOU FIND OUT AT EXECUTE. An anthropic- or google-protocol
  custom model is a 400 here, naming the protocol. Agents serve all three, so
  the same model attaches fine with "nexus agent create --custom-model-id".

  --type SETS WHAT ANSWERS THE TASK, ONCE. "generative" (the default) runs on a
  model that writes; "decision" runs on a decision model (jev-1.13.0, provider
  JEV) that answers typed questions. It cannot be changed later, a duplicate
  keeps it, and "task list" shows it as TYPE. A generative task on a decision
  model, or a decision task on a model that writes, is 400
  MODEL_CANNOT_ANSWER_TASK.
  A DECISION TASK NEEDS --body: outputFormat "json" and a schema of yes/no
  (boolean), pick-one (string enum, 2-255 options) and level (integer with
  minimum and maximum, 2-10 steps) fields, or objects that group them. Anything
  else is 400 MODEL_CANNOT_ANSWER_TASK, and its message names every field to change:
    $ nexus task create --type decision --name Triage --model-name jev-1.13.0 --model-provider JEV \\
        --prompt "Judge the ticket." --body '{"outputFormat":"json","generation":{"expectedInput":"A support ticket","jsonOutputSchema":{"urgent":{"type":"boolean","description":"Is the ticket urgent?"},"team":{"type":"string","enum":["billing","bug","other"]},"severity":{"type":"integer","minimum":1,"maximum":5}}}}'

  temperature defaults to 0.7 and is --body only. IT IS STORED AND NEVER READ
  BACK: "task get" returns no temperature field at any value, so a missing
  temperature is not a discarded write and there is no way to confirm one from
  this API.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--prompt -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.

  THE CREATE RESPONSE ECHOES NOTHING BACK BUT id AND name. It answers
  {"success":true,"message":"…","id":"…","name":"…","dashboardUrl":"…"} whatever
  you sent — and dashboardUrl is this CLI's own addition, not an echo — so
  nothing in it says the prompt landed, which format was stored, or whether a
  schema was kept.
  VERIFY WITH "nexus task get <id> --json" — that read carries prompt,
  inputFormat, outputFormat and both schemas, and it is the only confirmation
  this API offers. temperature is the exception: it is stored and never read
  back, so no read can confirm one.

  THE PROMPT IS OPTIONAL HERE AND REQUIRED AT EXECUTE. A create carrying
  "generation" but no prompt answers 201 and leaves a task that cannot run —
  "nexus task execute" then refuses it for a missing prompt. That is a
  legitimate draft state, not a broken create; fill it in with
  "nexus task update <id> --prompt <file>" before executing.`;
