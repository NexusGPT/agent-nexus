import { Command } from "commander";

import { createClient, timeoutSecondsToMs } from "../client";
import { resolveBaseUrl, resolveDashboardUrl } from "../config";
import { bindCommand } from "../contract-binding";
import { handleError, reportFailure } from "../errors";
import { color, emitDocument, isJsonMode } from "../output";
import { DOCS_SEARCH_CONTRACT } from "./docs.contract.generated";

/**
 * The two docs feeds, on the API host.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FEEDS ARE NOT ON THE DASHBOARD HOST, AND THE DASHBOARD HOST 200s ANYWAY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These used to be hardcoded as `https://gpt.nexus/docs/llms-full.txt`.
 * `gpt.nexus` is the DASHBOARD — a static SPA whose `vercel.json` rewrites
 * `/((?!assets/).*)` to `/index.html`. So every path on it answers 200 with the
 * HTML shell, including this one. `res.ok` was true, `res.text()` returned a
 * document, and `nexus docs --full` printed an HTML page as if it were the
 * documentation. Nothing errored and no status code could have revealed it.
 *
 * The feeds are served by the BACKEND: `DocsFeedsController` is `@Controller("docs")`
 * under the `api` global prefix, both routes `@AllowUnauthenticated`, both
 * `Content-Type: text/plain`. So they follow the API base URL, and building them
 * from {@link resolveBaseUrl} is also what makes `--base-url`, `--profile`,
 * `NEXUS_BASE_URL` and `NEXUS_ENV` work here at all — a hardcoded host bypassed
 * the whole precedence chain, so this command could not be pointed at staging or
 * dev in any way.
 *
 * A 200 is not the check. The content type is: an HTML shell arrives at 200 too.
 */
function feedUrls(baseUrl: string): { full: string; index: string } {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    full: `${root}/api/docs/llms-full.txt`,
    index: `${root}/api/docs/llms.txt`
  };
}

/** A feed that answers 200 with a web page is the dashboard-host bug, not docs. */
function isPlainText(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").toLowerCase().includes("text/plain");
}

/**
 * How long to wait for a feed when `--timeout` is not given. MILLISECONDS.
 *
 * A default is fine. A CEILING is not, which is the whole of the defect this
 * replaced: the fetch was `AbortSignal.timeout(60_000)` and the global
 * `--timeout <seconds>` was never read, so on a slow link `nexus docs --full`
 * aborted at 60s and the flag that exists for exactly this could not extend it.
 * `llms-full.txt` is ~2.5 MB — the one command in this namespace most likely to
 * need longer, and the one that could not be given it.
 *
 * Named `*_MS` on purpose. `AbortSignal.timeout` takes MILLISECONDS, and the
 * convention `timeout-values-carry-their-unit.test.ts` enforces is that a
 * millisecond slot is fed either `timeoutSecondsToMs(...)` or a `*_MS` constant.
 * This is NOT the NEX-3707 shape — that was a `*_MS` constant handed to a
 * SECONDS parameter. Into a millisecond slot it is the prescribed form.
 */
const DOCS_FEED_DEFAULT_TIMEOUT_MS = 60_000;

/**
 * The same default in the unit `--timeout` speaks, for the help text and the
 * timeout message. A display divide, never a deadline conversion — the deadline
 * only ever changes unit inside `timeoutSecondsToMs`.
 */
const DOCS_FEED_DEFAULT_TIMEOUT_SECONDS = DOCS_FEED_DEFAULT_TIMEOUT_MS / 1000;

