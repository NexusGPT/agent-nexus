import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AN ADMIN WRITE NAMES THE HOST IT REACHED, AND IT NAMES IT ON STDERR.
 *
 * NEX-5919's third clause. `nexus admin …` mutates a tenant and nothing on
 * screen said which one, so `NEXUS_ENV=staging` resolving to production left an
 * operator with no way to notice before or after.
 *
 * 🔴 THIS FILE EXISTS BECAUSE THE LINE HAD NO ARM. Reverting it left all 4,124
 * tests green: `destructive-confirmation.driven.test.ts` mocks `adminRequest`
 * wholesale, so nothing in the package executed this module at all. A fix with
 * no assertion anywhere near it is indistinguishable from a fix that was never
 * made.
 *
 * ⚠️ THE GET ARM IS NEGATIVE, so it is satisfied by an empty haystack — by a
 * stderr spy that was never wired, by an `adminRequest` that threw before
 * reaching the line, by a mis-imported module. It is written directly beside a
 * POSITIVE arm over the SAME spy and the same call shape, which is the only
 * thing that makes its silence a finding rather than an accident.
 */
import { adminRequest } from "./admin-http";

const HOST = "http://127.0.0.1:19601";

const stderr: string[] = [];
const stdout: string[] = [];

beforeEach(() => {
  stderr.length = 0;
  stdout.length = 0;
  // `NEXUS_BASE_URL` outranks any profile, so the resolved host is this one
  // whatever config the machine running the suite happens to carry.
  process.env.NEXUS_BASE_URL = HOST;

  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
    stderr.push(typeof chunk === "string" ? chunk : "");
    return true;
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
    stdout.push(typeof chunk === "string" ? chunk : "");
    return true;
  });
  // ⚠️ A FRESH `Response` PER CALL — a body reads once, and `mockResolvedValue`
  // hands the second caller the drained one, which surfaces as a transport
  // failure rather than as the fixture fault it is.
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
  );
});

afterEach(() => {
  delete process.env.NEXUS_BASE_URL;
  vi.restoreAllMocks();
});

describe("an admin write announces the host it is about to reach", () => {
  it("names the method and the resolved host on stderr for a POST", async () => {
    await adminRequest({ adminToken: "t" }, { method: "POST", path: "/api/admin/thing" });

    const line = stderr.find((chunk) => chunk.includes("admin "));
    expect(line, `stderr was: ${JSON.stringify(stderr)}`).toBeDefined();
    expect(line).toContain("POST");
    expect(line).toContain(HOST);
  });

  it("keeps it OFF stdout, where it would corrupt the --json document", async () => {
    // Paired with the arm above: that one proves the announcement happened at
    // all, so this one's silence is about the STREAM and not about the line
    // never having been written.
    await adminRequest({ adminToken: "t" }, { method: "POST", path: "/api/admin/thing" });

    expect(stderr.some((chunk) => chunk.includes("admin "))).toBe(true);
    expect(stdout.join("")).toBe("");
  });

  it("says nothing for a GET, so the line stays worth reading", async () => {
    await adminRequest({ adminToken: "t" }, { method: "GET", path: "/api/admin/thing" });

    expect(stderr.join("")).toBe("");
  });

  it("announces DELETE and PATCH too — every method that is not a read", async () => {
    await adminRequest({ adminToken: "t" }, { method: "DELETE", path: "/api/admin/thing" });
    await adminRequest({ adminToken: "t" }, { method: "PATCH", path: "/api/admin/thing" });

    const announced = stderr.filter((chunk) => chunk.includes("admin "));
    expect(announced).toHaveLength(2);
    expect(announced[0]).toContain("DELETE");
    expect(announced[1]).toContain("PATCH");
  });
});
