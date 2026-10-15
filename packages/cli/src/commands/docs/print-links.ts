import type { OptionValues } from "commander";

import { resolveBaseUrl } from "../../config";
import { resolveDashboardHost } from "../../dashboard-host";
import { color, emitDocument, isJsonMode } from "../../output";
import { feedUrls } from "./_shared/feeds";

/** A bare `nexus docs` — the browsable links, and the same five URLs as a document. */
export function printDocsLinks(globals: OptionValues): void {
  // Default: show links. These are pages a human opens in a browser, so they
  // are on the dashboard host — a different host from the feeds above, and
  // the reason both resolvers are used in one command.
  const docsUrl = `${resolveDashboardHost(globals)}/docs`;
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
}
