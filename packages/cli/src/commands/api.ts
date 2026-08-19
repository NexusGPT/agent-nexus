import { HttpClient } from "@agent-nexus/sdk";
import { createContractReporter } from "../contract-warnings";
import { Command } from "commander";

import { timeoutSecondsToMs } from "../client";
import { resolveApiKey, resolveBaseUrl } from "../config";
import { handleError, refuse } from "../errors";
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
    .argument("<method>", "HTTP method, uppercased and sent as given — see Notes")
    .argument(
      "<path>",
      "API path relative to /api/public/v1, which is PREPENDED for you (e.g. /models)"
    )
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

  🚨 THE /api/public/v1 PREFIX IS ADDED FOR YOU, SO DO NOT TYPE IT. <path> is
  what comes AFTER it. Paste a full path from a doc page or a browser and you
  get {base-url}/api/public/v1/api/public/v1/... — which 404s, and a 404 reads
  as "that route does not exist" rather than "you typed the prefix twice". This
  command refuses that spelling locally and prints the path you meant, so the
  mistake never reaches the network:

    $ nexus api GET /models                     # correct
    $ nexus api GET /api/public/v1/models       # refused, names /models
    $ nexus api GET /public/v1/models           # refused, names /models

  🚨 THIS REACHES public/v1 AND NOTHING ELSE, SO IT CANNOT AUDIT THE PLATFORM.
  Every request goes to {base-url}/api/public/v1{path}; the prefix is prepended
  and there is no flag that removes it. A second family of routes is served
  under /api/... that this command cannot ADDRESS at any spelling — it is what
  the dashboard calls, and parts of it take a logged-in session only and answer
  401 to a key that is perfectly valid.
  So an empty or refused probe here says "not on public/v1", never "not on the
  platform". A capability audit built on this command is blind to that family by
  construction, and reporting its silence as an absent feature is the one
  mistake this command makes easy.

  THE OUTPUT IS ALWAYS AN OBJECT WITH A "data" KEY. Every path through this
  command reads .data — envelope or not. What is stripped from an enveloped
  response is "success", never the "data" key itself, and a paginated route
  keeps "meta" beside it. So a route speaking its own protocol (POST /mcp is
  JSON-RPC 2.0) is also nested one level down, under "data". Write every jq
  pipeline against .data, and do not expect the payload at the top level:

    $ nexus api GET /models | jq '.data[0].id'

  "meta" IS WHAT DRIVES A PAGING LOOP, AND ONLY TWO OF ITS FIELDS ARE ALWAYS
  THERE. A paginated route answers {"data":[…],"meta":{…}} where meta carries:
    total       always — rows matching the query, across all pages
    page        always — 1-based, echoing what you sent
    hasMore     OFTEN, NOT ALWAYS. Several v1 list routes omit it entirely.
    limit       only where the route reports it
    totalPages  only where the route reports it
  So write the loop against what the route actually returned, never against the
  richest shape you have seen: "conversation list" sends {total, page, hasMore}
  and "deployment list" sends all five. Where hasMore is absent, page against
  total. Treat a MISSING hasMore as unknown — never as false, which ends the
  loop on page one:

    $ nexus api GET /agents --query page=1 --query limit=5 | jq '.meta'

  SOME ROUTES HAVE NO TYPED COMMAND AT ALL, AND ONE OF THEM IS THE ONLY WAY TO
  SEE INSIDE A WORKSPACE. "nexus workspace" can list, create, rename, delete,
  restore, mount, unmount and report status — it cannot list a workspace's
  FILES. That read exists only here:

    $ nexus api GET /workspaces/<slug>/files --query path=<dir>

  path defaults to the workspace root when omitted. It is what proves a write
  through a mount actually landed, and it pages with continuationToken rather
  than with page/limit — pass the token back:
    --query continuationToken=<token-from-the-previous-response>

  THE METHOD IS NOT VALIDATED LOCALLY. Whatever you type is uppercased and
  sent, so a typo travels to the server and comes back as a bare 400 that never
  names the method. Read the method you typed before you read the request.

  --json DOES NOT MAKE THE OUTPUT JSON — IT IS ALREADY JSON. This command has no
  table view. The flag only switches pretty-printed two-space output to compact
  single-line, which is what you want when piping into jq. Reaching for --json
  to "get JSON out" changes nothing you were missing.

  🚨 THERE IS NO --yes AND NO --dry-run HERE. Every typed destructive verb in
  this CLI declares one, so arriving from those pages you will expect a gate;
  this command has none. The request is sent exactly as written the moment you
  press enter. Re-read the method and the path before running a DELETE or a
  PATCH — that reading is the only confirmation step that exists.`
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
          timeout: timeoutSecondsToMs(globals.timeout),
          onResponseContract: createContractReporter()
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

        const redundant = redundantPrefix(normalizedPath);
        if (redundant !== null) {
          process.exitCode = refuse(
            `<path> is relative to /api/public/v1, and "${redundant.prefix}" repeats it.`,
            `Send ${redundant.corrected} instead. The prefix is prepended by this command; typed twice it becomes /api/public/v1${normalizedPath} and answers 404.`
          );
          return;
        }

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

/**
 * The prefix segments this command prepends, longest first.
 *
 * 🚨 LONGEST FIRST IS LOAD-BEARING. `/api/public/v1/models` starts with `/api`
 * as well, and matching the short form would report the prefix as `/api` and
 * name `/public/v1/models` as the correction — which is still wrong and would
 * be refused a second time. A caller who pastes a full path deserves ONE
 * refusal that names the path they meant.
 */
const REDUNDANT_PREFIXES = ["/api/public/v1", "/public/v1", "/api/v1", "/v1"] as const;

/**
 * Is this `<path>` carrying the prefix this command already prepends?
 *
 * ⚠️ THE ANSWER IS SAFE BECAUSE NO v1 ROUTE BEGINS WITH ANY OF THESE SEGMENTS.
 * Derived, not assumed: every descriptor path in
 * `packages/types/src/api/public/v1/contract/` begins `/public/v1/`, and the
 * segment that follows is a resource name — none of the 304 is `api`, `public`
 * or `v1`. So `/api/...` and `/v1/...` cannot be a real path relative to the
 * prefix, and refusing them costs no legitimate call. A route that ever adds
 * one would need this list narrowed in the same commit.
 *
 * A trailing boundary is required (`/` or end of string) so `/videos` is not
 * read as `/v1` plus `deos`.
 */
function redundantPrefix(normalizedPath: string): { prefix: string; corrected: string } | null {
  for (const prefix of REDUNDANT_PREFIXES) {
    if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) continue;
    const rest = normalizedPath.slice(prefix.length);
    return { prefix, corrected: rest === "" ? "/" : rest };
  }
  return null;
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
