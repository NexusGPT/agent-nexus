import { failure } from "../../../errors";

/** How long a presigned download may take to answer its HEADERS; the body has no deadline. */
const DOWNLOAD_HEADER_TIMEOUT_MS = 30_000;

/**
 * `fetch` with a deadline on the HEADERS only, mirroring the SDK's own door: a
 * black-holed host must not hang the run forever, and a slow body must not be
 * cut short. The controller is released as soon as headers arrive.
 */
export async function fetchWithHeaderDeadline(url: string, what: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_HEADER_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw failure("connection-failed", `Could not download ${what}${detail}`);
  } finally {
    clearTimeout(timer);
  }
}
