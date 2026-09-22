import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_REQUEST_DEFAULT_TIMEOUT_MS } from "./_shared/auth-request-timeout";
import { fetchOrganizations } from "./_shared/fetch-organizations";
import { fetchOrgIdentity } from "./login.fetch-org-identity";
import { resolveOrgScopedIdentity } from "./login.resolve-org-scoped";

/**
 * Four `auth` sites pinned `AbortSignal.timeout(30_000)` and ignored the global
 * flag, while their siblings in the same tree — `whoami`, `status` — read it.
 * The CLI's own timeout error tells the reader to raise `--timeout <seconds>`,
 * so on these four that instruction was false.
 *
 * Each arm points a helper at a listener that accepts and never answers, passes
 * ONE second, and requires the call to come back. Pre-fix these helpers took no
 * such parameter at all and waited the pinned 30s, which no arm here can wait
 * out — that is what makes the threading observable rather than merely readable.
 */

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  const running = server;
  server = undefined;
  if (running) await new Promise<void>((resolve) => running.close(() => resolve()));
});

/** A listener that accepts a connection and answers nothing. Returns its base URL. */
async function silentListener(): Promise<string> {
  const created = createServer((socket) => sockets.push(socket));
  server = created;
  await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
  const address = created.address();
  if (address === null || typeof address === "string") throw new Error("no TCP address");
  return `http://127.0.0.1:${address.port}`;
}

/** How long a call took, and whether it ended by rejecting. */
async function settleWithin(run: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await run().then(
    () => undefined,
    () => undefined
  );
  return Date.now() - started;
}

describe("the auth tree's requests honour the global --timeout", () => {
  it("fetchOrganizations gives up after the seconds it was handed", async () => {
    const baseUrl = await silentListener();
    const elapsed = await settleWithin(() => fetchOrganizations(baseUrl, "nxs_test", 1));
    expect(elapsed).toBeLessThan(4_000);
  });

  it("fetchOrgIdentity gives up after the seconds it was handed", async () => {
    const baseUrl = await silentListener();
    const elapsed = await settleWithin(() => fetchOrgIdentity(baseUrl, "nxs_test", "org_x", 1));
    expect(elapsed).toBeLessThan(4_000);
  });

  it("resolveOrgScopedIdentity gives up after the seconds it was handed", async () => {
    const baseUrl = await silentListener();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const elapsed = await settleWithin(() => resolveOrgScopedIdentity(baseUrl, "nxs_test", 1));
      expect(elapsed).toBeLessThan(4_000);
    } finally {
      log.mockRestore();
    }
  });

  it("CONTROL: the shared default is still 30s, so an unset flag changes nothing", () => {
    // The arms above would pass identically if the fix had been to shorten the
    // pinned constant rather than to make it configurable — a cure that would
    // have broken every slow-link login instead of fixing anything. This pins
    // the default where it was and leaves the flag as the only thing that moves
    // it.
    expect(AUTH_REQUEST_DEFAULT_TIMEOUT_MS).toBe(30_000);
  });
});
