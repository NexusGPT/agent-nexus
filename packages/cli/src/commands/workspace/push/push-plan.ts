export interface PushEntry {
  /** Absolute path on this machine. */
  localPath: string;
  /** Workspace-relative destination, no leading slash. */
  remotePath: string;
  size: number;
}

export interface PushPlan {
  entries: PushEntry[];
  /** Walked names starting with `.` that were left out (none with `--include-hidden`). */
  hiddenSkipped: number;
  /** Files at or above {@link PACK_MAX_BYTES}: they cannot fit a pack, so the run refuses. */
  oversized: PushEntry[];
  /**
   * Two sources landing on one destination — `./a/report.pdf ./b/report.pdf`
   * both become `report.pdf`. Sent together they would race on one key and
   * both rows would say success, so the run refuses before any request.
   */
  duplicates: { remotePath: string; first: string; second: string }[];
  /** Walked symlinks whose target does not exist: nothing to read, so the run refuses. */
  dangling: string[];
  /**
   * Walked directory symlinks that lead back into a folder already on the
   * walk (`sub/up -> ..`): followed like `cp -L` they never end, so the run
   * refuses and names the link.
   */
  loops: string[];
  /**
   * Destinations the server's path rules refuse (a backslash in a name, a
   * segment over 255 characters): sent, the whole pack came back 400 naming
   * `paths[N]`, so the run refuses first and names the file and the rule.
   */
  invalid: { localPath: string; remotePath: string; reason: string }[];
  /**
   * Files this process cannot read (mode 000, another owner): `stat` admits
   * them and the read at send time throws, which bounced the whole pack. The
   * run refuses first.
   */
  unreadable: string[];
}
