import { NexusApiError } from "@agent-nexus/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tenantRequest } from "./tenant-http";

const OPTS = { apiKey: "nxs_u_test", baseUrl: "https://api.nexusgpt.io" };
const REQ = { method: "POST" as const, path: "/api/vibe/apps/app-1/repository" };

/** Stub `fetch` with a verbatim non-2xx body + status. */
function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(JSON.stringify(body))
    })
  );
}

async function caught(): Promise<NexusApiError> {
  try {
    await tenantRequest(OPTS, REQ);
  } catch (err) {
    return err as NexusApiError;
  }
  throw new Error("expected tenantRequest to throw");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tenantRequest error shapes", () => {
  // VERBATIM from a live prod call:
  //   curl -X POST .../api/vibe/apps/<id>/repository
  //   → 409 {"code":"VIBE_GIT_PROJECT_ALREADY_EXISTS","message":"Vibe git project ..."}
  // Every mapped Vibe error lands in this shape — NestJS serializes
  // `throw new ConflictException({ code, message })` with no envelope around it.
  it("reads a handler's own {code, message} — the shape the backend actually sends", async () => {
    respondWith(409, {
      code: "VIBE_GIT_PROJECT_CLUSTER_NOT_READY",
      message:
        "Cannot create a git project: your organization has no dedicated Vibe cluster — a repository hosted by Nexus is created on your own cluster, so one must be provisioned first"
    });

    const err = await caught();

    expect(err).toBeInstanceOf(NexusApiError);
    expect(err.status).toBe(409);
    // Reading only the envelope turned this into "HTTP_ERROR", so a caller
    // could not branch on the condition the handler had just named.
    expect(err.code).toBe("VIBE_GIT_PROJECT_CLUSTER_NOT_READY");
    // ...and turned this into "POST /path failed with HTTP 409", so the reason
    // the tenant was owed never reached them.
    expect(err.message).toContain("no dedicated Vibe cluster");
  });

  it("still reads the {success:false, error:{…}} envelope", async () => {
    respondWith(422, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "name is invalid", details: { field: "name" } }
    });

    const err = await caught();

    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("name is invalid");
    expect(err.details).toEqual({ field: "name" });
  });

  it("names the request when the body carries no error of either shape", async () => {
    respondWith(502, { something: "unexpected" });

    const err = await caught();

    expect(err.code).toBe("HTTP_ERROR");
    expect(err.message).toBe("POST /api/vibe/apps/app-1/repository failed with HTTP 502");
  });

  it("keeps the message from Nest's own default shape, which carries no code", async () => {
    // A guard rejection on these routes lands here: `error` is a generic label,
    // not a code, so adopting it would invent one.
    respondWith(403, { statusCode: 403, error: "Forbidden", message: "Forbidden resource" });

    const err = await caught();

    expect(err.code).toBe("HTTP_ERROR");
    // The reason is right there in the body — naming the request instead threw
    // it away, which is the whole defect this guards.
    expect(err.message).toBe("Forbidden resource");
  });

  it("keeps an envelope's message even when it carries no code", async () => {
    respondWith(500, { success: false, error: { message: "boom" } });

    const err = await caught();

    // Reading code and message together would drop a good message over a
    // missing code — they are independent.
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.message).toBe("boom");
  });

  it("forwards details from a handler's own named error", async () => {
    respondWith(409, { code: "SOME_CODE", message: "nope", details: { field: "name" } });

    const err = await caught();

    expect(err.details).toEqual({ field: "name" });
  });

  it("reads a named error's code before its message, so the code is not lost", async () => {
    // A `{ code, message }` body also satisfies the message-only shape; order
    // is what keeps the code.
    respondWith(409, { code: "VIBE_GIT_PROJECT_CLUSTER_NOT_READY", message: "no cluster" });

    const err = await caught();

    expect(err.code).toBe("VIBE_GIT_PROJECT_CLUSTER_NOT_READY");
  });
});
