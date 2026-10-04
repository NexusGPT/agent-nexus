/** Appended to `nexus tracing generations`. */
export const TRACING_GENERATIONS_HELP = `
Examples:
  $ nexus tracing generations
  $ nexus tracing generations --provider ANTHROPIC --status FAILED
  $ nexus tracing generations --trace-id 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --json
  $ nexus tracing generations --sort-by costUsd --order desc --limit 10

Notes:
  NO PROMPTS, MESSAGES OR RESPONSES HERE, at any --limit and under --json.
  This endpoint omits them; only "nexus tracing generation <id> --json"
  returns them, one generation at a time.
  THIS IS THE UNCAPPED WAY TO READ A LONG TRACE. Paired with --trace-id it
  pages past the 100-generation ceiling of "tracing trace <id>".
  --min-cost / --max-cost are USD and are compared against the stored cost,
  so a generation whose cost is null matches NEITHER bound and disappears from
  a filtered list. Leave both off to see unpriced calls.
  --status here is a DIFFERENT SET from the trace statuses, which are
  IN_PROGRESS, COMPLETED and FAILED.
  --provider TAKES A MODEL PROVIDER, NOT A CHANNEL. A provider with no recorded
  generation returns an empty page rather than an error, so an empty result is
  "nothing ran on it" and never "that provider does not exist".
  A NULL COST SORTS LAST IN BOTH DIRECTIONS, on --sort-by costUsd and on
  --sort-by duration-ms alike, so the first page of "most expensive" is the
  most expensive. Null means NOT PRICED — no usage was ever recorded for it —
  and it is never zero, so it is neither the dearest nor the cheapest. Cost
  renders "-" for it.
  A NULL COST ON A **COMPLETED** GENERATION IS NORMAL AND IS NOT A BUG. An
  ABORTED generation is stored with status COMPLETED, and the abort path writes
  no cost. So the three states that leave cost null are RUNNING, FAILED, and
  COMPLETED-because-aborted.
  --model is a CASE-INSENSITIVE SUBSTRING match, not an exact one: --model gpt
  also returns gpt-4o and gpt-4o-mini. Use "nexus tracing models" for the exact
  names, and pass a full one when you mean only that model.
  THE TABLE SHOWS 6 COLUMNS AND A --json ROW CARRIES 26 KEYS. The twenty you
  cannot see are the whole reason to pass --json:
    provider, nodeId, taskId, taskName, metadata, startedAt, completedAt,
      errorMessage, responseId, finishReason, temperature, isAborted;
    inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
      reasoningTokens — the token classes priced apart from one another;
    ttftMs, streamDurationMs, thinkingDurationMs — the split behind durationMs.
  --json here is {data, meta}, NOT the bare array "tracing export-bulk" writes.
  --limit IS 1-100 AND DEFAULTS TO 20; --page DEFAULTS TO 1. Above 100 is a 400
  and never a clamp, so a script asking for 500 gets nothing rather than 100.
  Walk a long trace with --page, never with a bigger --limit.`;
