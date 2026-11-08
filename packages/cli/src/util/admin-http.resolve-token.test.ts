import { afterEach, describe, expect, it } from "vitest";

import { resolveAdminToken } from "./admin-http.resolve-token";

const ENV_TOKEN = "env-jwt";

// Whatever the caller's shell carries is put back, so the run leaves no trace.
const ORIGINAL = process.env.NEXUS_ADMIN_TOKEN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXUS_ADMIN_TOKEN;
  else process.env.NEXUS_ADMIN_TOKEN = ORIGINAL;
});

describe("resolveAdminToken — `--admin-token` first, then NEXUS_ADMIN_TOKEN", () => {
  it("falls through a BLANK flag to the environment token", () => {
    // `--admin-token ""` (an unset shell variable interpolated into the flag)
    // is non-nullish, so a `??` chain stopped on it and threw missingToken
    // with a real token sitting in the environment.
    process.env.NEXUS_ADMIN_TOKEN = ENV_TOKEN;
    expect(resolveAdminToken({ adminToken: "" })).toBe(ENV_TOKEN);
    expect(resolveAdminToken({ adminToken: "   " })).toBe(ENV_TOKEN);
  });

  it("prefers a PRESENT flag over the environment — the order is the contract", () => {
    process.env.NEXUS_ADMIN_TOKEN = ENV_TOKEN;
    expect(resolveAdminToken({ adminToken: "flag-jwt" })).toBe("flag-jwt");
  });

  it("still refuses when neither source carries a token", () => {
    process.env.NEXUS_ADMIN_TOKEN = "  ";
    expect(() => resolveAdminToken({ adminToken: "" })).toThrow();
  });

  it("strips a pasted `Bearer ` prefix from whichever source won", () => {
    process.env.NEXUS_ADMIN_TOKEN = `Bearer ${ENV_TOKEN}`;
    expect(resolveAdminToken({ adminToken: "" })).toBe(ENV_TOKEN);
  });
});
