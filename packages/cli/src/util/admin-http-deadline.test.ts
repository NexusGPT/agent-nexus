import { createServer, type Server, type Socket } from "node:net";

import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { parseTimeoutSeconds } from "../client";
import { EXIT_CODES } from "../exit-codes";
import { AdminCliError } from "./admin-errors";
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

  /**
   * THE WIRING, NOT THE FACTORY.
   *
   * 🔴 `exit-code-taxonomy.test.ts` proves `AdminCliError.timedOut` CARRIES 8.
   * It cannot prove `adminRequest` REACHES it — that arm passes unchanged with
   * this catch still calling `AdminCliError.network`, which is the state this
   * repair was made from. Same distinction `json-one-document.scan.ts`'s header
   * records: a gate can prove an installer works and prove nothing about it being
   * wired.
   *
   * So this drives the real transport against a real listener and reads the exit
   * code off the real error.
   */
  it("files the deadline as timed-out, so a script does not re-send a write that may have landed", async () => {
    const created = createServer((socket) => {
      sockets.push(socket);
      // Accepted, and answered never.
    });
    server = created;
    await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
    const address = created.address();
    if (address === null || typeof address === "string") throw new Error("no TCP address");

    const thrown = await adminRequest(
      { adminToken: "jwt-x", baseUrl: `http://127.0.0.1:${address.port}`, timeout: 300 },
      { method: "PATCH", path: "/api/admin/probe", body: { status: "SUSPENDED" } }
    ).then(
      () => null,
      (err: unknown) => err
    );

    expect(thrown).toBeInstanceOf(AdminCliError);
    expect((thrown as AdminCliError).exitCode).toBe(EXIT_CODES["timed-out"]);
  });

  it("CONTROL — and NOT connection-failed, the retryable number it used to take", async () => {
    const created = createServer((socket) => {
      sockets.push(socket);
    });
    server = created;
    await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
    const address = created.address();
    if (address === null || typeof address === "string") throw new Error("no TCP address");

    const thrown = await adminRequest(
      { adminToken: "jwt-x", baseUrl: `http://127.0.0.1:${address.port}`, timeout: 300 },
      { method: "PATCH", path: "/api/admin/probe", body: { status: "SUSPENDED" } }
    ).then(
      () => null,
      (err: unknown) => err
    );

    expect((thrown as AdminCliError).exitCode).not.toBe(EXIT_CODES["connection-failed"]);
  });

  it("CONTROL — an unreachable host is still connection-failed, so the branch above discriminates", async () => {
    // Port 1 on loopback: nothing listens, so the connect is refused outright.
    // Without this the two arms above are satisfied by a catch that files
    // EVERYTHING as a deadline.
    const thrown = await adminRequest(
      { adminToken: "jwt-x", baseUrl: "http://127.0.0.1:1", timeout: 5_000 },
      { method: "PATCH", path: "/api/admin/probe", body: { status: "SUSPENDED" } }
    ).then(
      () => null,
      (err: unknown) => err
    );

    expect((thrown as AdminCliError).exitCode).toBe(EXIT_CODES["connection-failed"]);
  });
});
