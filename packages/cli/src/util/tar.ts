import { gunzipSync } from "node:zlib";

/**
 * A minimal, dependency-free reader for the gzipped tarballs GitHub serves from
 * `codeload.github.com/<owner>/<repo>/tar.gz/<ref>`.
 *
 * Same reasoning as `zip.ts`: the CLI publishes with one runtime dependency, and
 * the only tarball it ever reads is one GitHub generated. That narrows the
 * format enormously — GNU tar writes ustar headers, regular files and
 * directories only, no sparse files, no device nodes, no PAX records beyond the
 * long-name extension handled below.
 *
 * Reading, not extracting: entries are returned as buffers keyed by their path
 * inside the archive and never touch the filesystem, so there is no path
 * traversal surface here at all.
 */

/** One regular file inside the tarball. */
export interface TarEntry {
  path: string;
  content: Buffer;
}

const BLOCK_SIZE = 512;

/** Read a NUL-terminated ASCII field. */
function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

/**
 * Read a tar numeric field. Classic tar stores these as NUL/space-terminated
 * octal; GNU switches to a base-256 encoding (high bit of the first byte set)
 * for values that no longer fit, which is the only reason a plain `parseInt`
 * would be wrong here.
 */
function readNumber(block: Buffer, offset: number, length: number): number {
  const field = block.subarray(offset, offset + length);
  if (field.length > 0 && (field[0] & 0x80) !== 0) {
    let value = 0;
    for (let i = 1; i < field.length; i++) value = value * 256 + field[i];
    return value;
  }
  const text = readString(block, offset, length).trim();
  if (text.length === 0) return 0;
  const parsed = parseInt(text, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse a gzipped tar archive into its regular-file entries.
 *
 * Directory entries, symlinks and metadata records are skipped rather than
 * reported: a caller wanting "the files under `skills/pdf/`" has no use for
 * either, and silently dropping a symlink is the safe reading of an archive
 * whose contents are about to be repackaged and uploaded.
 */
export function readTarGz(gzipped: Buffer): TarEntry[] {
  const tar = gunzipSync(gzipped);
  const entries: TarEntry[] = [];
  let offset = 0;
  /** Set by a GNU `L` record, consumed by the header that follows it. */
  let pendingLongName: string | null = null;

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);

    // Two consecutive zero blocks terminate the archive; one is enough to stop.
    if (header.every((byte) => byte === 0)) break;

    const name = readString(header, 0, 100);
    const size = readNumber(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156]);
    const prefix = readString(header, 345, 155);

    offset += BLOCK_SIZE;
    const contentBlocks = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const content = tar.subarray(offset, offset + size);
    offset += contentBlocks;

    if (typeFlag === "L") {
      // GNU long-name record: the *next* header's name lives in this body.
      pendingLongName = content.toString("utf8").replace(/\0+$/, "");
      continue;
    }

    const fullName = pendingLongName ?? (prefix ? `${prefix}/${name}` : name);
    pendingLongName = null;

    // "0" and "\0" are the two spellings of a regular file. Everything else —
    // directories ("5"), symlinks ("2"), PAX headers ("x"/"g") — is skipped.
    if (typeFlag !== "0" && typeFlag !== "\0") continue;

    entries.push({ path: fullName, content: Buffer.from(content) });
  }

  return entries;
}
