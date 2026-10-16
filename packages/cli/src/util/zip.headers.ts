/**
 * The three ZIP record layouts, in one leaf.
 *
 * A ZIP that only has to be read back by a conformant reader needs exactly
 * three record types, and every one of them is a fixed-width little-endian
 * struct whose fields have to agree across two of the three. Writing them side
 * by side is what makes that agreement checkable by eye: the local header and
 * the central-directory header carry the SAME method, crc, sizes and name
 * length, and a disagreement between them is the one class of bug a reader
 * reports as a corrupt archive rather than as wrong content.
 */

/** 1980-01-01 00:00:00 in DOS date/time format — the epoch of the ZIP format. */
const DOS_EPOCH_TIME = 0;
const DOS_EPOCH_DATE = 0x0021;

/** Every size and offset field below is 32 bits. ZIP64 is deliberately out of scope. */
export const MAX_UINT32 = 0xffffffff;

/** The per-entry fields the two headers must agree on. */
export interface ZipRecordFields {
  /** 0 = stored, 8 = deflate. */
  method: number;
  crc: number;
  /** Bytes actually written for this entry — deflated, or the original when stored. */
  compressedSize: number;
  uncompressedSize: number;
  /** UTF-8 bytes of the normalized member name. */
  nameLength: number;
}

/** The 30-byte local file header that precedes an entry's name and payload. */
export function localFileHeader(fields: ZipRecordFields): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed to extract (2.0)
  // Bit 11 = filename is UTF-8. Without it a reader is entitled to decode the
  // name as CP437, which mangles any non-ASCII path.
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(fields.method, 8);
  local.writeUInt16LE(DOS_EPOCH_TIME, 10);
  local.writeUInt16LE(DOS_EPOCH_DATE, 12);
  local.writeUInt32LE(fields.crc, 14);
  local.writeUInt32LE(fields.compressedSize, 18);
  local.writeUInt32LE(fields.uncompressedSize, 22);
  local.writeUInt16LE(fields.nameLength, 26);
  local.writeUInt16LE(0, 28); // extra field length
  return local;
}

/** The 46-byte central-directory header, pointing back at `localOffset`. */
export function centralDirectoryHeader(fields: ZipRecordFields, localOffset: number): Buffer {
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory header signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed to extract
  central.writeUInt16LE(0x0800, 8); // UTF-8 flag
  central.writeUInt16LE(fields.method, 10);
  central.writeUInt16LE(DOS_EPOCH_TIME, 12);
  central.writeUInt16LE(DOS_EPOCH_DATE, 14);
  central.writeUInt32LE(fields.crc, 16);
  central.writeUInt32LE(fields.compressedSize, 20);
  central.writeUInt32LE(fields.uncompressedSize, 24);
  central.writeUInt16LE(fields.nameLength, 28);
  central.writeUInt16LE(0, 30); // extra field length
  central.writeUInt16LE(0, 32); // file comment length
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal file attributes
  // External attributes: 0644 regular file, shifted into the high 16 bits the
  // way unix zip writers do, so extraction on POSIX yields a readable file.
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(localOffset, 42);
  return central;
}

/** The 22-byte end-of-central-directory record that closes the archive. */
export function endOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // this disk number
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return end;
}
