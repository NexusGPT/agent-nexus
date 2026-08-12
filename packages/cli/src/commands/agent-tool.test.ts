import { AgentToolsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `agent-tool update --type` reaches the wire.
 *
 * The flag exists because the API REQUIRES `type` alongside any `config` update —
 * `UpdateAgentToolBodySchema` refuses a `config` that arrives without it, since a
 * config is validated against the type it belongs to. Before this flag, the
 * `--config` the CLI already shipped could only ever produce that 400 unless the
 * caller abandoned it for `--body`.
 *
 * So the assertion is on the BODY, not on the flag being declared: a flag parsed
 * into `opts` and never copied into the request is exactly the failure this
 * covers, and `--help` listing it would still look right.
 *
 * The contract half — that `{type, config}` parses and `{config}` alone does not —
 * lives in `test/unit/help-completeness.test.ts`, which may import `@nexus/types`;
 * `wire-types-bundle.test.ts` forbids that import in `src/`.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    agents: { tools: new AgentToolsResource({ request } as never) }
  })
}));

import { registerAgentToolCommands } from "./agent-tool";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerAgentToolCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const CONFIG = { workflowId: "8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f" };

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ id: "tool-456", label: "Order lookup" });
});

describe("agent-tool update", () => {
  it("sends --type beside --config", async () => {
    await run([
      "agent-tool",
      "update",
      "agt-123",
      "tool-456",
      "--type",
      "WORKFLOW",
      "--config",
      JSON.stringify(CONFIG)
    ]);

    expect(request).toHaveBeenCalledTimes(1);
    const [method, path, options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(method).toBe("PATCH");
    expect(path).toBe("/agents/agt-123/tools/tool-456");
    expect(options.body).toEqual({ type: "WORKFLOW", config: CONFIG });
  });

  it("still sends config alone when only --config is given", async () => {
    // The CLI does not invent a type: the API's own 400 is what tells the caller,
    // and inferring one here would send a type the caller never chose.
    await run(["agent-tool", "update", "agt-123", "tool-456", "--config", JSON.stringify(CONFIG)]);

    const [, , options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(options.body).toEqual({ config: CONFIG });
  });

  it("lets --body carry the type when the flag is absent", async () => {
    await run([
      "agent-tool",
      "update",
      "agt-123",
      "tool-456",
      "--body",
      JSON.stringify({ type: "WORKFLOW", config: CONFIG })
    ]);

    const [, , options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(options.body).toEqual({ type: "WORKFLOW", config: CONFIG });
  });
});
