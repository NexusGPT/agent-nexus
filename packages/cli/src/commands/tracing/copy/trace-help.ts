/** Appended to `nexus tracing trace`. */
export const TRACING_TRACE_HELP = `
Examples:
  $ nexus tracing trace 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b
  $ nexus tracing trace 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --json

Notes:
  THE GENERATIONS LIST IS WINDOWED, AND THE HEADER SAYS SO. A trace with more
  model calls than the window returns the earliest by start time, and the header
  then reads "Generations (100 of 137)". The second number is the trace's own
  count and agrees with "tracing traces" for the same trace, so the two never
  disagree about one trace. Page the rest with
  "nexus tracing generations --trace-id <id>".
  STILL NO PROMPTS. The nested generations carry metadata only; the prompt,
  messages and response need "nexus tracing generation <generation-id> --json".
  Cost and duration render "-" for null, which is not zero — an IN_PROGRESS
  trace has no total yet.`;
