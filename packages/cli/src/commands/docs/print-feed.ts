import type { OptionValues } from "commander";

import { timeoutSecondsToMs } from "../../client";
import { resolveBaseUrl } from "../../config";
import { reportFailure } from "../../errors";
import { isJsonMode } from "../../output";
import {
  DOCS_FEED_DEFAULT_TIMEOUT_MS,
  DOCS_FEED_DEFAULT_TIMEOUT_SECONDS,
  feedUrls,
  isPlainText
} from "./_shared/feeds";

/** `nexus docs --full` and `nexus docs --index` — one llms.txt feed, verbatim. */
export async function printDocsFeed(
  globals: OptionValues,
  opts: { full?: boolean; index?: boolean }
): Promise<void> {
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
}
