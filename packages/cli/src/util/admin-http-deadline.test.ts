import { createServer, type Server, type Socket } from "node:net";

import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { parseTimeoutSeconds } from "../client";
import { adminRequest } from "./admin-http";
import { resolveAdminOpts } from "./admin-opts";

// NOT MOCKED, deliberately: `adminRequest` goes through the real
// `resolveBaseUrl`, which returns an explicit override before it looks at any
// profile (`config.ts` — `if (override) return override;` is its first line). So
// every case below passes its listener's URL as `baseUrl` and exercises the
// production resolution rather than a double standing in for it.

/**
 * `nexus admin …` had NO deadline and silently dropped `--timeout`.
 *
 * `--timeout <seconds>` is a program-level global and `registerAdminCommands`
 * hangs off that program, so `nexus --timeout 5 admin …` parsed, was accepted,
 * and reached nothing at all — ten command files, every one of which hung for
 * ever against a peer that accepted the connection and never answered.
 *
 * Two arms, because the seam and the transport fail independently: the seam can
 * forward a value the transport ignores, and the transport can hold a default
 * the seam never feeds.
 */

/** The seam's own shape, driven through a real commander tree. */
function optsFor(argv: string[]): ReturnType<typeof resolveAdminOpts> {
  const program = new Command();
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  const admin = program.command("admin").option("--admin-token <jwt>", "token");
  admin.command("noop").action(() => {});
  program.parse(["node", "nexus", ...argv]);
  return resolveAdminOpts(program, admin);
}

describe("resolveAdminOpts carries the global --timeout into the admin transport", () => {
  it("converts the seconds flag to the milliseconds the transport takes", () => {
    expect(optsFor(["--timeout", "5", "admin", "noop"]).timeout).toBe(5_000);
  });

  it("CONTROL: an unset flag stays undefined, leaving the transport's own default", () => {
    // Not zero and not a pinned constant: `undefined` is what lets
    // `admin-http.ts` apply ADMIN_REQUEST_DEFAULT_TIMEOUT_MS. A seam that
    // invented a value here would make the transport's default unreachable.
    expect(optsFor(["admin", "noop"]).timeout).toBeUndefined();
  });

  it("CONTROL: the token still arrives — the seam was not narrowed to one field", () => {
    expect(optsFor(["admin", "--admin-token", "jwt-x", "noop"]).adminToken).toBe("jwt-x");
  });
});

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  const running = server;
  server = undefined;
  if (running) await new Promise<void>((resolve) => running.close(() => resolve()));
});

describe("adminRequest gives up on a peer that never answers", () => {
  it("rejects within its budget instead of hanging for ever", async () => {
    const created = createServer((socket) => {
      sockets.push(socket);
      // Accepted, and answered never.
    });
    server = created;
    await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
    const address = created.address();
    if (address === null || typeof address === "string") throw new Error("no TCP address");

    const started = Date.now();
    await expect(
      adminRequest(
        {
          adminToken: "jwt-x",
          baseUrl: `http://127.0.0.1:${address.port}`,
          timeout: 300
        },
        { method: "GET", path: "/api/admin/probe" }
      )
    ).rejects.toThrow(/no response within 300 ms/);

    // The budget was the reason it ended, not something else that happened to
    // fail fast: an auth refusal or a connection error would return in
    // single-digit milliseconds and satisfy the rejection above.
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });
});
