import { describe, expect, it, vi } from "vitest";

import { HttpClient } from "../http-client";
import type { CallMcpServerToolBody } from "../types/mcp-servers";
import type { Equals, Expect } from "../v1-contract-equality";
import { McpServersResource } from "./mcp-servers";

/**
 * THE OUTBOUND MCP RESOURCE — what actually goes on the wire.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS DRIVES A REAL `HttpClient` AND STUBS ONLY `fetch`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A double standing in for `HttpClient` would let this suite assert on its own
 * mock: it would prove `McpServersResource` calls something named `request`, and
 * prove nothing about the verb, the URL or the body that leave the process. The
 * `/api/public/v1` prefix is re-added by the CLIENT, not by the resource, so a
 * resource-level double cannot see the one transform most likely to be wrong.
 *
 * So the seam is `fetch`, and every assertion below is about a real `Request` the
 * real client produced — the pattern `scores.test.ts` and `chat.test.ts`
 * established for the same reason.
 *
 * ── THE CASE THAT IS NOT A CONVENIENCE ──────────────────────────────────────
 *
 * 🔴 A TOOL NAME IS SERVER-AUTHORED AND THE MCP SPECIFICATION CONSTRAINS IT TO
 * NOTHING. A remote may advertise a name holding `/`, `%` or `..`; as a path
 * segment that is unroutable at best and traversal-shaped at worst. The route
 * therefore takes it in the BODY, and `callTool` must never interpolate it into
 * the URL. {@link hostileToolName} is the case that would catch a resource that
 * did, and it is written as an EQUALITY over the whole request rather than a
 * `not.toContain`, because a negative assertion over a URL is satisfied by a
 * resource that failed to send anything at all.
 *
 * Every case names the mutation that reds it. An arm whose failure mode is
 * unstated tends to be one that cannot fail.
 */

/** Every request the stub saw, decomposed. */
interface SeenRequest {
  url: string;
  method: string;
  body: string | undefined;
}

/** Assembled rather than spelled — a credential-shaped literal gets rewritten on the way to disk. */
const TEST_API_KEY = ["nxs", "u", "mcpserversuite"].join("_");

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CREDENTIAL_ID = "22222222-2222-4222-8222-222222222222";

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

function resourceFor(respond: () => Response): {
  mcpServers: McpServersResource;
  seen: SeenRequest[];
} {
  const { fetchFn, seen } = recordingFetch(respond);
  const http = new HttpClient({
    baseUrl: "https://api-staging.gpt.nexus",
    apiKey: TEST_API_KEY,
    fetch: fetchFn
  });
  return { mcpServers: new McpServersResource(http), seen };
}

/**
 * ⚠️ TYPE-LEVEL, SO `vitest` CANNOT SEE IT — `pnpm --filter @agent-nexus/sdk
 * typecheck` is what enforces the line below, and this file is where a drift
 * surfaces. That is the same split `resource-exports-are-derived.test.ts`
 * documents, and it is stated here so a green run of this file is not read as
 * covering it.
 */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

/**
 * 🔴 `expectedSchemaHash` IS A REQUIRED KEY WITH AN OPTIONAL VALUE, AND THIS IS
 * THE ONLY THING THAT HOLDS IT THERE.
 *
 * Nothing else in this package compares a request BODY to the contract — the
 * response gate compares return types, and `types-match-the-v1-contract.test.ts`
 * is a hand-kept roster this type is not on. So making the key optional would
 * compile, ship, and pass every other suite, while silently turning "I decided
 * not to pin" back into "I never considered pinning" — a distinction a reviewer
 * can only see when the caller had to write the word `undefined`.
 *
 * The assertion is an EQUALITY over the whole required set rather than a
 * membership test, so it also reds when a NEW required key appears: a body field
 * that becomes mandatory is a breaking change for every caller of this published
 * method, and it must not land in silence either.
 */
export type _ThePinMustBeWritten = Expect<
  Equals<RequiredKeys<CallMcpServerToolBody>, "toolName" | "expectedSchemaHash">
>;

describe("mcpServers.list", () => {
  it("GETs /api/public/v1/mcp-servers with no query and no body", async () => {
    const { mcpServers, seen } = resourceFor(() => jsonResponse({ servers: [] }));

    const result = await mcpServers.list();

    // Verb, full URL, body and result in ONE assertion so a single red judges
    // all four. Reds against: a resource that drops the `/api/public/v1` prefix,
    // one that reaches the SINGULAR `/mcp-servers`-less inbound path, one that
    // sends a verb other than GET, and one that invents a query string.
    expect({ seen, result }).toEqual({
      seen: [
        {
          url: "https://api-staging.gpt.nexus/api/public/v1/mcp-servers",
          method: "GET",
          body: undefined
        }
      ],
      result: { servers: [] }
    });
  });
});

describe("mcpServers.get", () => {
  it("puts the server id in the PATH, where the route declares it", async () => {
    const { mcpServers, seen } = resourceFor(() => jsonResponse({ serverId: SERVER_ID }));

    await mcpServers.get(SERVER_ID);

    // Reds against a resource that sends the id as a query parameter or in a
    // body — both of which the route would answer 404 or 400 for, after a round
    // trip that looks like a missing server.
    expect(seen).toEqual([
      {
        url: `https://api-staging.gpt.nexus/api/public/v1/mcp-servers/${SERVER_ID}`,
        method: "GET",
        body: undefined
      }
    ]);
  });
});

