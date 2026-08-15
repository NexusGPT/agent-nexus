import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `deployment template update` MUST BE ABLE TO TURN A SETTING OFF (NEX-3905).
 *
 * The command declared four flags for two settings — `--enable-multi-language`
 * / `--no-multi-language` and `--enable-dynamic-size` / `--no-dynamic-size` —
 * and read only the `enable*` keys. Commander derives an option key from that
 * option's OWN long name, so the two negative flags wrote `opts.multiLanguage`
 * and `opts.dynamicSize`, which nothing read. They parsed, they were accepted,
 * they reached the wire as NOTHING, and the command printed `Deployment
 * template updated.` over an unchanged setting. Turning multi-language off was
 * not expressible through this command at all.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THESE CASES ASSERT, AND WHAT WOULD BE USELESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The REQUEST BODY, never the exit code. Every spelling below exited 0 before
 * the fix and exits 0 after it; the whole difference is one key in one object.
 * A case asserting "the command succeeded" passes against the bug.
 *
 * `flag-defaults-never-overwrite-body.test.ts` is the gate for this defect
 * class and it is STRUCTURALLY BLIND here: it reads the literal default
 * argument of an `.option(...)` call, and a `--no-x` flag declares none —
 * commander implies its `true`. So the whole `--no-*` class is invisible to it
 * and it stayed green through the entire life of this bug. Nothing in that file
 * pins anything below.
 *
 * The "flag absent" case is the one that is easy to omit and expensive to get
 * wrong. Declared with no positive twin on its own key, `--no-multi-language`
 * carries commander's implicit default `true`; forwarding `opts.multiLanguage`
 * unconditionally would satisfy the negative case while writing
 * `enableMultiLanguage: true` into every body that never named the flag — the
 * same silent write, in the opposite direction, past the gate written for it.
 */

interface Sent {
  deploymentId: string;
  templateId: string;
  body: Record<string, unknown>;
}

const sent: Sent[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      deployments: {
        updateDeploymentTemplate: (
          deploymentId: string,
          templateId: string,
          body: Record<string, unknown>
        ) => {
          sent.push({ deploymentId, templateId, body });
          return Promise.resolve({ templateId, name: "welcome" });
        }
      }
    })
  };
});

import { registerDeploymentCommands } from "./deployment";

const DEPLOYMENT_ID = "dep-123";
const TEMPLATE_ID = "HX456";

async function run(argv: string[]): Promise<{ stdout: string; stderr: string }> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL");
  registerDeploymentCommands(program);

  let stdout = "";
  let stderr = "";
  const outSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  });
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { stdout, stderr };
}

const update = (...flags: string[]): string[] => [
  "deployment",
  "template",
  "update",
  DEPLOYMENT_ID,
  TEMPLATE_ID,
  ...flags
];

/** The body of the single request the run made. */
const bodyOf = (): Record<string, unknown> => {
  expect(sent).toHaveLength(1);
  return sent[0].body;
};

describe("deployment template update — the disable flags reach the wire", () => {
  beforeEach(() => {
    sent.length = 0;
    process.exitCode = undefined;
  });

  describe("multi-language", () => {
    it("--no-multi-language sends enableMultiLanguage: false", async () => {
      await run(update("--no-multi-language"));

      expect(bodyOf()).toEqual({ enableMultiLanguage: false });
    });

    it("--enable-multi-language sends enableMultiLanguage: true", async () => {
      await run(update("--enable-multi-language"));

      expect(bodyOf()).toEqual({ enableMultiLanguage: true });
    });

    it("omitting both flags sends NO enableMultiLanguage key", async () => {
      // THE CONTROL. Commander defaults `opts.multiLanguage` to `true` with
      // nobody typing anything, so a fix that forwarded it unconditionally
      // would pass the case above and turn multi-language ON for an operator
      // who only meant to rename a template.
      await run(update("--name", "Updated Welcome"));

      expect(bodyOf()).toEqual({ name: "Updated Welcome" });
      expect(bodyOf()).not.toHaveProperty("enableMultiLanguage");
    });
  });

  describe("dynamic size", () => {
    it("--no-dynamic-size sends enableDynamicSize: false", async () => {
      await run(update("--no-dynamic-size"));

      expect(bodyOf()).toEqual({ enableDynamicSize: false });
    });

    it("--enable-dynamic-size sends enableDynamicSize: true", async () => {
      await run(update("--enable-dynamic-size"));

      expect(bodyOf()).toEqual({ enableDynamicSize: true });
    });

    it("omitting both flags sends NO enableDynamicSize key", async () => {
      await run(update("--name", "Updated Welcome"));

      expect(bodyOf()).toEqual({ name: "Updated Welcome" });
      expect(bodyOf()).not.toHaveProperty("enableDynamicSize");
    });
  });

  describe("both spellings of one setting", () => {
    it("refuses --enable-multi-language with --no-multi-language, and sends nothing", async () => {
      const { stderr } = await run(update("--enable-multi-language", "--no-multi-language"));

      expect(sent).toHaveLength(0);
      expect(process.exitCode).not.toBe(0);
      expect(stderr).toMatch(/--enable-multi-language and --no-multi-language contradict/);
    });

    it("refuses --enable-dynamic-size with --no-dynamic-size, and sends nothing", async () => {
      const { stderr } = await run(update("--enable-dynamic-size", "--no-dynamic-size"));

      expect(sent).toHaveLength(0);
      expect(process.exitCode).not.toBe(0);
      expect(stderr).toMatch(/--enable-dynamic-size and --no-dynamic-size contradict/);
    });
  });

  describe("the two settings do not contaminate each other", () => {
    it("--no-multi-language leaves dynamic size untouched", async () => {
      await run(update("--no-multi-language"));

      expect(bodyOf()).not.toHaveProperty("enableDynamicSize");
    });

    it("both disable flags together send both fields as false", async () => {
      await run(update("--no-multi-language", "--no-dynamic-size"));

      expect(bodyOf()).toEqual({ enableMultiLanguage: false, enableDynamicSize: false });
    });
  });
});
