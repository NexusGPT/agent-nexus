/**
 * CRC-32 (IEEE 802.3) over a buffer — the checksum a ZIP local-file header and
 * its central-directory twin both carry.
 *
 * It sits in its own leaf because it is the one piece of `createZip` that is
 * not about the ZIP container at all: it is a standard checksum with a standard
 * answer, so it is testable against any other implementation of the same
 * polynomial without constructing an archive.
 */

/** The table, built once on first use rather than at module load. */
let crcTable: Uint32Array | null = null;

export function crc32(buffer: Buffer): number {
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
