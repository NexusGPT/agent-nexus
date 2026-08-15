import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `agent update --prompt` PUBLISHES, AND THE OPERATOR HAS TO BE ABLE TO SEE AND
 * DECLINE IT (NEX-3848, from the production report in NEX-3384).
 *
 * A prompt written through this command became the agent's production version
 * in the same call — on every live deployment, with no flag to decline it and
 * nothing in the output naming it. An Orange operator staged an edit they
 * believed was private and it answered real WhatsApp customers for ~2.5 hours.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THESE CASES ASSERT, AND WHAT WOULD BE USELESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The WIRE, never the exit code. Every spelling below answered 200 before the
 * fix and answers 200 after it; the difference is one field in the body and one
 * sentence on stdout. A case asserting "the update succeeded" passes against the
 * bug — that is exactly the check the customer ran, twice, and it reassured them
 * both times.
 *
 * The three body cases are a set, and the middle one is the one that is easy to
 * omit and expensive to get wrong. Commander gives a `--no-x` flag the implicit
 * default `true`, which is INVISIBLE to
 * `flag-defaults-never-overwrite-body.test.ts` — that gate reads a literal
 * default argument on `.option(...)`, and `--no-publish` declares none. Sending
 * the flag's value unconditionally would therefore let a default nobody typed
 * overwrite an explicit `--body '{"autoPublish":false}'` and publish anyway:
 * this defect, re-introduced one layer up, past the gate written for it.
 */

interface Sent {
  id: string;
  body: Record<string, unknown>;
}

const sent: Sent[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      agents: {
        update: (id: string, body: Record<string, unknown>) => {
          sent.push({ id, body });
          return Promise.resolve({ id });
        }
      }
    })
  };
});

import { registerAgentCommands } from "./agent";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";

async function run(argv: string[]): Promise<string> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL");
  registerAgentCommands(program);

  let stdout = "";
  const outSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  });
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    outSpy.mockRestore();
  }
  return stdout;
}

/** The body of the single request the run made. */
const bodyOf = (): Record<string, unknown> => {
  expect(sent).toHaveLength(1);
  return sent[0].body;
};

describe("agent update — the publish is visible and declinable", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  describe("what reaches the wire", () => {
    it("--no-publish sends autoPublish: false", async () => {
      await run(["agent", "update", AGENT_ID, "--prompt", "You are helpful", "--no-publish"]);

      expect(bodyOf()).toEqual({ prompt: "You are helpful", autoPublish: false });
    });

    it("omitting the flag sends NO autoPublish key, so no shipped caller changes", async () => {
      // THE CONTROL for the case above and the no-break guarantee in one. If the
      // flag's value were sent unconditionally this would carry
      // `autoPublish: true`, and the case below would fail too.
      await run(["agent", "update", AGENT_ID, "--prompt", "You are helpful"]);

      expect(bodyOf()).toEqual({ prompt: "You are helpful" });
      expect(bodyOf()).not.toHaveProperty("autoPublish");
    });

    it("an explicit --body autoPublish:false survives, un-overwritten by the flag's default", async () => {
      await run([
        "agent",
        "update",
        AGENT_ID,
        "--body",
        '{"prompt":"You are helpful","autoPublish":false}'
      ]);

      expect(bodyOf().autoPublish).toBe(false);
    });
  });

  describe("what the operator is told", () => {
    it("names the publish when the prompt goes live", async () => {
      const out = await run(["agent", "update", AGENT_ID, "--prompt", "You are helpful"]);

      expect(out).toMatch(/PUBLISHED/);
    });

    it("says the prompt was NOT published when it was not", async () => {
      const out = await run([
        "agent",
        "update",
        AGENT_ID,
        "--prompt",
        "You are helpful",
        "--no-publish"
      ]);

      expect(out).toMatch(/NOT published/);
      expect(out).not.toMatch(/PUBLISHED —/);
    });

    it("reads the verdict off --body too, not only off the flags", async () => {
      // `--body` can carry both fields, so a verdict computed from `opts` alone
      // would announce a publish that did not happen.
      const out = await run([
        "agent",
        "update",
        AGENT_ID,
        "--body",
        '{"prompt":"You are helpful","autoPublish":false}'
      ]);

      expect(out).toMatch(/NOT published/);
    });

    it("says nothing about publishing when no prompt was sent", async () => {
      const out = await run(["agent", "update", AGENT_ID, "--role", "Senior Assistant"]);

      expect(out).not.toMatch(/[Pp]ublish/);
    });
  });
});
