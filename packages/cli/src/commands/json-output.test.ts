import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

// Fake SDK client — only the methods exercised by the commands under test.
const fakeClient = {
  conversations: {
    getMessages: vi.fn()
  },
  tracing: {
    getTrace: vi.fn()
  }
};

vi.mock("../client", () => ({
  createClient: () => fakeClient,
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

// The apps commands don't go through the SDK client — they call the tenant API
// directly via tenantRequest, so they need their own seam.
const tenantRequest = vi.fn();
vi.mock("../util/tenant-http", () => ({
  tenantRequest: (...args: unknown[]) => tenantRequest(...args)
}));

import { registerAppsCommands } from "./apps";
import { registerConversationCommands } from "./conversation";
import { registerTracingCommands } from "./tracing";

/**
 * Build a fresh program with the global --json flag, register the commands,
 * capture everything written to stdout, and run the given argv.
 *
 * Returns the concatenated stdout so a test can assert it is a SINGLE
 * parseable JSON document (NEX-2176: --json must never be contaminated with
 * prose trailers or a second concatenated JSON value).
 */
async function runJson(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON");
  registerConversationCommands(program);
  registerTracingCommands(program);
  registerAppsCommands(program);

  // The real CLI sets JSON mode in a preAction hook off the --json flag;
  // mirror that here so the output module formats as JSON.
  setJsonMode(true);

  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });

  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    spy.mockRestore();
    setJsonMode(false);
  }

  // console.log adds a newline between calls — reproduce real stdout.
  return chunks.join("\n");
}

describe("NEX-2176: --json output is a single parseable JSON document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setJsonMode(false);
  });

  it("conversation messages --json emits one JSON object with meta.hasMore (no prose trailer)", async () => {
    fakeClient.conversations.getMessages.mockResolvedValue({
      messages: [
        { id: "m1", role: "USER", content: "hi", createdAt: "2026-01-01T00:00:00Z" },
        { id: "m2", role: "AGENT", content: "hello", createdAt: "2026-01-01T00:00:01Z" }
      ],
      hasMore: true
    });

    const out = await runJson(["conversation", "messages", "conv-123"]);

    // Must not contain the human-readable trailer.
    expect(out).not.toContain("more messages available");

    // Must parse as a single JSON document — JSON.parse throws on trailing prose
    // or a second concatenated value.
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(2);
    // Pagination state lives in a JSON field, not a prose trailer.
    expect(parsed.meta).toEqual({ hasMore: true });
  });

  it("tracing trace --json emits one JSON object with generations nested (no second JSON value)", async () => {
    fakeClient.tracing.getTrace.mockResolvedValue({
      id: "trace-123",
      status: "COMPLETED",
      generations: [
        {
          id: "g1",
          modelName: "claude-opus-4-8",
          status: "COMPLETED",
          costUsd: 0.01,
          durationMs: 100
        },
        {
          id: "g2",
          modelName: "claude-sonnet-4-6",
          status: "COMPLETED",
          costUsd: 0.002,
          durationMs: 50
        }
      ]
    });

    const out = await runJson(["tracing", "trace", "trace-123"]);

    // Must not contain the "Generations (N):" prose header.
    expect(out).not.toContain("Generations");

    // Must parse as a single JSON document, with generations nested inside it.
    const parsed = JSON.parse(out);
    expect(parsed.id).toBe("trace-123");
    expect(Array.isArray(parsed.generations)).toBe(true);
    expect(parsed.generations).toHaveLength(2);
  });

  // Both apps git-project printers append a human-mode pointer at
  // "nexus apps git-credentials" (the push URL does not come from these
  // commands). That trailer must stay behind the isJsonMode() early-return.
  const GIT_PROJECT = {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_1",
    name: "svc",
    description: null,
    defaultBranch: "main",
    s3Prefix: "",
    hookSecretRef: "",
    gitRemoteUrl: "http://forgejo.internal:3000/vibe/svc.git",
    status: "READY",
    createdByUserId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };

  it("apps git-project get --json emits one JSON object (no git-credentials trailer)", async () => {
    tenantRequest.mockResolvedValue({ gitProject: GIT_PROJECT });

    const out = await runJson(["apps", "git-project", "get", GIT_PROJECT.id]);

    expect(out).not.toContain("git-credentials");

    const parsed = JSON.parse(out);
    expect(parsed.name).toBe("svc");
    // --json stays the verbatim API shape: presentation changes must not
    // reshape the contract scripts parse.
    expect(parsed.gitRemoteUrl).toBe(GIT_PROJECT.gitRemoteUrl);
  });

  it("apps git-project list --json emits one JSON object (no trailer, gitRemoteUrl retained)", async () => {
    tenantRequest.mockResolvedValue({ gitProjects: [GIT_PROJECT] });

    const out = await runJson(["apps", "git-project", "list"]);

    expect(out).not.toContain("git-credentials");

    const parsed = JSON.parse(out);
    expect(parsed.gitProjects).toHaveLength(1);
    // The human table drops this column; --json must still carry it.
    expect(parsed.gitProjects[0].gitRemoteUrl).toBe(GIT_PROJECT.gitRemoteUrl);
  });
});
