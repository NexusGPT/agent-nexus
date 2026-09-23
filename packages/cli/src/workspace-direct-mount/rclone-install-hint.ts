/** How to make `--engine direct` work on this platform, and the way out on the one that has one. */
export function rcloneInstallHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return [
      "Install the OFFICIAL rclone binary from https://rclone.org/downloads/ — not Homebrew's, whose build",
      "refuses `rclone mount` on macOS — and ONE FUSE library:",
      "  macFUSE  https://macfuse.github.io  (a kernel extension; Apple Silicon approves it once in Recovery mode)",
      "  FUSE-T   https://www.fuse-t.org     (no kernel extension)",
      "Or drop --engine direct: the default engine needs nothing installed."
    ].join("\n");
  }
  if (platform === "win32") {
    return "Install rclone (winget install Rclone.Rclone) and WinFsp (https://winfsp.dev), then mount again.";
  }
  return (
    "Install rclone (sudo -v ; curl https://rclone.org/install.sh | sudo bash) and FUSE " +
    "(sudo apt-get install fuse3), then mount again."
  );
}
