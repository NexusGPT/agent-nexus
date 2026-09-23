// `rclone version` succeeding proves nothing about `rclone mount`: Homebrew's
// macOS build ships without the FUSE code and refuses to mount at runtime. It
// prints `go/tags: none` where the official binary prints `go/tags: cmount`,
// so the token is the capability and this parses the tag list. The command
// side runs the binary and the FUSE probes — see
// `commands/workspace-mount/assert-rclone-can-mount.ts`; the verdict lives
// here so a test can pin it without a PATH.
export type RcloneBuildVerdict = "mount-capable" | "no-mount-support" | "no-tags-line";

export function rcloneBuildVerdict(versionOutput: string): RcloneBuildVerdict {
  const match = /^-?[ \t]*go\/tags:[ \t]*(.*)$/m.exec(versionOutput);
  if (match === null) return "no-tags-line";
  const tags = match[1].trim().split(/[\s,]+/);
  return tags.includes("cmount") ? "mount-capable" : "no-mount-support";
}
