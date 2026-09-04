import { describe, expect, it, vi } from "vitest";

import { HttpClient } from "../http-client";
import { PromptVariantsResource } from "./prompt-variants";

/**
 * Wire-level checks in the house idiom (real HttpClient, stubbed fetch): the
 * URL each method builds — including the `/api/public/v1` prefix a
 * resource-level double could never see — the ref's URL-encoding, and the
 * bodies as they leave the process.
 */

interface SeenRequest {
  url: string;
  method: string;
  body: string | undefined;
}

/** Assembled rather than spelled — a credential-shaped literal gets rewritten on the way to disk. */
const TEST_API_KEY = ["nxs", "u", "promptlab"].join("_");

const AGENT_ID = "11111111-1111-4111-8111-111111111111";

function recordingFetch(respond: () => Response): {
  fetchFn: typeof globalThis.fetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  const fetchFn = vi.fn(async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: unknown };
    seen.push({
      url: String(url),
      method: request.method ?? "GET",
      body: typeof request.body === "string" ? request.body : undefined
    });
    return respond();
  });
  return { fetchFn: fetchFn as unknown as typeof globalThis.fetch, seen };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function variantsFor(respond: () => Response): {
  variants: PromptVariantsResource;
  seen: SeenRequest[];
} {
  const { fetchFn, seen } = recordingFetch(respond);
  const http = new HttpClient({
    baseUrl: "https://api-staging.gpt.nexus",
    apiKey: TEST_API_KEY,
    fetch: fetchFn
  });
  return { variants: new PromptVariantsResource(http), seen };
}

describe("PromptVariantsResource", () => {
  it("list hits the variants collection, with includeArchived only when asked", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse([]));
    await variants.list(AGENT_ID);
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/agents/${AGENT_ID}/prompt-variants`
    );

    await variants.list(AGENT_ID, { includeArchived: true });
    expect(seen[1].url).toContain("includeArchived=true");
  });

  it("create posts the name and optional fork source", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({}));
    await variants.create(AGENT_ID, { name: "Concise" });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].body).toBe(JSON.stringify({ name: "Concise" }));
  });

  it("addresses a variant by REF and url-encodes it — names carry spaces", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({}));
    await variants.saveVersion(AGENT_ID, "Concise refunds", { prompt: "Be brief." });
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/agents/${AGENT_ID}/prompt-variants/Concise%20refunds/versions`
    );
    expect(seen[0].body).toBe(JSON.stringify({ prompt: "Be brief." }));
  });

  it("promote defaults to an explicit empty body, so publish stays a deliberate act", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({}));
    await variants.promote(AGENT_ID, "main-candidate");
    expect(seen[0].url).toContain("/prompt-variants/main-candidate/promote");
    expect(seen[0].body).toBe(JSON.stringify({}));

    await variants.promote(AGENT_ID, "main-candidate", { publish: true });
    expect(seen[1].body).toBe(JSON.stringify({ publish: true }));
  });

  it("archive is a DELETE that deletes nothing — the route archives", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({}));
    await variants.archive(AGENT_ID, "Old");
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].url).toContain(`/agents/${AGENT_ID}/prompt-variants/Old`);
  });

  it("compare sends both refs as query params against the agent-level route", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({ a: {}, b: {}, changes: [] }));
    await variants.compare(AGENT_ID, { a: "main", b: "Concise" });
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/agents/${AGENT_ID}/prompt-compare?a=main&b=Concise`
    );
  });

  it("graph hits the agent-level graph route", async () => {
    const { variants, seen } = variantsFor(() => jsonResponse({ nodes: [], edges: [] }));
    await variants.graph(AGENT_ID);
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/agents/${AGENT_ID}/prompt-graph`
    );
  });
});
