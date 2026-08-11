import { deflateRawSync } from "node:zlib";

/**
 * A minimal, dependency-free ZIP writer.
 *
 * The CLI ships with exactly one runtime dependency (`commander`) and is
 * published to npm for end users, so pulling in an archiver to turn a skill
 * folder into the ZIP the API expects would be a disproportionate cost. Writing
 * the format directly is ~80 lines because a ZIP that only has to be READ back
 * by a conformant reader (JSZip, on the server) needs just three record types:
 * a local file header per entry, a central-directory header per entry, and one
 * end-of-central-directory record.
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

/** One file destined for the archive. `path` uses forward slashes, no leading `/`. */
export interface ZipEntry {
  path: string;
  content: Buffer;
}

/** 1980-01-01 00:00:00 in DOS date/time format — the epoch of the ZIP format. */
const DOS_EPOCH_TIME = 0;
const DOS_EPOCH_DATE = 0x0021;

const MAX_UINT32 = 0xffffffff;

/** CRC-32 (IEEE 802.3), table built once on first use. */
let crcTable: Uint32Array | null = null;

function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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
    const method = stored ? 0 : 8;

    if (payload.length > MAX_UINT32 || entry.content.length > MAX_UINT32) {
      throw new Error(`Entry "${entry.path}" is too large for a non-ZIP64 archive.`);
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    // Bit 11 = filename is UTF-8. Without it a reader is entitled to decode the
    // name as CP437, which mangles any non-ASCII path.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_EPOCH_TIME, 10);
    local.writeUInt16LE(DOS_EPOCH_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    localParts.push(local, nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0x0800, 8); // UTF-8 flag
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_EPOCH_TIME, 12);
    central.writeUInt16LE(DOS_EPOCH_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal file attributes
    // External attributes: 0644 regular file, shifted into the high 16 bits the
    // way unix zip writers do, so extraction on POSIX yields a readable file.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + payload.length;
    entryCount += 1;

    if (offset > MAX_UINT32) {
      throw new Error("Archive is too large for a non-ZIP64 ZIP.");
    }
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk number
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/**
 * Normalize a path for storage in the archive: forward slashes, no leading
 * slash, no `.`/`..` segments.
 *
 * Rejecting traversal here rather than trusting the server is the point — this
 * is the only place the CLI turns a local filesystem path into an archive
 * member name, so a symlinked or crafted path is caught before it is written
 * into a bundle someone else later extracts.
 */
export function normalizeZipPath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Invalid archive path: "${inputPath}"`);
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`Invalid archive path (relative segment): "${inputPath}"`);
    }
    if (segment.includes("\0")) {
      throw new Error(`Invalid archive path (null byte): "${inputPath}"`);
    }
  }
  return segments.join("/");
}
