import type { TestAgentToolBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError, reportFailure } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/** `nexus tool test` — dry-run an agent's tool config. */
export function registerToolTestCommand(tool: Command, program: Command): void {
  tool
    .command("test")
    .description("Test-execute a configured agent tool")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-config-id>", "Agent tool configuration ID")
    .option("--input <json>", "Sample input as JSON string")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool test 33333333-3333-4333-8333-333333333333 22222222-2222-4222-8222-222222222222 --input '{"to":"test@example.com"}'
  $ nexus tool test 33333333-3333-4333-8333-333333333333 22222222-2222-4222-8222-222222222222 --body '{"input":{"query":"hello"}}'

Notes:
  TWO IDS, AND NEITHER IS THE TOOL'S. The first is the AGENT; the second is that
  agent's tool CONFIGURATION — the row that binds a tool and a credential to this
  agent. A marketplace tool id will not work in either slot.
  🚨 IT REALLY EXECUTES, with the agent's own credential. This is the configured
  tool doing its job, so a send action sends and a write action writes. It is a
  test of the wiring, never a dry run.
  --input is the shorthand and lands as "input" inside the body; --body is the
  same request written out. Passing both merges them, with --input winning on
  that key.
  A pass proves this agent can run this tool with this credential — which is a
  narrower claim than the tool working, and the one worth checking after a
  credential changes.
  THE EXIT CODE CARRIES THAT CLAIM. A pass exits 0 and a failure exits non-zero,
  so a post-credential-change script can gate on it instead of parsing the
  document. Under --json a failure REPLACES the result with the error document;
  its message carries the platform's own reason.`
    )
    .action(async (agentId: string, toolConfigId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.input) flags.input = JSON.parse(opts.input);
        const body = mergeBodyWithFlags(base, flags);
        const result = await client.tools.test(
          agentId,
          toolConfigId,
          asRequestBody<TestAgentToolBody>(body)
        );
        if (result.status === "success") {
          printRecord(result);
        } else {
          // `remote-error`, never a refusal: the invocation was ACCEPTED and the
          // platform answered that this agent cannot run this tool with this
          // credential — which is the claim this command's own help makes for a
          // pass, and the one a post-credential-change script gates on. The
          // caller's next move is to fix the tool configuration, not the command
          // line. Same shape and same taxonomy choice as
          // `external-tool test-auth`.
          //
          // 🚨 THE RECORD IS NOT PRINTED FIRST. Under --json a failure is the
          // error document and NOTHING else; taking stdout with the payload and
          // then refusing leaves a document that parses cleanly and never says
          // the test failed — `error-masked` in `json-one-document.scan.ts`.
          // `result.error` carries the reason, so nothing is lost.
          process.exitCode = reportFailure(
            "remote-error",
            `Tool test failed: ${result.error ?? "Unknown error"}`,
            "A pass proves this agent can run this tool with this credential. Check the tool configuration's credential and its parameter setup, then test again."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
