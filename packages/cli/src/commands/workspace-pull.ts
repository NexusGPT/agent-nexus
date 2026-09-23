import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { failure, handleError, refuse } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { color, isJsonMode, printSuccess } from "../output";
import { WORKSPACE_FOLDER_ARCHIVE_CONTRACT } from "./workspace.contract.generated";
import { sharedWorkspaceId } from "./workspace-mount/shared-workspace-id";

/**
 * `nexus workspace pull` — copy files OUT of a workspace onto this machine,
 * for the machine that cannot mount. The inverse of `push`, and the same
 * shape: `<slug>[:<folder>]` names where in the workspace, the rest is local.
 *
 * Two routes, chosen by what was asked for:
 *   - no file names → the folder (root when none) as ONE streamed ZIP from
 *     `GET /workspaces/:slug/folder-archive`, saved beside `--out` and unpacked
 *     with the system `unzip` (macOS, Linux) or `tar` (Windows, which ships
 *     bsdtar and no `unzip`). The server refuses an empty folder and one past
 *     50 000 entries / 2 GB before the first byte.
 *   - file names → one presigned link each (`GET /workspaces/:slug/file`),
 *     fetched in parallel, each written under `--out` by its base name.
 *
 * Local files are overwritten like `cp`. A failure throws: this is `cp`, not
 * the mailbag `push` is — nothing partial is reported as a document.
 */

/** How the archive is unpacked on this platform: the binary and the argv that extracts `zip` into `dir`. */
export function unpackCommand(
  platform: NodeJS.Platform,
  zip: string,
  dir: string
): { file: string; args: string[] } {
  if (platform === "win32") return { file: "tar", args: ["-xf", zip, "-C", dir] };
  return { file: "unzip", args: ["-o", "-q", zip, "-d", dir] };
}

