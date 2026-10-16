import { deflateRawSync } from "node:zlib";

import { crc32 } from "./zip.crc32";
import {
  centralDirectoryHeader,
  endOfCentralDirectory,
  localFileHeader,
  MAX_UINT32
} from "./zip.headers";
import { normalizeZipPath } from "./zip.normalize-path";

/**
 * A minimal, dependency-free ZIP writer.
 *
 * The CLI ships with exactly one runtime dependency (`commander`) and is
 * published to npm for end users, so pulling in an archiver to turn a skill
 * folder into the ZIP the API expects would be a disproportionate cost. Writing
 * the format directly is short because a ZIP that only has to be READ back by a
 * conformant reader (JSZip, on the server) needs just three record types: a
 * local file header per entry, a central-directory header per entry, and one
 * end-of-central-directory record. Those three layouts are `zip.headers.ts`;
 * this file is the assembly order and the size arithmetic.
 *
 * Deliberately out of scope:
 *   - **ZIP64.** Entries and archives are bounded far below 4 GB by the API
 *     (5 MB per upload, 20 MB uncompressed, 500 files), so the 32-bit fields
 *     always fit. `createZip` throws rather than silently truncating if that
 *     assumption is ever violated.
 *   - **Directory entries.** A ZIP is a flat list of paths; readers derive the
 *     tree from the slashes. JSZip does, and the server unwraps a single
 *     top-level folder by path prefix, so empty directory records would be
 *     noise (and an empty directory cannot carry a skill file anyway).
 *   - **Timestamps.** Every entry is stamped with a fixed DOS date rather than
 *     the file's mtime, so zipping the same tree twice produces byte-identical
 *     output. Reproducibility is worth more here than an mtime nothing reads.
 */

// `normalizeZipPath` alone: it is part of this module's surface and
// `zip.test.ts` exercises it directly. `crc32` and the three record layouts
// stay private to the writer — exporting them from here would widen the
// surface for no caller.
export { normalizeZipPath } from "./zip.normalize-path";

/** One file destined for the archive. `path` uses forward slashes, no leading `/`. */
export interface ZipEntry {
  path: string;
  content: Buffer;
}

/**
 * Pack `entries` into a ZIP archive.
 *
 * Each entry is deflated, and stored uncompressed instead whenever deflating
 * made it bigger — which happens for already-compressed payloads (a PNG, a
 * nested archive) where the deflate wrapper is pure overhead.
 */
export function createZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(normalizeZipPath(entry.path), "utf8");
    const crc = crc32(entry.content);
    const deflated = deflateRawSync(entry.content);
    // Method 8 (deflate) unless STOREing is smaller — the reader honours both.
    const stored = deflated.length >= entry.content.length;
    const payload = stored ? entry.content : deflated;

    if (payload.length > MAX_UINT32 || entry.content.length > MAX_UINT32) {
      throw new Error(`Entry "${entry.path}" is too large for a non-ZIP64 archive.`);
    }

    const fields = {
      method: stored ? 0 : 8,
      crc,
      compressedSize: payload.length,
      uncompressedSize: entry.content.length,
      nameLength: nameBytes.length
    };

    const local = localFileHeader(fields);
    localParts.push(local, nameBytes, payload);
    centralParts.push(centralDirectoryHeader(fields, offset), nameBytes);

    offset += local.length + nameBytes.length + payload.length;
    entryCount += 1;

    if (offset > MAX_UINT32) {
      throw new Error("Archive is too large for a non-ZIP64 ZIP.");
    }
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = endOfCentralDirectory(entryCount, centralDirectory.length, offset);

  return Buffer.concat([...localParts, centralDirectory, end]);
}
