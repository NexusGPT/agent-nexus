import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { timeoutSecondsToMs } from "../client";
import type { FailureCause } from "../errors";
import { buildCorpusFromFiles } from "./build-corpus";
import type { SkillsCorpus } from "./corpus";
import { type CliSkillsManifestWire, parseCorpus, parseManifestEnvelope } from "./wire";

/**
 * How long an install waits for each read before it gives up on the platform,
 * unless the global `--timeout` says otherwise. The manifest is a few hundred
 * bytes, so its budget is short: an offline machine should fall back to the
 * bundled corpus in seconds, not half a minute.
 */
export const MANIFEST_TIMEOUT_MS = 5_000;
/** The corpus is about 2 MB of gzip. */
export const CORPUS_TIMEOUT_MS = 30_000;

/** Why the platform's corpus could not be used, and which failure category that is. */
export class PlatformCorpusError extends Error {
  constructor(
    readonly failure: FailureCause,
    message: string
  ) {
    super(message);
    this.name = "PlatformCorpusError";
  }
}

export interface PlatformIo {
  readonly baseUrl: string;
  readonly cliVersion: string;
  readonly fetch: typeof fetch;
  /** The global flags that reach these reads: `--timeout <seconds>` replaces both budgets. */
  readonly globals: { readonly timeout?: number };
}

/** A path the installer can write under its target: relative, forward slashes, no `.`, `..` or empty segment. */
function isInstallablePath(path: string): boolean {
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
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
 * Download the corpus a manifest names, and refuse it unless its bytes hash to
 * the manifest's `sha256` — before anything is unpacked, and long before anything
 * is written. The corpus carries hooks: code that runs on this machine.
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
  const digest = createHash("sha256").update(gzip).digest("hex");
  if (gzip.length !== manifest.size || digest !== manifest.sha256) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} does not match its checksum (got ${gzip.length} bytes, sha256 ${digest.slice(0, 12)})`
    );
  }

  let corpus: ReturnType<typeof parseCorpus>;
  try {
    corpus = parseCorpus(JSON.parse(gunzipSync(gzip).toString("utf-8")));
  } catch {
    corpus = null;
  }
  if (!corpus || corpus.commitSha !== manifest.commitSha) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} is not one this CLI reads`
    );
  }
  const unsafe = corpus.files.find((file) => !isInstallablePath(file.path));
  if (unsafe) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} names an unsafe path: ${unsafe.path}`
    );
  }

  const contents = new Map(corpus.files.map((file) => [file.path, file.content]));
  return buildCorpusFromFiles(manifest.commitSha, {
    paths: [...contents.keys()],
    read: (path) => contents.get(path) ?? ""
  });
}