export function registerDocsCommand(program: Command): void {
  const docs = program
    .command("docs")
    .description("Search and browse Nexus product documentation")
    .option("--full", "Fetch and print the full documentation (from llms-full.txt)")
    .option("--index", "Fetch and print the documentation index (from llms.txt)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus docs                                        # Show doc links
  $ nexus docs --index                                # Fetch page index
  $ nexus docs --full                                 # Fetch full docs (large)
  $ nexus docs search "how to deploy to WhatsApp"     # Semantic search
  $ nexus docs search "creating agents" --limit 10

Notes:
  --full and --index read the llms.txt feeds from the API HOST, so they follow
  --base-url / --profile / NEXUS_BASE_URL / NEXUS_ENV like every other command.
  The browsable doc links printed by a bare "nexus docs" are on the DASHBOARD
  host, which is a different host and follows NEXUS_DASHBOARD_URL.
  --full is large (megabytes). Redirect it rather than reading it in a pager.
  The global --timeout <seconds> applies to these fetches; without it they wait
  ${DOCS_FEED_DEFAULT_TIMEOUT_SECONDS}s. On a slow link --full is the one that
  needs raising.
  --full and --index need NO API key. They read public files. Only
  "nexus docs search" authenticates.
  A feed answering 200 with HTML is a MISCONFIGURED BASE URL pointing at the
  dashboard, not at the API — this command refuses it rather than printing the
  web page as if it were documentation.`
    )
    .action(async (opts: { full?: boolean; index?: boolean }) => {
      const globals = program.optsWithGlobals();

      if (opts.full || opts.index) {
        const feeds = feedUrls(resolveBaseUrl(globals.baseUrl, globals.profile));
        const url = opts.full ? feeds.full : feeds.index;
        try {
          // The converter is named AT the call site on purpose: it is the one
          // place the unit changes, and the gate reads this text to prove the
          // deadline is milliseconds and that the global flag can still move it.
          const res = await fetch(url, {
            signal: AbortSignal.timeout(
              timeoutSecondsToMs(globals.timeout) ?? DOCS_FEED_DEFAULT_TIMEOUT_MS
            )
          });
          if (!res.ok) {
            process.exitCode = reportFailure(
              "remote-error",
              `Failed to fetch docs: ${res.status} ${res.statusText}`,
              url
            );
            return;
          }
          // The status is not the check. The dashboard host serves its SPA shell
          // at 200 for every path, so a 200 alone cannot tell "here are the docs"
          // from "here is a web page" — and printing the shell as documentation
          // is exactly how this command looked healthy while returning nothing.
          if (!isPlainText(res)) {
            process.exitCode = reportFailure(
              "remote-error",
              `Expected a text/plain docs feed, got "${res.headers.get("content-type") ?? "no content-type"}".`,
              `${url}\n  This base URL is serving a web page, not the API. Check --base-url / NEXUS_BASE_URL.`
            );
            return;
          }
          const text = await res.text();

          if (isJsonMode()) {
            console.log(JSON.stringify({ url, content: text }));
          } else {
            console.log(text);
          }
        } catch (error: unknown) {
          // An abort is the one failure here with an ACTION attached, so it must
          // not read as a generic network error. `AbortSignal.timeout` rejects
          // with a DOMException named TimeoutError whose message says only "the
          // operation was aborted" — which names neither the cause nor the flag
          // that fixes it.
          const timedOut = error instanceof Error && error.name === "TimeoutError";
          if (timedOut) {
            const waited = globals.timeout ?? DOCS_FEED_DEFAULT_TIMEOUT_SECONDS;
            process.exitCode = reportFailure(
              "timed-out",
              `The docs feed did not finish within ${waited}s.`,
              `${url}\n  Raise it with the global --timeout <seconds>. --full is ~2.5 MB.`
            );
          } else {
            process.exitCode = reportFailure(
              "connection-failed",
              error instanceof Error ? error.message : String(error)
            );
          }
        }
        return;
      }

      // Default: show links. These are pages a human opens in a browser, so they
      // are on the dashboard host — a different host from the feeds above, and
      // the reason both resolvers are used in one command.
      const docsUrl = `${resolveDashboardUrl(globals.dashboardUrl, globals.profile).replace(/\/+$/, "")}/docs`;
      const feeds = feedUrls(resolveBaseUrl(globals.baseUrl, globals.profile));

      // ══════════════════════════════════════════════════════════════════════
      // 🚨 `docs/cli`, NOT `docs/api-reference/cli/overview` — THAT SLUG 404s.
      // ══════════════════════════════════════════════════════════════════════
      // `content/docs/navigation.json` declares three tabs — `user-manual`,
      // `cli` and `api-reference` — and the CLI pages live under `content/docs/cli/`.
      // `content/docs/api-reference/cli/` has never existed, so the link this
      // command printed resolved to nothing:
      //
      //   GET /api/docs/page/api-reference/cli/overview  ->  404
      //   GET /api/docs/page/cli                         ->  200
      //
      // Measured against production 2026-08-21. Nothing catches a bad slug here:
      // these are strings this command prints, so no gate reads them and the
      // dashboard host answers 200 for every path anyway.
      const cliReferenceUrl = `${docsUrl}/cli`;
      const apiReferenceUrl = `${docsUrl}/api-reference/authentication`;

      // THE SAME LINKS, AS A DOCUMENT. This branch printed prose unconditionally
      // — `nexus --json docs` answered 412 bytes of ANSI-coloured text at exit 0,
      // on a command whose whole output is five URLs a script would happily use.
      // It escaped `json-one-document.test.ts` because that gate's population is
      // LEAVES and `docs` has a `search` child, so it is the one command in the
      // tree that is invocable AND a namespace.
      if (isJsonMode()) {
        emitDocument({
          docs: {
            web: docsUrl,
            cliReference: cliReferenceUrl,
            apiReference: apiReferenceUrl,
            llmsIndex: feeds.index,
            llmsFull: feeds.full
          }
        });
        return;
      }

      console.log(color.bold("Nexus Documentation\n"));
      console.log(`  Full docs:     ${color.cyan(docsUrl)}`);
      console.log(`  CLI reference: ${color.cyan(cliReferenceUrl)}`);
      console.log(`  API reference: ${color.cyan(apiReferenceUrl)}`);
      console.log(`  LLM index:     ${color.cyan(feeds.index)}`);
      console.log(`  LLM full:      ${color.cyan(feeds.full)}`);
      console.log();
      console.log(
        color.dim("Use ") +
          color.cyan("nexus docs --full") +
          color.dim(" to fetch all docs, or ") +
          color.cyan("nexus docs search <query>") +
          color.dim(" for semantic search.")
      );
    });

  // Semantic search subcommand (requires API key)
  const search = docs
    .command("search")
    .description("Semantic search across Nexus product documentation (requires API key)")
    .argument("<query>", "Natural language search query")
    .option("--limit <n>", "Max results (1-20)", "5")
    .option("--section <section>", "Filter by docs section (e.g. agents, deployments, knowledge)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus docs search "how to deploy to WhatsApp"
  $ nexus docs search "creating agents" --limit 10
  $ nexus docs search "webhook" --section api-reference
  $ nexus docs search "RAG" --json

Notes:
  THE PRINTED SNIPPET IS TRUNCATED AT 200 CHARACTERS and the trailing "..." is
  added by this CLI, not returned by the route. --json carries the whole snippet,
  so read that when the answer is cut off mid-sentence.
  A row is title, url and snippet. There is no score and no section in the
  output, so --section narrows the search and cannot be confirmed from a result.
  NO MATCH IS NOT AN ERROR. An empty result set prints one dim line and exits 0,
  which is deliberately indistinguishable from a successful search that found
  nothing — check the exit code for reachability, never the presence of rows.`
    )
    .action(async (query: string, opts: { limit?: string; section?: string }) => {
      const client = createClient(program.optsWithGlobals());
      const limit = opts.limit ? parseInt(opts.limit, 10) : 5;

      try {
        const result = await client.docs.search({
          query,
          limit,
          section: opts.section
        });

        const results = result.results ?? [];

        if (isJsonMode()) {
          console.log(JSON.stringify({ query, results }, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log(color.dim(`No documentation found for "${query}".`));
          return;
        }

        console.log(
          color.bold(`\nFound ${results.length} result${results.length === 1 ? "" : "s"}:\n`)
        );

        for (const r of results) {
          console.log(color.cyan(`  ${r.title}`));
          console.log(color.dim(`  ${r.url}`));
          console.log(`  ${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? "..." : ""}`);
          console.log();
        }
      } catch (err) {
        // `handleError` rather than a hand-rolled `console.error`: it classifies
        // the throw into a real code and emits the document on stdout. The old
        // shape exited 1 with an empty stdout under --json and labelled nothing.
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. Only `search`
  // calls a v1 route; the rest of this namespace opens URLs.
  bindCommand(search, DOCS_SEARCH_CONTRACT);
}
