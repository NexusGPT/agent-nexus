import { HttpClient } from "@agent-nexus/sdk";
import { Command } from "commander";

import { timeoutSecondsToMs } from "../client";
import { resolveApiKey, resolveBaseUrl } from "../config";
import { handleError } from "../errors";
import { isJsonMode } from "../output";
import { resolveBody } from "../util/body";
import { buildMultipartBody, MULTIPART_FILE_FIELD } from "../util/multipart";

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
    .option(
      "--file <path>",
      `Upload a file as multipart/form-data (sent under the "${MULTIPART_FILE_FIELD}" field)`
    )
    .option("--query <key=value...>", "Query parameters (repeatable)", collect, [])
    .addHelpText(
      "after",
      `
Examples:
  $ nexus api GET /models
  $ nexus api POST /agents --body '{"firstName":"Test","lastName":"Bot","role":"QA"}'
  $ nexus api GET /agents --query page=1 --query limit=5
  $ nexus api PATCH /agents/abc-123 --body payload.json
  $ nexus api POST /prompt-assistant/chat --body '{"message":"..."}' --timeout 120
  $ nexus api POST /mcp --body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  $ echo '{"text":"hello"}' | nexus api POST /emulator/dep-1/sessions/s-1/messages --body -

File uploads:
  $ nexus api POST /agents/<agentId>/profile-picture --file avatar.png
  $ nexus api POST /skills/tasks/<taskId>/evaluations/<sessionId>/dataset --file cases.json
  $ nexus api POST /documents/file --file report.pdf --body '{"description":"Q4"}'

  The file is sent under the "${MULTIPART_FILE_FIELD}" field, with its base name — some routes
  read that name (the evaluation dataset picks JSON vs CSV from the .json
  suffix; ticket attachments store it). With --file, --body carries the
  remaining form fields as text rather than a JSON body.

  Most uploads also have a typed command, which is the friendlier route:
  nexus agent upload-profile-picture, nexus ticket attach, nexus template
  upload, nexus workflow upload-icon, nexus external-tool upload-icon,
  nexus document upload, nexus asset upload.

Notes:
  For long-running calls, raise the global --timeout <seconds> flag (default 30 s).
  Every 2xx is a success. Routes answering with the standard envelope are
  unwrapped to their "data"; a route speaking its own protocol (POST /mcp is
  JSON-RPC 2.0) is returned verbatim under "data" — pipe through 'jq .data'.`
    )
    .action(async (method: string, path: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const http = new HttpClient({
          baseUrl: resolveBaseUrl(globals.baseUrl, globals.profile),
          apiKey: resolveApiKey(globals.apiKey, globals.profile),
          // The global --timeout is in seconds; this command's former local
          // --timeout <ms> was replaced by it (NEX-2760) so the flag cannot
          // mean two different units depending on where it sits in argv.
          timeout: timeoutSecondsToMs(globals.timeout)
        });

        const jsonBody = await resolveBody(opts.body);
        // With --file the request becomes multipart/form-data and --body stops
        // being the body: its keys ride along as text parts beside the file.
        // `HttpClient` branches on `body instanceof FormData` and leaves the
        // Content-Type to the runtime, so the boundary is set correctly.
        const body =
          opts.file === undefined ? jsonBody : buildMultipartBody(String(opts.file), jsonBody);
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
