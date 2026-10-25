/** How to make `--engine direct` work on this platform, and the way out on the one that has one. */
export function rcloneInstallHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return [
      "Install the OFFICIAL rclone binary from https://rclone.org/downloads/ — not Homebrew's, whose build",
      "refuses `rclone mount` on macOS — and ONE FUSE library:",
      "  macFUSE  https://macfuse.github.io  (a kernel extension; Apple Silicon approves it once in Recovery mode)",
      "  FUSE-T   https://www.fuse-t.org     (no kernel extension)",
      "Or mount with --engine webdav: it needs nothing installed."
    ].join("\n");
  }
  if (platform === "win32") {
    return [
      "Mount again and answer y: the mount installs rclone.exe into %USERPROFILE%\\.nexus-mcp\\bin (no",
      "administrator) and WinFsp — WinFsp needs an administrator, one UAC prompt. By hand: put the official",
      "rclone.exe from https://rclone.org/downloads/ at that path, and install WinFsp from",
      "https://winfsp.dev. An rclone found on PATH is not used on Windows."
    ].join("\n");
  }
  return (
    "Install rclone (sudo -v ; curl https://rclone.org/install.sh | sudo bash) and FUSE " +
    "(sudo apt-get install fuse3), then mount again."
  );
}
