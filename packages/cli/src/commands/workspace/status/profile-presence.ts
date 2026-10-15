import { configFileState, loadConfig } from "../../../config";

/**
 * Reads `config.json` once, and only when a direct row asks.
 *
 * 🔴 Answers `true` for a profile it could not look for. `loadConfig` returns an
 * empty config for a MISSING file and for a DAMAGED one alike, so a truncated
 * config would report every live drive as `broken — profile missing`, and the
 * fix that verdict prints is `nexus auth login`, which SAVES a fresh config over
 * the file nothing could read. The remedy would delete the profiles the
 * diagnosis only failed to see.
 *
 * So the absence has to be established before it is reported: only a config that
 * is readable, or genuinely absent, can say a profile is not in it.
 */
export function profilePresence(): (name: string) => boolean {
  let profiles: Set<string> | null = null;
  let unreadable: boolean | null = null;
  return (name) => {
    unreadable ??= configFileState() === "unreadable";
    if (unreadable) return true;
    profiles ??= new Set(Object.keys(loadConfig().profiles));
    return profiles.has(name);
  };
}
