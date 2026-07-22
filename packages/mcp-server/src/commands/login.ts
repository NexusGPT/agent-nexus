import { exec } from "node:child_process";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

import { loadConfig, resolveBaseUrl, saveConfig } from "../config";

const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";

/**
 * Interactive login flow:
 *   1. Opens the API keys settings page in the browser
 *   2. Prompts for the API key
 *   3. Validates it against the API
 *   4. Saves to ~/.nexus-mcp/config.json
 */
export async function loginCommand(args: string[]): Promise<void> {
  const envIndex = args.indexOf("--env");
  const envValue = envIndex !== -1 ? args[envIndex + 1] : undefined;

  // Pre-set dev base URL if requested
  const config = loadConfig();
  if (envValue) config.baseUrl = envValue === "dev" ? "http://localhost:3001" : undefined;
  const baseUrl = config.baseUrl ?? resolveBaseUrl();

  // Step 1: Open browser to settings page
  console.log(`Opening ${SETTINGS_URL} ...`);
  console.log("Create or copy an API key from the settings page.\n");
  openUrl(SETTINGS_URL);

  // Step 2: Prompt for the key
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const apiKey = (await rl.question("Paste your API key (nxs_...): ")).trim();

    if (!apiKey) {
      console.error("No key entered. Aborting.");
      process.exitCode = 1;
      return;
    }

    if (!apiKey.startsWith("nxs_")) {
      console.error('Invalid key format — API keys start with "nxs_".');
      process.exitCode = 1;
      return;
    }

    // Step 3: Validate the key with a lightweight API call
    console.log("Validating...");
    const res = await fetch(`${baseUrl}/api/public/v1/agents?limit=1`, {
      headers: { "api-key": apiKey, Accept: "application/json" }
    });

    if (!res.ok) {
      console.error(`Validation failed (HTTP ${res.status}). Check your key and try again.`);
      process.exitCode = 1;
      return;
    }

    // Step 4: Save
    config.apiKey = apiKey;
    saveConfig(config);
    console.log("Logged in successfully. Config saved to ~/.nexus-mcp/config.json");
  } finally {
    rl.close();
  }
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}
