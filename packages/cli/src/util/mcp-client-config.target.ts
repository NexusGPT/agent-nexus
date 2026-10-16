import os from "node:os";
import path from "node:path";

import type { McpClient } from "./mcp-client-config.clients";

/** Where one host keeps its server list, and what that file is to a human. */
export interface McpClientTarget {
  readonly client: McpClient;
  /** Absolute path of the file the block belongs in. */
  readonly configPath: string;
  /** What that file is, for a human reading the output. */
  readonly scope: string;
}

/**
 * Claude Desktop's config path, which is the only one that varies by platform.
 *
 * `APPDATA` rather than a constructed `C:\Users\…`: the variable is what the app
 * itself reads, and a roaming profile puts it somewhere else entirely.
 */
function claudeDesktopConfigPath(home: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

/**
 * Resolve where a client's block goes.
 *
 * `cwd` and `home` are parameters rather than reads of `process`, because the
 * spec beside this file drives every branch against a temporary directory —
 * a resolver that read the environment could only be tested on the machine that
 * happened to run it.
 */
export function resolveClientTarget(
  client: McpClient,
  opts: { cwd: string; home: string; platform: NodeJS.Platform }
): McpClientTarget {
  switch (client) {
    case "claude-code":
      return {
        client,
        configPath: path.join(opts.cwd, ".mcp.json"),
        scope: "this project (checked in beside your code)"
      };
    case "cursor":
      return {
        client,
        configPath: path.join(opts.home, ".cursor", "mcp.json"),
        scope: "your user account (every Cursor project)"
      };
    case "claude-desktop":
      return {
        client,
        configPath: claudeDesktopConfigPath(opts.home, opts.platform),
        scope: "your user account (the desktop app)"
      };
  }
}

/** The default `home` for the binary. Split out so a spec can hand its own. */
export function defaultHome(): string {
  return os.homedir();
}
