import { loadConfig, resolveBaseUrl } from "../config";

/**
 * Print the current configuration: base URL, masked API key, env.
 */
export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();
  const baseUrl = resolveBaseUrl();

  // Determine URL source
  let urlSource = "default (production)";
  if (process.env.NEXUS_BASE_URL) urlSource = "NEXUS_BASE_URL env";
  else if (config.baseUrl) urlSource = "config file";
  else if (process.env.NEXUS_ENV) urlSource = `NEXUS_ENV=${process.env.NEXUS_ENV}`;

  // Determine API key source + mask
  let keyDisplay = "(none)";
  let keySource = "";
  if (process.env.NEXUS_API_KEY) {
    keyDisplay = mask(process.env.NEXUS_API_KEY);
    keySource = "NEXUS_API_KEY env";
  } else if (config.apiKey) {
    keyDisplay = mask(config.apiKey);
    keySource = "config file";
  }

  console.log(`  Base URL:  ${baseUrl} (${urlSource})`);
  console.log(`  API Key:   ${keyDisplay}${keySource ? ` (${keySource})` : ""}`);
  console.log(`  Env:       ${process.env.NEXUS_ENV ?? "(not set)"}`);
}

function mask(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}
