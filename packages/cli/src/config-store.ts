import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NexusConfigV2 } from "./config-types";
import { warnIfLoosePermissions, writeSecretFile } from "./util/secret-file";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * ⚠️ RESOLVED ONCE, AT MODULE LOAD, from `os.homedir()`. Several suites move
 * `HOME` in a `vi.hoisted` block BEFORE importing `./config` for exactly this
 * reason — a `beforeEach` is too late and the suite would read, and write, the
 * developer's real profiles.
 */
const CONFIG_DIR = path.join(os.homedir(), ".nexus-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/** V1 (legacy) flat config — used only for migration detection. */
interface NexusConfigV1 {
  apiKey?: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Config file I/O — shared with @agent-nexus/mcp-server
// ---------------------------------------------------------------------------

/**
 * Whether `config.json` is ABSENT, readable, or there and unreadable.
 *
 * 🔴 {@link loadConfig} cannot answer this and must not be changed to: it
 * returns an empty config for a missing file AND for a damaged one, which is
 * right for its callers — they want a config or a blank slate. It is wrong for
 * anyone DIAGNOSING, because "you have no profiles" and "I could not read your
 * profiles" lead to opposite advice, and the advice for the first one
 * (`nexus auth login`) writes a fresh config over the file that was merely
 * unreadable, taking every other profile with it.
 *
 * Parses rather than stats, because a truncated file exists and still cannot be
 * read. No migration and no permission warning: this answers one question.
 */
export function configFileState(): "absent" | "readable" | "unreadable" {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return code === "ENOENT" ? "absent" : "unreadable";
  }
  try {
    JSON.parse(raw);
    return "readable";
  } catch {
    return "unreadable";
  }
}

/**
 * Load config from disk. Auto-migrates V1 → V2 on first read.
 * Returns an empty V2 config if the file doesn't exist.
 */
export function loadConfig(): NexusConfigV2 {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    // The file holds an API key in plaintext. A loose mode found HERE is a past
    // exposure the write path's chmod cannot undo, so it is said out loud once.
    warnIfLoosePermissions(CONFIG_FILE);
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // V2 format: has "profiles" key
    if ("profiles" in parsed && typeof parsed.profiles === "object") {
      return parsed as unknown as NexusConfigV2;
    }

    // V1 format: flat { apiKey, baseUrl } — migrate to V2
    const v1 = parsed as NexusConfigV1;
    if (v1.apiKey) {
      const migrated: NexusConfigV2 = {
        activeProfile: "default",
        profiles: {
          default: {
            apiKey: v1.apiKey,
            ...(v1.baseUrl ? { baseUrl: v1.baseUrl } : {})
          }
        }
      };
      saveConfig(migrated);
      return migrated;
    }

    return emptyConfig();
  } catch {
    return emptyConfig();
  }
}

/**
 * Write V2 config to disk, owner-readable only.
 *
 * `writeSecretFile` rather than a `mode:` argument: a `mode:` is honoured only
 * when the path has to be CREATED, so it left an already-0644 config file
 * world-readable through every login. See `util/secret-file.ts`.
 */
export function saveConfig(config: NexusConfigV2): void {
  writeSecretFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

/** Delete the config file entirely. */
export function clearConfig(): void {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {
    /* ignore */
  }
}

function emptyConfig(): NexusConfigV2 {
  return { activeProfile: "", profiles: {} };
}