/** `<slug>` or `<slug>:<folder>` — the workspace and the folder inside it. */
export function parseSource(spec: string): { slug: string; folder: string } {
  const colon = spec.indexOf(":");
  if (colon === -1) return { slug: spec, folder: "" };
  const folder = spec
    .slice(colon + 1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
  return { slug: spec.slice(0, colon), folder };
}

function joinRemote(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

interface PullOptions {
  out?: string;
  keepZip?: boolean;
  shared?: boolean;
}

/** How long a presigned download may take to answer its HEADERS; the body has no deadline. */
const DOWNLOAD_HEADER_TIMEOUT_MS = 30_000;

/**
 * A throw from the disk side of the pipeline, as Node's fs raises it: a
 * `syscall` names the operation that failed (`open`, `write`, `mkdir`), which
 * a body that stopped mid-stream never carries. Full disk (ENOSPC), read-only
 * mount (EROFS), a folder this process may not write into (EACCES) all arrive
 * this way, and each is the caller's machine, not the network.
 */
function isLocalWriteFault(cause: unknown): boolean {
  // The cast claims nothing: `syscall` stays `unknown` and is only compared.
  return typeof (cause as { syscall?: unknown }).syscall === "string";
}

/**
 * Stream one HTTP body to a file. Written to `<destination>.part` and renamed
 * into place only once the whole body arrived: a connection that drops at 40 %
 * must not leave a fragment where the user's previous good file was, reading
 * as complete. On failure the part is removed and the error carries a category
 * — `connection-failed` when the body stopped, `local-failed` when the disk
 * refused, because the first says "retry" and the second says "make room".
 */
async function writeBody(
  body: ReadableStream<Uint8Array> | null,
  destination: string
): Promise<number> {
  if (body === null) throw failure("remote-error", `The server sent no body for ${destination}`);
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure(
      "local-failed",
      `${destination} could not be written${detail}`,
      "Pick another --out, or free the space it needs."
    );
  }
  const part = `${destination}.part`;
  try {
    await pipeline(Readable.fromWeb(body), fs.createWriteStream(part));
  } catch (cause) {
    fs.rmSync(part, { force: true });
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    if (isLocalWriteFault(cause)) {
      throw failure(
        "local-failed",
        `${destination} could not be written${detail}`,
        "Pick another --out, or free the space it needs."
      );
    }
    throw failure("connection-failed", `Download of ${destination} stopped mid-stream${detail}`);
  }
  // The rename can refuse too — a directory already at the destination
  // (EISDIR), a file another process holds open on Windows (EPERM) — and a
  // `.part` left behind then would be the fragment the help text promises
  // never exists.
  try {
    fs.renameSync(part, destination);
  } catch (cause) {
    fs.rmSync(part, { force: true });
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure(
      "local-failed",
      `Downloaded ${destination} but could not put it in place${detail}`,
      "Pick another --out, or move what is at that path away."
    );
  }
  return fs.statSync(destination).size;
}

/**
 * `fetch` with a deadline on the HEADERS only, mirroring the SDK's own door: a
 * black-holed host must not hang the run forever, and a slow body must not be
 * cut short. The controller is released as soon as headers arrive.
 */
async function fetchWithHeaderDeadline(url: string, what: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_HEADER_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure("connection-failed", `Could not download ${what}${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

/** One named file's bytes, by its presigned link, written by base name under `out`. */
async function pullFile(
  link: { path: string; url: string },
  out: string
): Promise<{ path: string; local: string; bytes: number }> {
  const local = path.join(out, path.basename(link.path));
  const res = await fetchWithHeaderDeadline(link.url, link.path);
  if (!res.ok) {
    throw failure("remote-error", `Download of ${link.path} answered HTTP ${res.status}`);
  }
  const bytes = await writeBody(res.body, local);
  return { path: link.path, local, bytes };
}

/** The folder as one ZIP, saved then unpacked in place; the ZIP is removed unless asked to stay. */
async function pullFolder(
  client: ReturnType<typeof createClient>,
  slug: string,
  folder: string,
  out: string,
  opts: { workspaceId?: string; keepZip: boolean }
): Promise<{ zip: string; bytes: number; kept: boolean }> {
  const res = await client.workspaces.downloadFolderArchive(slug, {
    path: folder === "" ? undefined : folder,
    workspaceId: opts.workspaceId
  });
  const zip = path.join(out, `${folder === "" ? slug : path.basename(folder)}.zip`);
  const bytes = await writeBody(res.body, zip);
  const unpack = unpackCommand(process.platform, zip, out);
  try {
    execFileSync(unpack.file, unpack.args, { stdio: "pipe" });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure(
      "local-failed",
      `Could not unpack ${zip} with ${unpack.file}${detail}`,
      `The archive is intact at ${zip}; unpack it by hand, or install ${unpack.file}.`
    );
  }
  if (opts.keepZip) return { zip, bytes, kept: true };
  // Every file is already on disk; a zip that cannot be removed (an indexer or
  // scanner holding it) is a leftover to mention, never a failed pull.
  try {
    fs.unlinkSync(zip);
  } catch {
    return { zip, bytes, kept: true };
  }
  return { zip, bytes, kept: false };
}

/** Two named files with one base name would overwrite each other under `out`. */
function duplicateBaseName(files: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const file of files) {
    const base = path.basename(file);
    if (seen.has(base)) return base;
    seen.add(base);
  }
  return undefined;
}

async function runPull(
  source: string,
  files: string[],
  opts: PullOptions,
  program: Command
): Promise<number> {
  const { slug, folder } = parseSource(source);
  const out = path.resolve(opts.out ?? ".");
  const duplicate = duplicateBaseName(files);
  if (duplicate !== undefined) {
    return refuse(
      `Two files would land on "${path.join(out, duplicate)}"`,
      "Pull them in two runs, or into two --out folders."
    );
  }
  // `--out` is created at the first successful byte (`writeBody`), never here:
  // a refused run leaves the disk as it found it.

  const client = createClient(program.optsWithGlobals());
  const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
  const target = { client, slug, folder, out, workspaceId };
  return files.length === 0 ? runFolderPull(target, !!opts.keepZip) : runFilePull(target, files);
}

type PulledFile = Awaited<ReturnType<typeof pullFile>>;

interface PullTarget {
  client: ReturnType<typeof createClient>;
  slug: string;
  folder: string;
  out: string;
  workspaceId: string | undefined;
}

async function runFolderPull(t: PullTarget, keepZip: boolean): Promise<number> {
  const archive = await pullFolder(t.client, t.slug, t.folder, t.out, {
    workspaceId: t.workspaceId,
    keepZip
  });
  printSuccess(`Pulled "${t.slug}${t.folder === "" ? "" : `:${t.folder}`}" into ${t.out}`, {
    bytes: archive.bytes,
    ...(archive.kept ? { zip: archive.zip } : {})
  });
  if (archive.kept && !keepZip && !isJsonMode()) {
    console.log(color.yellow(`  The archive could not be removed and was left at ${archive.zip}`));
  }
  return EXIT_CODES.success;
}

async function runFilePull(t: PullTarget, files: readonly string[]): Promise<number> {
  // Every link first, so a file that does not exist refuses the whole run
  // before any byte lands — "fails loud, not partial" starts here. A link is
  // not a download: nothing is on disk yet, and the server has written nothing.
  const links = await Promise.all(
    files.map(async (file) => {
      const remotePath = joinRemote(t.folder, file);
      const { url } = await t.client.workspaces.getFileUrl(t.slug, remotePath, {
        workspaceId: t.workspaceId
      });
      return { path: remotePath, url };
    })
  );
  // The downloads are settled TOGETHER: `Promise.all` would print the first
  // failure while its siblings kept streaming and landed files after the
  // document was written. Every download finishes before anything is said, and
  // a failure names what landed beside it.
  const settled = await Promise.allSettled(links.map((link) => pullFile(link, t.out)));
  const failed = settled.find(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );
  if (failed !== undefined) {
    const landed = settled
      .filter((entry): entry is PromiseFulfilledResult<PulledFile> => entry.status === "fulfilled")
      .map((entry) => entry.value.local);
    if (landed.length > 0 && failed.reason instanceof Error) {
      failed.reason.message += ` (already on disk: ${landed.join(", ")})`;
    }
    throw failed.reason;
  }
  const pulled = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
  printSuccess(
    `Pulled ${pulled.length} file${pulled.length === 1 ? "" : "s"} from "${t.slug}" into ${t.out}`,
    { files: pulled.map((entry) => entry.path) }
  );
  // Human channel only: under --json the document above is the whole of stdout.
  if (!isJsonMode()) {
    for (const entry of pulled) console.log(color.dim(`  ${entry.local}  (${entry.bytes} B)`));
  }
  return EXIT_CODES.success;
}

export function registerWorkspacePullCommand(ws: Command, program: Command): void {
  const pull = ws
    .command("pull")
    .description("Download a workspace folder or named files onto this machine without mounting it")
    .argument("<source>", "Workspace slug, or <slug>:<folder> for a folder inside it")
    .argument(
      "[file...]",
      "Files to pull, relative to the folder; none pulls the whole folder as a ZIP"
    )
    .option("--out <dir>", "Where the files land (created if missing)", ".")
    .option("--keep-zip", "Leave the downloaded archive next to the unpacked files")
    .option(
      "--shared",
      "Pull from the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace pull support-docs --out ./support-docs          # the whole workspace
  $ nexus workspace pull support-docs:reports --out ./q3            # one folder and its subtree
  $ nexus workspace pull support-docs:reports q3.pdf q4.pdf         # two files, by name
  $ nexus workspace pull support-docs --out ./backup --keep-zip     # keep the archive too

THE MOUNT IS THE NORMAL WAY OUT; THIS IS FOR THE MACHINE THAT CANNOT MOUNT.
A folder comes down as ONE streamed ZIP and is unpacked with the system unzip
(macOS, Linux) or tar (Windows) UNDER ITS OWN NAME, like cp -r: "pull
docs:reports --out ./q3" lands as ./q3/reports/…, and a bare slug lands as
./<out>/<slug>/…. Named files come down one by one, in parallel, each written
directly under --out by its own name.

IT COPIES LIKE cp. A local file that exists is REPLACED, silently. Two named
files sharing a base name are refused before anything is fetched.

IT FAILS LOUD, NOT PARTIAL. Unlike push, nothing here is a mailbag: a folder
the server refuses (empty, or past 50 000 entries / 2 GB) or a file that does
not exist is an error document with its own exit category, never a row.

Notes:
  --json IS THE VERDICT DOCUMENT: {success, message, bytes} for a folder pull
  (plus zip when --keep-zip), {success, message, files} for named files.
  THE ARCHIVE IS SAVED FIRST, THEN UNPACKED. When unpacking fails the run exits
  local-failed and the ZIP stays where --out points, so nothing downloaded is
  lost; unpack it by hand. A download that stops mid-stream leaves NO file
  behind: bytes land in <name>.part and are renamed into place only when
  complete, so a file that exists is a whole file. A disk that refuses the
  write (full, read-only, not yours) exits local-failed, not connection-failed.
  A REFUSED RUN LEAVES THE DISK AS IT FOUND IT. --out is created at the first
  successful byte, never before.
  NOTHING IS RECORDED ABOUT WHAT WAS PULLED. A later "push --if-unchanged"
  will need that record; it is not written yet.`
    )
    .action(async (source: string, files: string[], opts: PullOptions) => {
      try {
        process.exitCode = await runPull(source, files, opts, program);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(pull, WORKSPACE_FOLDER_ARCHIVE_CONTRACT);
}
