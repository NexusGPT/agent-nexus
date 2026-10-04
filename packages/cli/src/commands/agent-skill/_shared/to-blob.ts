/** Wrap a packed skill archive as the `Blob` the upload routes take. */
export function toBlob(buffer: Buffer): Blob {
  return new Blob([new Uint8Array(buffer)], { type: "application/zip" });
}
