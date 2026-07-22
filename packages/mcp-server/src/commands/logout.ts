import { loadConfig, saveConfig } from "../config";

/**
 * Remove the stored API key from the config file.
 */
export async function logoutCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.apiKey) {
    console.log("No stored credentials found.");
    return;
  }

  delete config.apiKey;
  saveConfig(config);
  console.log("Logged out. API key removed from ~/.nexus-mcp/config.json");
}
