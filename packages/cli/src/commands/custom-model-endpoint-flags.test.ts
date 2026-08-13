import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE PROVIDER'S ENDPOINT IS NOT THE NEXUS ENDPOINT, AND THE FLAGS MUST NOT BE
 * ABLE TO CONFUSE THEM.
 *
 * `custom-model create` and `update` used to declare `--base-url` and
 * `--api-key`, the same long names as two GLOBAL options. The root program
 * parses its own options across the whole of argv, so those never reached the
 * command: `create` was refused outright naming a flag the user had typed, and
 * `update` sent the CLI's own authenticated Nexus request to the third-party
 * host the user had named, carrying the provider's key in the `api-key` header.
 *
 * These cases pin the repair from both ends — the provider's values must land in
 * the BODY, and the globals must land on the TRANSPORT.
 */

const created: Array<Record<string, unknown>> = [];
const updated: Array<Record<string, unknown>> = [];
const clientOpts: Array<Record<string, unknown> | undefined> = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: (opts?: Record<string, unknown>) => {
      clientOpts.push(opts);
      return {
        customModels: {
          create: (body: Record<string, unknown>) => {
            created.push(body);
            return Promise.resolve({ id: "cm-1", displayName: "x" });
          },
          update: (_id: string, body: Record<string, unknown>) => {
            updated.push(body);
            return Promise.resolve({});
          }
        }
      };
    }
  };
});

import { parseTimeoutSeconds } from "../client";
import { applyBodySatisfiesRequired } from "../util/body-satisfies-required";
import { registerCustomModelCommands } from "./custom-model";

/** The message commander refuses with, via exitOverride so the process survives. */
async function refusalFor(argv: string[]): Promise<string> {
  const program = new Command();
  program
    .name("nexus")
    .exitOverride()
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL");
  registerCustomModelCommands(program);
  applyBodySatisfiesRequired(program);
  for (const cmd of program.commands) {
    cmd.exitOverride();
    for (const leaf of cmd.commands) leaf.exitOverride();
  }

  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    errSpy.mockRestore();
  }
}

async function run(argv: string[]): Promise<{ stderr: string; exitCode: number | undefined }> {
  const program = new Command();
  // Mirror the real globals, including the two that used to be shadowed.
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerCustomModelCommands(program);
  applyBodySatisfiesRequired(program);

  let stderr = "";
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  });
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return { stderr, exitCode: process.exitCode };
  } finally {
    errSpy.mockRestore();
    logSpy.mockRestore();
    process.exitCode = undefined;
  }
}

beforeEach(() => {
  created.length = 0;
  updated.length = 0;
  clientOpts.length = 0;
});

describe("custom-model create", () => {
  it("puts the provider's endpoint in the BODY and the globals on the TRANSPORT", async () => {
    await run([
      "custom-model",
      "create",
      "--display-name",
      "M",
      "--model-name",
      "llama",
      "--endpoint-url",
      "https://provider.example/v1",
      "--endpoint-key",
      "provider-secret",
      "--base-url",
      "https://api-staging.example",
      "--api-key",
      "nexus-key"
    ]);

    expect(created).toEqual([
      {
        displayName: "M",
        modelName: "llama",
        baseUrl: "https://provider.example/v1",
        apiKey: "provider-secret"
      }
    ]);
    // The exposure, from the other side: the CLI's own request must be aimed at
    // Nexus with the Nexus key, never at the host named for the provider.
    expect(clientOpts[0]).toMatchObject({
      baseUrl: "https://api-staging.example",
      apiKey: "nexus-key"
    });
  });

  it("accepts the whole body through --body, with the API's own field names", async () => {
    await run([
      "custom-model",
      "create",
      "--body",
      JSON.stringify({
        displayName: "M",
        modelName: "llama",
        baseUrl: "https://provider.example/v1",
        apiKey: "provider-secret"
      })
    ]);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ baseUrl: "https://provider.example/v1" });
  });

  it("refuses a missing provider endpoint by its BODY FIELD name, not the flag's attribute", async () => {
    // The refusal comes from `applyBodySatisfiesRequired`, which resolves the
    // body key through the join `satisfiedByBodyField` declared on the flag.
    // `--endpoint-url`'s attribute name is `endpointUrl`; the API field is
    // `baseUrl`, and naming the attribute would send the operator to add a key
    // the server discards.
    const message = await refusalFor([
      "custom-model",
      "create",
      "--display-name",
      "M",
      "--model-name",
      "llama"
    ]);

    expect(created).toEqual([]);
    expect(message).toContain('"baseUrl" inside --body');
    expect(message).not.toContain("endpointUrl");
  });

  it("lets the flag win over the same field in --body", async () => {
    await run([
      "custom-model",
      "create",
      "--body",
      JSON.stringify({ displayName: "M", modelName: "l", baseUrl: "from-body", apiKey: "k" }),
      "--endpoint-url",
      "from-flag"
    ]);

    expect(created[0]).toMatchObject({ baseUrl: "from-flag" });
  });
});

describe("custom-model update", () => {
  it("rotates the provider's key through the body instead of the transport", async () => {
    await run([
      "custom-model",
      "update",
      "cm-1",
      "--endpoint-key",
      "rotated-provider-key",
      "--base-url",
      "https://api-staging.example",
      "--api-key",
      "nexus-key"
    ]);

    expect(updated).toEqual([{ apiKey: "rotated-provider-key" }]);
    expect(clientOpts[0]).toMatchObject({
      baseUrl: "https://api-staging.example",
      apiKey: "nexus-key"
    });
  });
});
