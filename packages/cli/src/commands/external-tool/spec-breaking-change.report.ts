import { NexusApiError } from "@agent-nexus/sdk";

import { printFailure } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import type { ToolSpecBreakingChangeDetails } from "../../external-tool-wire-types";

/**
 * The API's OWN code for the 409 this module special-cases.
 *
 * ⚠️ NAMED ONCE, BECAUSE THE EXTRACTOR AND THE REPORTER MUST AGREE. The
 * extractor matches on the code and the reporter puts it on the wire; two
 * literals would let a rename move one and not the other, and the document
 * would then carry a code the CLI never actually matched.
 */
const TOOL_SPEC_BREAKING_CHANGE = "TOOL_SPEC_BREAKING_CHANGE";

/**
 * 🔴 THIS FILE IS THE ONE PLACE A SUBCOMMAND BOUNDARY IS NOT THE CONCERN
 * BOUNDARY IN THIS NAMESPACE. `update` and `update-spec` are two commands with
 * different inputs, different help and different purposes, and they share ONE
 * guard: both send an `openApiSpec` and both must render the same 409 the same
 * way. Copying the pair into each command file would be two things to drift —
 * exactly what the `TOOL_SPEC_BREAKING_CHANGE` docblock above refuses for the
 * code literal, one level up.
 */
export function extractSpecBreakingChangeDetails(
  err: unknown
): ToolSpecBreakingChangeDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== TOOL_SPEC_BREAKING_CHANGE) return null;
  return (err.details as ToolSpecBreakingChangeDetails) ?? null;
}

/**
 * The spec-breaking-change refusal, as ONE error document.
 *
 * Same defect and same fix as `reportToolHasAttachments`: the binding list went
 * to stderr and stdout stayed empty at exit 1, so `--json` promised a document
 * and delivered nothing on the one path where the caller most needs to read
 * WHICH actions it would break — and the code is the SERVER'S, for the reason
 * spelled out there.
 */
export function reportSpecBreakingChange({
  removedActions,
  total,
  bindings
}: ToolSpecBreakingChangeDetails): number {
  const lines = [
    `  removed action(s): ${removedActions.join(", ")}`,
    `  bound by ${total} reference(s):`,
    ...bindings.map((b) => `  • [${b.kind}] ${b.label}  → ${b.action}`)
  ];
  if (total > bindings.length) {
    lines.push(`  • … and ${total - bindings.length} more`);
  }

  printFailure(
    `Refusing to refresh: the new spec removes ${removedActions.length} action(s) still bound downstream:\n` +
      lines.join("\n"),
    TOOL_SPEC_BREAKING_CHANGE,
    "Re-run with --force to refresh anyway — downstream nodes binding a removed action need repointing manually."
  );
  return EXIT_CODES["invalid-input"];
}
