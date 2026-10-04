import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { color, isJsonMode, printList, printRecord } from "../../output";
import { formatStatus } from "./_shared/format-status";
import { TRACING_TRACE_HELP } from "./copy/trace-help";

/** `nexus tracing trace` — one run, with its generations listed. */
export function registerTracingTraceCommand(tracing: Command, program: Command): void {
  tracing
    .command("trace")
    .description("Get trace details with generations")
    .argument("<id>", "Trace ID")
    .addHelpText("after", TRACING_TRACE_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const trace = await client.tracing.getTrace(id);
        printRecord(trace, [
          { key: "id", label: "ID" },
          { key: "status", label: "Status" },
          { key: "agentName", label: "Agent" },
          { key: "workflowName", label: "Workflow" },
          {
            key: "totalCostUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(4)}` : "-")
          },
          { key: "totalInputTokens", label: "Input Tokens" },
          { key: "totalOutputTokens", label: "Output Tokens" },
          { key: "totalDurationMs", label: "Duration (ms)" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" }
        ]);

        // In JSON mode the trace object already carries `generations` nested,
        // so printRecord above emitted them inside the single JSON document.
        // Only render the human-readable generations table for non-JSON output —
        // emitting a second JSON value here would break parsers (NEX-2176).
        const gens = trace.generations;
        if (!isJsonMode() && gens && gens.length > 0) {
          // 🔴 THE COUNT IS THE TRACE'S OWN, AND THE ARRAY IS NOT. The nested
          // array is windowed server-side while `generationCount` counts the
          // whole trace, so `length < generationCount` IS the window biting —
          // a fact off the wire, never a cap this file duplicates. The window size is
          // never named here: naming it would put a server constant in a second
          // place, and the two numbers already say everything a reader needs.
          //
          // Unlike the ready reads, this route HAS a real denominator, so the
          // house "x of y" is honest here. `workspace search` is the same shape
          // one level simpler — a wire flag, rendered inline, silent when false.
          //
          // Silent when the whole list is present: an unconditional suffix would
          // train the reader to skim the one line that carries the warning.
          const windowed = gens.length < trace.generationCount;
          const shown = windowed ? `${gens.length} of ${trace.generationCount}` : `${gens.length}`;
          console.log(`\n${color.bold("Generations")} (${shown}):\n`);
          if (windowed) {
            console.log(
              color.dim(
                `  Windowed — page the rest with "nexus tracing generations --trace-id <id>".\n`
              )
            );
          }
          printList(gens, undefined, [
            { key: "id", label: "ID", width: 36 },
            { key: "modelName", label: "MODEL", width: 25 },
            { key: "status", label: "STATUS", width: 12, format: formatStatus },
            {
              key: "costUsd",
              label: "COST ($)",
              width: 10,
              format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
            },
            {
              key: "durationMs",
              label: "DURATION",
              width: 10,
              format: (v) => (v != null ? `${v}ms` : "-")
            }
          ]);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
