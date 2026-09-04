import { PromptVariantsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * The `nexus prompt` surface, driven through the REAL `PromptVariantsResource`
 * over a recorded transport — the deployment-folder pattern: what is in doubt
 * is the WIRE (paths, refs in the URL, bodies), not that the CLI calls a
 * function. Local refusals are asserted by the transport staying silent.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    promptVariants: new PromptVariantsResource({ request } as never)
  })
}));

import { registerPromptCommands } from "./prompt";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPromptCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

const VARIANT = {
  id: "33333333-3333-4333-8333-333333333333",
  agentId: AGENT_ID,
  name: "Concise",
  isMain: false,
  status: "ACTIVE",
  forkedFromVersionId: VERSION_ID,
  versionCount: 1,
  tipVersionId: VERSION_ID,
  createdById: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nexus prompt variant list", () => {
  it("omits includeArchived by default and sends it only under --all", async () => {
    request.mockResolvedValue([VARIANT]);
    await run(["prompt", "variant", "list", "--agent-id", AGENT_ID]);
    expect(request).toHaveBeenCalledWith("GET", `/agents/${AGENT_ID}/prompt-variants`, {
      query: {}
    });

    await run(["prompt", "variant", "list", "--agent-id", AGENT_ID, "--all"]);
    expect(request).toHaveBeenLastCalledWith("GET", `/agents/${AGENT_ID}/prompt-variants`, {
      query: { includeArchived: true }
    });
  });
});

describe("nexus prompt variant create", () => {
  it("posts the name alone by default, and the fork source under --from-version", async () => {
    request.mockResolvedValue(VARIANT);
    await run(["prompt", "variant", "create", "--agent-id", AGENT_ID, "--name", "Concise"]);
    expect(request).toHaveBeenCalledWith("POST", `/agents/${AGENT_ID}/prompt-variants`, {
      body: { name: "Concise" }
    });

    await run([
      "prompt",
      "variant",
      "create",
      "--agent-id",
      AGENT_ID,
      "--name",
      "FromV1",
      "--from-version",
      VERSION_ID
    ]);
    expect(request).toHaveBeenLastCalledWith("POST", `/agents/${AGENT_ID}/prompt-variants`, {
      body: { name: "FromV1", fromVersionId: VERSION_ID }
    });
  });
});

describe("nexus prompt variant rename", () => {
  it("addresses the variant by ref in the path and sends only the new name", async () => {
    request.mockResolvedValue({ ...VARIANT, name: "Warmer" });
    await run([
      "prompt",
      "variant",
      "rename",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "Concise",
      "--name",
      "Warmer"
    ]);
    expect(request).toHaveBeenCalledWith("PATCH", `/agents/${AGENT_ID}/prompt-variants/Concise`, {
      body: { name: "Warmer" }
    });
  });
});

describe("nexus prompt variant archive", () => {
  it("refuses without --yes on a non-TTY, and the transport never hears about it", async () => {
    await run(["prompt", "variant", "archive", "--agent-id", AGENT_ID, "--variant", "Old"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("archives with --yes via DELETE — the route that archives, not deletes", async () => {
    request.mockResolvedValue({ ...VARIANT, status: "ARCHIVED" });
    await run([
      "prompt",
      "variant",
      "archive",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "Old",
      "--yes"
    ]);
    expect(request).toHaveBeenCalledWith("DELETE", `/agents/${AGENT_ID}/prompt-variants/Old`);
  });
});

describe("nexus prompt save", () => {
  const savedVersion = {
    id: VERSION_ID,
    variantId: VARIANT.id,
    variantName: "Concise",
    ordinal: 2,
    type: "CHECKPOINT",
    name: null,
    promotedFromVersionId: null,
    isProduction: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: null
  };

  it("sends --text as the markdown prompt body", async () => {
    request.mockResolvedValue(savedVersion);
    await run([
      "prompt",
      "save",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "Concise",
      "--text",
      "Be extremely concise."
    ]);
    expect(request).toHaveBeenCalledWith(
      "POST",
      `/agents/${AGENT_ID}/prompt-variants/Concise/versions`,
      { body: { prompt: "Be extremely concise." } }
    );
  });

  it("refuses --file and --text together, locally", async () => {
    await run([
      "prompt",
      "save",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "Concise",
      "--text",
      "x",
      "--file",
      "/tmp/nope.md"
    ]);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses neither --file nor --text, locally", async () => {
    await run(["prompt", "save", "--agent-id", AGENT_ID, "--variant", "Concise"]);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("nexus prompt history", () => {
  it('defaults the variant to "main"', async () => {
    request.mockResolvedValue([]);
    await run(["prompt", "history", "--agent-id", AGENT_ID]);
    expect(request).toHaveBeenCalledWith(
      "GET",
      `/agents/${AGENT_ID}/prompt-variants/main/versions`
    );
  });
});

describe("nexus prompt promote", () => {
  it("sends an empty body by default and publish: true only under --publish", async () => {
    request.mockResolvedValue({
      newMainVersionId: VERSION_ID,
      mainVariantId: VARIANT.id,
      ordinal: 3,
      sourceVersionId: VERSION_ID,
      published: false
    });
    await run(["prompt", "promote", "--agent-id", AGENT_ID, "--variant", "Concise"]);
    expect(request).toHaveBeenCalledWith(
      "POST",
      `/agents/${AGENT_ID}/prompt-variants/Concise/promote`,
      { body: {} }
    );

    await run(["prompt", "promote", "--agent-id", AGENT_ID, "--variant", "Concise", "--publish"]);
    expect(request).toHaveBeenLastCalledWith(
      "POST",
      `/agents/${AGENT_ID}/prompt-variants/Concise/promote`,
      { body: { publish: true } }
    );
  });
});

describe("nexus prompt compare", () => {
  it("sends both refs as query params", async () => {
    request.mockResolvedValue({
      a: { ref: "main", versionId: VERSION_ID, variantName: "Main", ordinal: 1 },
      b: { ref: "Concise", versionId: VERSION_ID, variantName: "Concise", ordinal: 1 },
      changes: []
    });
    await run(["prompt", "compare", "--agent-id", AGENT_ID, "--a", "main", "--b", "Concise"]);
    expect(request).toHaveBeenCalledWith("GET", `/agents/${AGENT_ID}/prompt-compare`, {
      query: { a: "main", b: "Concise" }
    });
  });
});

describe("nexus prompt graph", () => {
  it("reads the agent-level graph route", async () => {
    request.mockResolvedValue({ nodes: [], edges: [] });
    await run(["prompt", "graph", "--agent-id", AGENT_ID]);
    expect(request).toHaveBeenCalledWith("GET", `/agents/${AGENT_ID}/prompt-graph`);
  });
});
