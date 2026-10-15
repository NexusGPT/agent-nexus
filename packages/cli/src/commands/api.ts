import { Command } from "commander";

import { handleError, refuse } from "../errors";
import { isJsonMode } from "../output";
import { resolveBody } from "../util/body";
import { buildMultipartBody, MULTIPART_FILE_FIELD } from "../util/multipart";
import { collect, parseQueryPairs } from "./api/_shared/query-pairs";
import { createRawHttpClient } from "./api/_shared/raw-http-client";
import { redundantPrefix } from "./api/_shared/redundant-prefix";
import { API_HELP } from "./api/api-help";

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
    .addHelpText("after", API_HELP)
    .action(async (method: string, path: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const http = createRawHttpClient(globals);

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
