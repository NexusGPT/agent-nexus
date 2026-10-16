import { FETCH_TIMEOUT_MS, REGISTRY_LATEST_URL } from "./version-check.constants";

/**
 * Ask the registry for `latest`, NOW, and wait for the answer.
 *
 * The one path in this module that is allowed to block on the network, because
 * `nexus upgrade` is the user asking rather than the CLI deciding — which is
 * also why `isAutoUpdateDisabled` does not gate it. Every automatic path
 * answers from the cache instead; see `version-check.refresh.ts`.
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(REGISTRY_LATEST_URL, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
}
