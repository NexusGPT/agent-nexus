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
}

/**
 * Load config from disk.
 * Supports both V1 (flat) and V2 (profiles) formats.
 * For V2, extracts the active profile's credentials.
 */
export function loadConfig(): NexusMcpConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // V2 format: extract the active profile
    if (parsed.profiles && typeof parsed.profiles === "object") {
      const activeName = (parsed.activeProfile as string) || "default";
      const profiles = parsed.profiles as Record<string, { apiKey?: string; baseUrl?: string }>;
      const profile = profiles[activeName];
      if (profile) {
        return { apiKey: profile.apiKey, baseUrl: profile.baseUrl };
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
 * If the config file is already V2, writes into the active profile.
 * Otherwise writes the flat V1 format (CLI will migrate on next run).
 */
export function saveConfig(config: NexusMcpConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  // Check if existing config is V2
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const existing = JSON.parse(raw) as Record<string, unknown>;

    if (existing.profiles && typeof existing.profiles === "object") {
      // V2: write into the active profile
      const activeName = (existing.activeProfile as string) || "default";
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

  throw new Error("No API key found. Set NEXUS_API_KEY or run: nexus-mcp login");
}
