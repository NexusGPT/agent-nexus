import { HttpClient } from "@agent-nexus/sdk";
import { Command } from "commander";

import { resolveApiKey, resolveBaseUrl } from "../config";
import { handleError } from "../errors";
import { isJsonMode } from "../output";
import { resolveBody } from "../util/body";

/**
 * Register the `nexus api` raw passthrough command.
 *
 * Provides direct access to any Nexus Public API v1 endpoint,
 * handling authentication, base URL, and response formatting automatically.
 */
export function registerApiCommand(program: Command): void {
  program
    .command("api")
    .description("Call any Nexus API endpoint directly")
    .argument("<method>", "HTTP method (GET, POST, PATCH, PUT, DELETE)")
    .argument("<path>", "API path relative to /api/public/v1 (e.g. /models)")
    .option("--body <json>", "Request body as JSON string, .json file path, or '-' for stdin")
    .option("--query <key=value...>", "Query parameters (repeatable)", collect, [])
    .option("--timeout <ms>", "Request timeout in milliseconds (default: 30000)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus api GET /models
  $ nexus api POST /agents --body '{"firstName":"Test","lastName":"Bot","role":"QA"}'
  $ nexus api GET /agents --query page=1 --query limit=5
  $ nexus api PATCH /agents/abc-123 --body payload.json
  $ nexus api POST /prompt-assistant/chat --body '{"message":"..."}' --timeout 120000
  $ echo '{"text":"hello"}' | nexus api POST /emulator/dep-1/sessions/s-1/messages --body -`
    )
    .action(async (method: string, path: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const http = new HttpClient({
          baseUrl: resolveBaseUrl(globals.baseUrl, globals.profile),
          apiKey: resolveApiKey(globals.apiKey, globals.profile),
          timeout: opts.timeout ? Number(opts.timeout) : undefined
        });

        const body = await resolveBody(opts.body);
        const query = parseQueryPairs(opts.query as string[]);

        // Normalize path — accept with or without leading slash
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;

        const { data, meta } = await http.requestWithMeta<unknown>(
          method.toUpperCase(),
          normalizedPath,
          { body, query }
        );

        // Always output as JSON (raw API data has no predefined table format)
        const output = meta ? { data, meta } : { data };
        console.log(JSON.stringify(output, null, isJsonMode() ? undefined : 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

/** Commander collector for repeatable --query options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Parse ["key=value", ...] into { key: "value", ... }. */
function parseQueryPairs(pairs: string[]): Record<string, string> | undefined {
  if (pairs.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      result[pair] = "true";
    } else {
      result[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return result;
}
