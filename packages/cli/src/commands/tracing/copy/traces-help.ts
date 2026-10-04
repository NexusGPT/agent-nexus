/** Appended to `nexus tracing traces`. */
export const TRACING_TRACES_HELP = `
Examples:
  $ nexus tracing traces
  $ nexus tracing traces --status FAILED --limit 10
  $ nexus tracing traces --agent-id 4c6e1a82-3f7d-4b90-a512-8d0e6c9b7f34 --start-date 2026-03-01 --json

Notes:
  NOTHING OLDER THAN THE RETENTION WINDOW IS HERE. An empty result for last
  month is expiry, not "it never ran" — see "nexus tracing --help".
  COST IS totalCostUsd, IN DOLLARS. A "-" in the COST column is null (the run
  is still in progress, or no priced generation was recorded) and is NOT zero.
  Same for DURATION.
  --start-date / --end-date are ISO 8601 and filter on when the trace STARTED,
  so a run that began before the window and finished inside it is excluded.
  --agent-id MATCHES THE TRACE'S AGENT COLUMN FIRST AND ITS RECORDED CONTEXT
  SECOND, so it returns the same traces "tracing cost-breakdown --group-by
  agent" charges to that agent. --workflow-id matches the recorded context
  only, so a trace with no context — a bare API call — matches it and is only
  reachable unfiltered.
  --status, --source, --sort-by and --order are validated LOCALLY against the
  contract, so a bad value is refused here and never becomes a 400. --sort-by
  defaults to startedAt and --order to desc; both defaults live on the SERVER,
  so unset the CLI sends neither.
  --source NAMES THE SURFACE THAT PRODUCED THE TRACE, and it matches on a key
  the trace recorded in its context — so a trace with no context matches no
  --source at all and is only reachable unfiltered, exactly like --workflow-id.
  agent-creation and ai-task-creation are two separate values on purpose:
  historic AI-task rows recorded their thread under the agent-creation key, so
  the older value still answers for them.
  --model KEEPS A TRACE IF ANY OF ITS GENERATIONS MATCHES, and the match is a
  case-insensitive substring — --model gpt also keeps gpt-4o. A kept trace's
  cost still covers every model it used, not only the one you filtered on.
  GENS is the generation count for the trace. It is correct here; the same
  field from "tracing trace <id>" is capped at 100 (see that command).
  --limit IS 1-100 AND DEFAULTS TO 20; --page DEFAULTS TO 1. Above 100 is a 400
  and never a clamp, so a script asking for 500 gets nothing rather than 100.
  That is the page contract every list command here shares, and it is NOT the
  one "tracing export-bulk" documents: that flag runs 1-500 and defaults to 100,
  because an export is a file and this is a page. Walk a long result with
  --page, never with a bigger --limit.`;
