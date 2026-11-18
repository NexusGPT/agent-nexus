import { parseJsonObjectFlag } from "../../util/json-object-flag";

/**
 * The two JSON-object flags `nexus mcp-server call` takes, resolved together.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IT DESCRIBES AND DOES NOT PRINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Same shape and same reason as `describeMcpSyncRefusal` next door: a helper that
 * printed through `refuse` would make the leaf read
 * `process.exitCode = resolveMcpCallInputs(…)`, and
 * `json-error-document.static-scan.test.ts`'s `emitsDocument` follows DIRECT calls
 * only — so the document emission would become invisible at the exit. Returning a
 * descriptor keeps it visible and makes the flag -> refusal mapping assertable
 * without spying on stdout.
 *
 * ## 🔴 `--arguments` IS RESOLVED FIRST, AND THAT ORDER IS THE BEHAVIOUR
 *
 * A call with both flags malformed reports `--arguments`, because that is the one
 * the operator has to fix to get anywhere. Resolving both and reporting a joined
 * sentence would name two problems where the first one is enough, and resolving
 * `--card-variables` first would name the lesser one.
 */

/** Both flags parsed. Either is `{}` when its flag was not passed. */
export interface McpCallInputs {
  readonly toolArguments: Record<string, unknown>;
  readonly cardVariables: Record<string, unknown>;
}

/** Why one of them is not a JSON object, with the hint that belongs to that flag. */
export interface McpCallInputRefusal {
  readonly reason: string;
  readonly hint: string;
}

/** The flag values as commander hands them over — absent when not passed. */
export interface McpCallInputFlags {
  readonly arguments?: string;
  readonly cardVariables?: string;
}

/**
 * Parse `--arguments` and `--card-variables`, or describe the first refusal.
 *
 * @param flags - The raw flag values off commander's parsed options.
 * @param serverId - Named in the `--arguments` hint, so the operator is pointed at
 *   the one command that prints the tool's approved input schema.
 * @returns `McpCallInputs`, or `McpCallInputRefusal` — discriminate on `"reason" in`.
 */
export function resolveMcpCallInputs(
  flags: McpCallInputFlags,
  serverId: string
): McpCallInputs | McpCallInputRefusal {
  const toolArguments = parseJsonObjectFlag(flags.arguments, "--arguments");
  if ("reason" in toolArguments) {
    return {
      reason: toolArguments.reason,
      hint: `Run "nexus mcp-server get ${serverId}" for the tool's approved input schema.`
    };
  }

  const cardVariables = parseJsonObjectFlag(flags.cardVariables, "--card-variables");
  if ("reason" in cardVariables) {
    return {
      reason: cardVariables.reason,
      hint: "A card that declares variables is unusable without values for them."
    };
  }

  return { toolArguments: toolArguments.object, cardVariables: cardVariables.object };
}
