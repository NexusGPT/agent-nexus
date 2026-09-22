import { timeoutSecondsToMs } from "../client";
import { DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS, downloadWithStallDeadline } from "./stall-deadline";

/**
 * Download a preset repo tarball. Its own file rather than a function inside
 * `skill-bundle.ts`, because it is the only part of that module that touches the
 * network — everything else there is pure archive and directory work that a test
 * runs with no network at all.
 *
 * 🔴 THE DEADLINE IS ON SILENCE, NOT ON ELAPSED TIME, AND THE DIFFERENCE IS THE
 * WHOLE POINT HERE. This transfer is a whole GitHub repository at an arbitrary
 * ref: its size is not knowable before it starts, and the "office" preset bundle
 * is megabytes. An elapsed-time budget large enough never to abort one of those
 * on a slow link is too large to bound a dead socket usefully; one small enough
 * to bound the socket aborts a download that was going to work. That trade is
 * the reason a total deadline is the WRONG instrument here — it would replace a
 * hang with a refused transfer, which is the more expensive of the two because
 * the hang is at least obvious. A stall budget has neither problem: it never
 * counts against a transfer that is arriving. `stall-deadline.ts` owns the
 * mechanism.
 *
 * `timeoutSeconds` is the global `--timeout`, in SECONDS — so the budget is the
 * longest this download may be SILENT, never the longest it may take. Unset
 * leaves {@link DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS} in force.
 */
export async function fetchTarball(url: string, timeoutSeconds?: number): Promise<Buffer> {
  const { response, body } = await downloadWithStallDeadline(
    url,
    { headers: { accept: "application/gzip" } },
    { timeout: timeoutSecondsToMs(timeoutSeconds) ?? DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url} — ${response.status} ${response.statusText}. ` +
        `Check the --repo and --ref values, or pass --from-dir to use a local checkout.`
    );
  }
  return body;
}
