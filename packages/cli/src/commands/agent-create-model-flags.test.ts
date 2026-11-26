import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `agent create` sends the model flags AS GIVEN and lets the SERVER fill the rest.
 *
 * The server resolves a missing half against the deployment's vendor selection — a
 * model's own provider, a provider's designated model, or the offered default with
 * neither. A CLI that filled a missing half itself pinned `gpt-5.6-sol` / `OPEN_AI`
 * into an explicit choice, which a deployment with OpenAI switched off refuses, and
 * paired `--model-provider ANTHROPIC` with an OpenAI model id.
 *
 * So these cases assert the WIRE: the one request body the run sent. With no custom
 * model there is no `modelConfig` at all — only the flat mirrors the caller typed.
 */

const sent: Record<string, unknown>[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      agents: {
        create: (body: Record<string, unknown>) => {
          sent.push(body);
          return Promise.resolve({ id: "a1", firstName: "Ada", lastName: "Agent" });
        }
      }
    })
  };
});

import { registerAgentCommands } from "./agent";

async function create(...flags: string[]): Promise<Record<string, unknown>> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL");
  registerAgentCommands(program);

  const outSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await program.parseAsync([
      "node",
      "nexus",
      "agent",
      "create",
      "--first-name",
      "Ada",
      "--last-name",
      "Agent",
      "--role",
      "Support",
      ...flags
    ]);
  } finally {
    outSpy.mockRestore();
  }
  expect(sent).toHaveLength(1);
  return sent[0];
}

/** Only the model-bearing keys of a body, so each case states its whole model claim. */
const modelKeysOf = (body: Record<string, unknown>) => ({
  modelConfig: body.modelConfig,
  modelName: body.modelName,
  modelProvider: body.modelProvider
});

describe("agent create — the model flags reach the wire as given", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("neither flag: no model field at all, so the server picks the offered default", async () => {
    expect(modelKeysOf(await create())).toStrictEqual({
      modelConfig: undefined,
      modelName: undefined,
      modelProvider: undefined
    });
  });

  it("only --model-name: the name alone, no provider filled in", async () => {
    expect(modelKeysOf(await create("--model-name", "claude-sonnet-4-6"))).toStrictEqual({
      modelConfig: undefined,
      modelName: "claude-sonnet-4-6",
      modelProvider: undefined
    });
  });

  it("only --model-provider: the provider alone, never paired with gpt-5.6-sol", async () => {
    expect(modelKeysOf(await create("--model-provider", "ANTHROPIC"))).toStrictEqual({
      modelConfig: undefined,
      modelName: undefined,
      modelProvider: "ANTHROPIC"
    });
  });

  it("both flags: both, as given", async () => {
    expect(
      modelKeysOf(await create("--model-name", "gpt-5.5", "--model-provider", "OPEN_AI"))
    ).toStrictEqual({ modelConfig: undefined, modelName: "gpt-5.5", modelProvider: "OPEN_AI" });
  });
});
