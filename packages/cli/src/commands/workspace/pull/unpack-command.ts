/** How the archive is unpacked on this platform: the binary and the argv that extracts `zip` into `dir`. */
export function unpackCommand(
  platform: NodeJS.Platform,
  zip: string,
  dir: string
): { file: string; args: string[] } {
  if (platform === "win32") return { file: "tar", args: ["-xf", zip, "-C", dir] };
  return { file: "unzip", args: ["-o", "-q", zip, "-d", dir] };
}
