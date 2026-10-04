import { EXECUTE_DEFAULT_TIMEOUT_SECONDS } from "../_shared/execute-default-timeout";

/**
 * Appended to `nexus task execute`.
 *
 * Interpolates {@link EXECUTE_DEFAULT_TIMEOUT_SECONDS} so the number in `--help`
 * and the deadline the command actually uses cannot drift apart.
 */
export const TASK_EXECUTE_HELP = `
Examples:
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "Summarize this email..."
  $ cat document.txt | nexus task execute 11111111-1111-4111-8111-111111111111 --input -
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "Hello world" --json
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --body '{"input":"Hello world"}'
  $ nexus task execute 11111111-1111-4111-8111-111111111111 --input "..." \\
      --model-name claude-haiku-4-5 --model-provider ANTHROPIC

Notes:
  --model-name/--model-provider RUN THIS ONE CALL ELSEWHERE AND CHANGE NOTHING.
  The task keeps its own model, its versions are untouched, and every other
  caller of it is unaffected — so one prompt can be swept in bulk on a cheap
  model and run on the frontier model when a human asks for it, instead of being
  copied into two tasks that then drift apart. Both flags are required together;
  one without the other is refused before any request is sent.

    temperature IS ALWAYS THE TASK'S, and is not overridable here. It is part of
    the reasoning rather than the routing, so a "same task, cheaper model" run
    that silently moved it would not be the same task.

    A CUSTOM MODEL IS NOT INHERITED BY AN OVERRIDE. If the task runs on a BYOM
    endpoint and you name a platform model here, the platform model runs; pass
    --custom-model-id to point this call at a custom endpoint instead.

    THE PROVIDER TUNING IS NOT INHERITED BY AN OVERRIDE — not even on the same
    provider. thinkingLevel, thinkingDisplay, reasoningEffort, geminiThinkingLevel
    and kimiReasoningEffort have no flag; name the one you want under --body, or
    the call runs with none:
      --body '{"input":"...","modelOverride":{"modelName":"gpt-5","modelProvider":"OPEN_AI","reasoningEffort":"low"}}'
    Same rule as "task update", because it is the same code — these knobs are
    specific to a provider AND to a model generation, so carrying one across a
    model change is not the safe default it looks like.

  --input accepts literal text, a file path (auto-detected), or '-' for stdin.
  In non-JSON mode, only the output text is printed (not the full response object).
  Long generations are given ${EXECUTE_DEFAULT_TIMEOUT_SECONDS}s by default; override with the global --timeout <seconds>.

  "Prompt is required" HERE MEANS THE TASK WAS CREATED WITHOUT A PROMPT, not
  that --input is wrong. Check with "nexus task get <id> --json | jq -r .prompt"
  and set it with "nexus task update <id> --prompt ...".

  A TASK WHOSE inputFormat IS "JSON" ALSO TAKES A PLAIN STRING. The route
  accepts a string or an object whatever the task's inputFormat, and a
  json-input task fed --input "Paris" still produces the structured output. Send
  an object only when the task genuinely needs several named fields, and send it
  through --body: --body '{"input":{"city":"Paris","country":"FR"}}'. The shape
  the task expects is jsonInputSchema on "task get".

  A CLIENT TIMEOUT DOES NOT STOP THE SERVER. The generation keeps running and is
  still billed after this command gives up — raise --timeout rather than
  re-running, since a re-run starts a second generation.

  A jsonOutputSchema whose root is not an object (a top-level array or scalar)
  fails here with a 400 EVERY time, however well the task saved.

  Only one flag per command may read standard input. Passing "-" to two of them
  — "--body -" alongside "--input -", say — is refused with an error naming
  both, and no request is sent. Give one of them a literal value or a file path.`;