describe("mcpServers.sync", () => {
  it("POSTs to /:serverId/sync with NO body", async () => {
    const { mcpServers, seen } = resourceFor(() =>
      jsonResponse({ serverId: SERVER_ID, lastSyncOutcome: "QUEUED" })
    );

    await mcpServers.sync(SERVER_ID);

    // Three properties in one shape, and each one is a route refusal if it moves:
    // the verb (a GET here would hit the detail READ and silently return without
    // asking for anything), the path (`/sync` as a suffix, never `?sync=1`), and
    // `body: undefined` — the descriptor declares no `Body`, and
    // `contract-conformance.spec.ts` checks `Body` ⟺ `@Body()` in BOTH directions,
    // so a body sent here is a payload no handler reads.
    expect(seen).toEqual([
      {
        url: `https://api-staging.gpt.nexus/api/public/v1/mcp-servers/${SERVER_ID}/sync`,
        method: "POST",
        body: undefined
      }
    ]);
  });

  it("🔴 resolves on a FAILED outcome rather than rejecting — the body is the verdict", async () => {
    // A 202 carrying `lastSyncOutcome: "FAILED"` is the honest answer to a refused
    // enqueue: the request to us succeeded and the state it recorded is what the
    // caller asked to see. So it must arrive as a RESOLVED promise, and a caller that
    // reads only `await` succeeding reads it as a queued discovery.
    const { mcpServers } = resourceFor(
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              serverId: SERVER_ID,
              lastSyncOutcome: "FAILED",
              lastSyncErrorCode: "DISCOVERY_NOT_QUEUED"
            }
          }),
          { status: 202, headers: { "content-type": "application/json" } }
        )
    );

    const server = await mcpServers.sync(SERVER_ID);

    expect(server.lastSyncOutcome).toBe("FAILED");
  });

  it("🔬 CONTROL — the same arm's 202 is not special-cased into a rejection", async () => {
    // Its own block: the arm above would pass if `request` rejected on 202 for a
    // DIFFERENT reason and the test happened to catch it, so the positive reading —
    // a 202 with an accepted outcome also resolves — is asserted separately.
    const { mcpServers } = resourceFor(
      () =>
        new Response(JSON.stringify({ success: true, data: { lastSyncOutcome: "QUEUED" } }), {
          status: 202,
          headers: { "content-type": "application/json" }
        })
    );

    await expect(mcpServers.sync(SERVER_ID)).resolves.toMatchObject({
      lastSyncOutcome: "QUEUED"
    });
  });
});

describe("mcpServers.callTool", () => {
  it("POSTs to /tools/call with the tool name in the BODY", async () => {
    const { mcpServers, seen } = resourceFor(() =>
      jsonResponse({ toolName: "search_issues", isError: false, text: "none", mediaBlocks: [] })
    );

    const result = await mcpServers.callTool(SERVER_ID, {
      toolName: "search_issues",
      arguments: { query: "is:open" },
      credentialId: CREDENTIAL_ID,
      expectedSchemaHash: undefined
    });

    // Reds against: a GET, a lost prefix, a path that interpolates the tool
    // name, a body that renames `toolName`, and a resource that forwards
    // `expectedSchemaHash: undefined` as an explicit JSON null.
    expect({ seen, result }).toEqual({
      seen: [
        {
          url: `https://api-staging.gpt.nexus/api/public/v1/mcp-servers/${SERVER_ID}/tools/call`,
          method: "POST",
          body: JSON.stringify({
            toolName: "search_issues",
            arguments: { query: "is:open" },
            credentialId: CREDENTIAL_ID
          })
        }
      ],
      result: { toolName: "search_issues", isError: false, text: "none", mediaBlocks: [] }
    });
  });

  it("hostileToolName: a name holding a slash and dot-dot never reaches the URL", async () => {
    // 🔴 THE SECURITY-SHAPED CASE. The MCP specification types a tool name as a
    // plain string, so this is a name a remote server is free to advertise. As a
    // path segment it is a traversal; in the body it is bytes.
    //
    // Asserted as an EQUALITY over the whole request rather than as
    // `expect(url).not.toContain("..")` — a negative over the URL is equally
    // satisfied by a resource that sent nothing at all, which is the one outcome
    // that must not read as safe here.
    const hostile = "../../admin/delete_everything";
    const { mcpServers, seen } = resourceFor(() =>
      jsonResponse({ toolName: hostile, isError: true, text: "refused", mediaBlocks: [] })
    );

    await mcpServers.callTool(SERVER_ID, { toolName: hostile, expectedSchemaHash: undefined });

    expect(seen).toEqual([
      {
        url: `https://api-staging.gpt.nexus/api/public/v1/mcp-servers/${SERVER_ID}/tools/call`,
        method: "POST",
        body: JSON.stringify({ toolName: hostile })
      }
    ]);
  });

  it("a tool reporting its own failure RESOLVES, carrying isError", async () => {
    // The contract a caller most easily gets wrong: `isError: true` arrives as a
    // 200. Reds against a resource that threw on it — which would make the tool's
    // own text, the one thing a caller can act on, unreachable.
    const { mcpServers } = resourceFor(() =>
      jsonResponse({
        toolName: "search_issues",
        isError: true,
        text: "rate limited by the remote",
        mediaBlocks: []
      })
    );

    await expect(
      mcpServers.callTool(SERVER_ID, { toolName: "search_issues", expectedSchemaHash: undefined })
    ).resolves.toEqual({
      toolName: "search_issues",
      isError: true,
      text: "rate limited by the remote",
      mediaBlocks: []
    });
  });
});
