import { exec } from "node:child_process";

export const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";

export function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}
