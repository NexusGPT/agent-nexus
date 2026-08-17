import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// URL map
// ---------------------------------------------------------------------------

const URL_MAP: Record<string, string> = {
  production: "https://api.nexusgpt.io",
  dev: "http://localhost:3001"
};

// ---------------------------------------------------------------------------
// Config file I/O
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".nexus-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface NexusMcpConfig {
  apiKey?: string;
  baseUrl?: string;
  /**
   * The organization the profile acts on, stored by `nexus auth use-org`.
   *
   * Only meaningful for an org-unbound token (`nxs_p_`, `nxs_o_`), which carries
   * no organization of its own — the one it acts on is whichever the
   * `organization-id` header names. See {@link resolveOrganizationId}.
   */
  orgId?: string;
}

/**
 * WHICH PROFILE THIS PROCESS IS ON. Read by BOTH the loader and the writer.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ONE FUNCTION, BECAUSE TWO ANSWERS MUTATE THE WRONG PROFILE IN SILENCE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `loadConfig` honours `NEXUS_PROFILE`; `saveConfig` used to write the ACTIVE
 * profile unconditionally. With the variable set those are different entries, and
 * every write in this package is a read-modify-write:
 *
 *   NEXUS_PROFILE=staging nexus-mcp logout
 *     → reads `staging`, finds its key, deletes it,
 *     → writes the result into `production`.
 *
 * The key the operator asked to remove is still there and the one they were using
 * elsewhere is gone. `login` has the same shape, storing a freshly pasted key on
 * a profile nobody named. Neither prints anything to say so.
 *
 * `NEXUS_PROFILE` outranks the active profile because that is the CLI's own
 * precedence (`resolveProfile`, level 4 above level 6) — the per-shell selector
 * beats the machine-global one. The two binaries share this file, so a
 * disagreement about which entry it means is a disagreement about which
 * organization a tool call lands in.
 */
function selectedProfileName(parsed: Record<string, unknown>): string {
  return process.env.NEXUS_PROFILE || (parsed.activeProfile as string) || "default";
}

/**
 * Load config from disk.
 * Supports both V1 (flat) and V2 (profiles) formats.
 * For V2, extracts the selected profile's credentials.
 *
 * ⚠️ THE FILE IS SHARED WITH `@agent-nexus/cli`, WHICH IS ALSO ITS WRITER. This
 * reader is deliberately the narrower one — it has no `--profile` flag and no
 * `.nexusrc` walk — but the two levels it CAN honour, `NEXUS_PROFILE` and the
 * active profile, must agree with the CLI's own precedence or the same config
 * file means two different things depending on which binary read it.
 *
 * 🚨 PREFER `nexus mcp serve`. It is this bridge on the CLI's full resolution —
 * `--profile`, `NEXUS_PROFILE`, `.nexusrc`, the active profile — with no second
 * login and no second credential store (NEX-3022). This package remains for
 * hosts already configured against it.
 */
export function loadConfig(): NexusMcpConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // V2 format: extract the selected profile
    if (parsed.profiles && typeof parsed.profiles === "object") {
      const activeName = selectedProfileName(parsed);
      const profiles = parsed.profiles as Record<
        string,
        { apiKey?: string; baseUrl?: string; orgId?: string }
      >;
      const profile = profiles[activeName];
      if (profile) {
        return { apiKey: profile.apiKey, baseUrl: profile.baseUrl, orgId: profile.orgId };
      }
      return {};
    }

    // V1 format: use as-is
    return parsed as NexusMcpConfig;
  } catch {
    return {};
  }
}

/**
 * Save config to disk.
 * If the config file is already V2, writes into the SELECTED profile — the same
 * one {@link loadConfig} read, never a second opinion about which that is; see
 * {@link selectedProfileName} for what the disagreement cost.
 * Otherwise writes the flat V1 format (CLI will migrate on next run).
 */
export function saveConfig(config: NexusMcpConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  // Check if existing config is V2
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const existing = JSON.parse(raw) as Record<string, unknown>;

    if (existing.profiles && typeof existing.profiles === "object") {
      // V2: write into the profile this process is ON, which is the profile the
      // caller's `loadConfig()` just read.
      const activeName = selectedProfileName(existing);
      const profiles = existing.profiles as Record<string, Record<string, unknown>>;
      profiles[activeName] = {
        ...(profiles[activeName] ?? {}),
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {})
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2) + "\n", {
        mode: 0o600
      });
      return;
    }
  } catch {
    // No existing config or parse error — write V1
  }

  // Write V1 format
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600
  });
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the API base URL.
 * Priority: NEXUS_BASE_URL env → config file → NEXUS_ENV-based URL → production default
 */
export function resolveBaseUrl(): string {
  if (process.env.NEXUS_BASE_URL) return process.env.NEXUS_BASE_URL;

  const config = loadConfig();
  if (config.baseUrl) return config.baseUrl;

  const env = process.env.NEXUS_ENV ?? "production";
  return URL_MAP[env] ?? URL_MAP.production;
}

/**
 * Resolve the API key.
 * Priority: NEXUS_API_KEY env → config file → throw with helpful message
 */
export function resolveApiKey(): string {
  if (process.env.NEXUS_API_KEY) return process.env.NEXUS_API_KEY;

  const config = loadConfig();
  if (config.apiKey) return config.apiKey;

  throw new Error(
    "No API key found. Set NEXUS_API_KEY, run `nexus auth login` and use `nexus mcp serve`, " +
      "or run: nexus-mcp login"
  );
}

/**
 * Resolve the organization the `organization-id` header will name.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 OMITTING THIS HEADER SENT TOOL CALLS TO ANOTHER TENANT, SILENTLY (NEX-3022)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A personal cross-org token (`nxs_p_`) or a platform-operator token (`nxs_o_`)
 * belongs to no single organization. The one it acts on is whichever
 * `organization-id` names, and `nexus auth use-org` is what stores that on the
 * profile. This bridge sent `api-key` and nothing else, so every tool call under
 * such a key ran against the organization the SERVER defaults to, while
 * `nexus agent list` in the same shell — same key, same config file — ran
 * against the selected one. Reads answered from another tenant and writes landed
 * in it, and neither surface said so.
 *
 * Precedence mirrors the CLI's `resolveOrganization` exactly: the environment
 * variable is the per-shell selector and outranks the profile, which is
 * machine-global. For an ORG-SCOPED key the header is accepted only while it
 * names that key's own organization — which is the ordinary case, since login
 * stores `orgId` from the key itself.
 */
export function resolveOrganizationId(): string | undefined {
  if (process.env.NEXUS_ORGANIZATION_ID) return process.env.NEXUS_ORGANIZATION_ID;
  return loadConfig().orgId;
}
