import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { failure } from "../../../errors";

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
export async function writeBody(
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
