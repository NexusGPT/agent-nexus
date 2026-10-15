import { timeoutSecondsToMs } from "../client";
import type { SkillsCorpus } from "./corpus";
import { corpusFromServedBytes } from "./corpus-document";
import { PlatformCorpusError } from "./platform-corpus-error";
import { type CliSkillsManifestWire, parseManifestEnvelope } from "./wire";

/**
 * TALKING TO THE PLATFORM'S CLI-SKILLS ROUTES. Transport only.
 *
 * What a read MEANS once the bytes have arrived is `corpus-document.ts` — the checksum,
 * the document shape, path safety and the per-record decode. The split is at the point
 * where this file stops needing its `PlatformIo`: everything here is a URL, a timeout,
 * a status code or a socket, and everything there is a pure function of bytes.
 */

/**
 * How long an install waits for each read before it gives up on the platform,
 * unless the global `--timeout` says otherwise. The manifest is a few hundred
 * bytes, so its budget is short: an offline machine should fall back to the
 * bundled corpus in seconds, not half a minute.
 */
export const MANIFEST_TIMEOUT_MS = 5_000;
/**
 * The corpus is several MB of gzip — measured at 6.0 MB over the skills tree at
 * `cde9e3dc30f3`, of which 1.1 MB is the vendored tarballs now carried as base64.
 */
export const CORPUS_TIMEOUT_MS = 30_000;

export interface PlatformIo {
  readonly baseUrl: string;
  readonly cliVersion: string;
  readonly fetch: typeof fetch;
  /** The global flags that reach these reads: `--timeout <seconds>` replaces both budgets. */
  readonly globals: { readonly timeout?: number };
}

async function send(io: PlatformIo, path: string, defaultTimeoutMs: number): Promise<Response> {
  const url = `${io.baseUrl.replace(/\/+$/, "")}${path}`;
  const budgetMs = timeoutSecondsToMs(io.globals.timeout) ?? defaultTimeoutMs;
  try {
    return await io.fetch(url, {
      headers: { "User-Agent": `nexus-cli/${io.cliVersion}` },
      // Spelled out rather than `budgetMs`: timeout-values-carry-their-unit.test.ts
      // reads this argument to prove the global --timeout reaches it.
      signal: AbortSignal.timeout(timeoutSecondsToMs(io.globals.timeout) ?? defaultTimeoutMs)
    });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PlatformCorpusError(
        "timed-out",
        `${url} did not answer within ${budgetMs / 1000}s (raise it with --timeout <seconds>)`
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new PlatformCorpusError("connection-failed", `could not reach ${url} (${detail})`);
  }
}

function refusedStatus(response: Response, what: string): PlatformCorpusError {
  return response.status === 404
    ? new PlatformCorpusError("not-found", `${what} has not been published`)
    : new PlatformCorpusError("remote-error", `${what} answered HTTP ${response.status}`);
}

/** The manifest for `ref` — `"latest"`, or a full commit sha. */
export async function fetchManifest(io: PlatformIo, ref: string): Promise<CliSkillsManifestWire> {
  const path = ref === "latest" ? "/api/cli/skills/manifest" : `/api/cli/skills/${ref}/manifest`;
  const what = ref === "latest" ? "the latest skills corpus" : `skills commit ${ref}`;
  const response = await send(io, path, MANIFEST_TIMEOUT_MS);
  if (!response.ok) throw refusedStatus(response, what);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PlatformCorpusError("remote-error", `the manifest for ${what} is not JSON`);
  }
  const manifest = parseManifestEnvelope(body);
  if (!manifest) {
    throw new PlatformCorpusError(
      "remote-error",
      `the manifest for ${what} is not one this CLI reads`
    );
  }
  if (ref !== "latest" && manifest.commitSha !== ref) {
    throw new PlatformCorpusError(
      "remote-error",
      `asked for ${ref}, the platform answered ${manifest.commitSha}`
    );
  }
  return manifest;
}

/**
 * Download the corpus a manifest names and hand its bytes to
 * {@link corpusFromServedBytes}, which refuses them unless they hash to the manifest's
 * `sha256` — before anything is unpacked, and long before anything is written.
 */
export async function fetchCorpus(
  io: PlatformIo,
  manifest: CliSkillsManifestWire
): Promise<SkillsCorpus> {
  const what = `skills commit ${manifest.commitSha}`;
  const response = await send(
    io,
    `/api/cli/skills/${manifest.commitSha}/corpus`,
    CORPUS_TIMEOUT_MS
  );
  if (!response.ok) throw refusedStatus(response, `the corpus for ${what}`);

  let gzip: Buffer;
  try {
    gzip = Buffer.from(await response.arrayBuffer());
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PlatformCorpusError(
      "connection-failed",
      `the corpus for ${what} did not finish downloading (${detail})`
    );
  }
  return corpusFromServedBytes(gzip, manifest);
}
