import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyServerEntry,
  buildConfigBlock,
  buildServerEntry,
  McpConfigConflictError,
  McpConfigUnreadableError,
  resolveClientTarget
} from "./mcp-client-config";

/**
 * WRITING INTO SOMEBODY ELSE'S CONFIG FILE, AND THE TWO WAYS THAT DESTROYS WORK.
 *
 * `--apply` edits a file this CLI does not own. Two failure modes are silent and
 * both cost the user something they cannot get back from here:
 *
 *   · WRITING THE BLOCK ALONE deletes every other MCP server the host had, and
 *     the host's UI reports it as "those servers are gone", never as "the nexus
 *     installer removed them".
 *   · OVERWRITING AN UNPARSEABLE FILE discards a document the user still wants —
 *     a half-edited config is a file to fix, not a file to replace.
 *
 * So the merge is asserted against a file with a neighbour in it, and the
 * refusals are asserted to be refusals rather than a best effort.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-install-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("where each host keeps its server list", () => {
  it("puts claude-code's block in the project, and the other two under home", () => {
    const opts = { cwd: "/work/repo", home: "/home/ada", platform: "linux" as NodeJS.Platform };

    expect(resolveClientTarget("claude-code", opts).configPath).toBe("/work/repo/.mcp.json");
    expect(resolveClientTarget("cursor", opts).configPath).toBe("/home/ada/.cursor/mcp.json");
    expect(resolveClientTarget("claude-desktop", opts).configPath).toBe(
      "/home/ada/.config/Claude/claude_desktop_config.json"
    );
  });

  it("follows Claude Desktop's own path on macOS", () => {
    expect(
      resolveClientTarget("claude-desktop", {
        cwd: "/work",
        home: "/Users/ada",
        platform: "darwin"
      }).configPath
    ).toBe("/Users/ada/Library/Application Support/Claude/claude_desktop_config.json");
  });
});

describe("the block that gets emitted", () => {
  it("launches this CLI and carries NO api key", () => {
    const block = buildConfigBlock("nexus", buildServerEntry({ profile: "prod" }));

    expect(block).toEqual({
      mcpServers: { nexus: { command: "nexus", args: ["mcp", "serve", "--profile", "prod"] } }
    });
    // The whole point of `mcp serve`: the credential stays in the CLI's own
    // config, so a project-scoped .mcp.json can be committed without leaking one.
    expect(JSON.stringify(block)).not.toContain("nxs_");
    expect(JSON.stringify(block)).not.toContain("env");
  });

  it("omits the pin only when the caller asked to follow the active profile", () => {
    expect(buildServerEntry({}).args).toEqual(["mcp", "serve"]);
  });

  it("carries a base URL through, so a host can be pointed at another environment", () => {
    expect(buildServerEntry({ profile: "dev", baseUrl: "http://localhost:3001" }).args).toEqual([
      "mcp",
      "serve",
      "--profile",
      "dev",
      "--base-url",
      "http://localhost:3001"
    ]);
  });
});

describe("applying the block to a host's config", () => {
  const entry = { command: "nexus", args: ["mcp", "serve", "--profile", "prod"] };

  it("creates the file and its directory when neither exists", () => {
    const target = path.join(dir, "nested", "mcp.json");

    expect(applyServerEntry(target, "nexus", entry, { force: false })).toBe("created");
    expect(JSON.parse(fs.readFileSync(target, "utf-8"))).toEqual({ mcpServers: { nexus: entry } });
  });

  it("keeps every other server, and every unrelated key, that was already there", () => {
    const target = path.join(dir, "claude_desktop_config.json");
    fs.writeFileSync(
      target,
      JSON.stringify({
        globalShortcut: "Alt+Space",
        mcpServers: { filesystem: { command: "npx", args: ["-y", "server-filesystem"] } }
      })
    );

    expect(applyServerEntry(target, "nexus", entry, { force: false })).toBe("added");

    const written = JSON.parse(fs.readFileSync(target, "utf-8"));
    expect(written.globalShortcut).toBe("Alt+Space");
    expect(written.mcpServers.filesystem).toEqual({
      command: "npx",
      args: ["-y", "server-filesystem"]
    });
    expect(written.mcpServers.nexus).toEqual(entry);
  });

  it("refuses an entry that already exists, and replaces it only under --force", () => {
    const target = path.join(dir, ".mcp.json");
    const old = { command: "nexus-mcp", args: [] };
    fs.writeFileSync(target, JSON.stringify({ mcpServers: { nexus: old } }));

    expect(() => applyServerEntry(target, "nexus", entry, { force: false })).toThrow(
      McpConfigConflictError
    );
    // The refusal must not have written anything on its way out.
    expect(JSON.parse(fs.readFileSync(target, "utf-8")).mcpServers.nexus).toEqual(old);

    expect(applyServerEntry(target, "nexus", entry, { force: true })).toBe("replaced");
    expect(JSON.parse(fs.readFileSync(target, "utf-8")).mcpServers.nexus).toEqual(entry);
  });

  it("refuses a config file it cannot parse rather than discarding it", () => {
    const target = path.join(dir, ".mcp.json");
    fs.writeFileSync(target, "{ this is half-edited");

    expect(() => applyServerEntry(target, "nexus", entry, { force: true })).toThrow(
      McpConfigUnreadableError
    );
    expect(fs.readFileSync(target, "utf-8")).toBe("{ this is half-edited");
  });

  it("refuses a top level that is not an object, for the same reason", () => {
    const target = path.join(dir, ".mcp.json");
    fs.writeFileSync(target, "[]");

    expect(() => applyServerEntry(target, "nexus", entry, { force: true })).toThrow(
      McpConfigUnreadableError
    );
  });

  it("treats an empty file as no file, not as a parse failure", () => {
    const target = path.join(dir, ".mcp.json");
    fs.writeFileSync(target, "\n");

    expect(applyServerEntry(target, "nexus", entry, { force: false })).toBe("created");
  });

  it("replaces an mcpServers key that is not an object without losing the rest", () => {
    const target = path.join(dir, ".mcp.json");
    fs.writeFileSync(target, JSON.stringify({ mcpServers: null, other: 1 }));

    expect(applyServerEntry(target, "nexus", entry, { force: false })).toBe("added");
    const written = JSON.parse(fs.readFileSync(target, "utf-8"));
    expect(written.other).toBe(1);
    expect(written.mcpServers.nexus).toEqual(entry);
  });
});
