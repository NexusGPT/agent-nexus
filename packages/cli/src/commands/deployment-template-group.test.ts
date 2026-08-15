import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `templateGroup` MUST BE REACHABLE FROM BOTH TEMPLATE COMMANDS (NEX-3913).
 *
 * `AttachWhatsappTemplateBodySchema` and `UpdateDeploymentTemplateBodySchema`
 * both declare `templateGroup`. It is the STANDARD-template sibling of
 * `carouselTemplateGroup` — the attach schema's own refine says the two are
 * mutually exclusive, one per template shape. The route honours it end to end:
 * the controller copies it onto the template object, the use case pushes that
 * object into `whatsappTemplateMessages`, the repository merges it into
 * `Deployment.deploymentSettings`, and `template-resolver.service.ts` reads
 * `templateGroup.availableLanguages` to pick a template at send time.
 *
 * Neither command declared a flag for it and neither carries `--body`, so the
 * field was unreachable. The consequence is not cosmetic:
 * `--enable-multi-language` turned the setting ON for a standard template while
 * the per-language map that setting reads could not be supplied through the same
 * command — switchable and unusable in one breath.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THESE CASES ASSERT, AND WHAT WOULD BE USELESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The REQUEST BODY, never the exit code. A field the CLI never sends produces no
 * error anywhere — every spelling below exited 0 before the fix. A case
 * asserting "the command succeeded" passes against the bug, which is how this
 * shipped.
 *
 * The body is asserted as it CROSSES THE WIRE, i.e. after `JSON.stringify` —
 * `attachDeploymentTemplate` builds one object literal with every optional key
 * present, so `expect(body).not.toHaveProperty("templateGroup")` is false for a
 * key whose value is `undefined` and would fail on a correct absence. The SDK's
 * `http-client.ts` stringifies the body, and `undefined` values do not survive
 * that. What survives is the assertion worth making.
 *
 * `flag-defaults-never-overwrite-body.test.ts` is BLIND to this defect and could
 * not have caught it. It reads the literal default argument of an `.option(...)`
 * call; a MISSING `.option(...)` has no call to read. A scanner over declarations
 * is structurally blind to a declaration that is absent — which is why this file
 * drives the real command instead.
 */

interface Attached {
  deploymentId: string;
  body: Record<string, unknown>;
}

interface Updated {
  deploymentId: string;
  templateId: string;
  body: Record<string, unknown>;
}

const attached: Attached[] = [];
const updated: Updated[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      deployments: {
        attachDeploymentTemplate: (deploymentId: string, body: Record<string, unknown>) => {
          attached.push({ deploymentId, body });
          return Promise.resolve({ templateId: body.templateId, name: body.name });
        },
        updateDeploymentTemplate: (
          deploymentId: string,
          templateId: string,
          body: Record<string, unknown>
        ) => {
          updated.push({ deploymentId, templateId, body });
          return Promise.resolve({ templateId, name: "welcome" });
        }
      }
    })
  };
});

import { registerDeploymentCommands } from "./deployment";

const DEPLOYMENT_ID = "dep-123";
const TEMPLATE_ID = "HX456";

const TEMPLATE_GROUP = {
  baseName: "welcome",
  availableLanguages: [
    { language: "en", templateId: "HX456" },
    { language: "fr", templateId: "HX789" }
  ],
  defaultLanguage: "en"
};

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

const attach = (...flags: string[]): string[] => [
  "deployment",
  "template",
  "attach",
  DEPLOYMENT_ID,
  "--template-id",
  TEMPLATE_ID,
  "--name",
  "welcome",
  "--description",
  "Welcome message",
  ...flags
];

const update = (...flags: string[]): string[] => [
  "deployment",
  "template",
  "update",
  DEPLOYMENT_ID,
  TEMPLATE_ID,
  ...flags
];

/**
 * The body of the single request the run made, as the SDK serialises it.
 * `undefined` keys are dropped by `JSON.stringify`, so this is what the route
 * actually receives rather than what the object literal happens to carry.
 */
const wireBody = (calls: { body: Record<string, unknown> }[]): Record<string, unknown> => {
  expect(calls).toHaveLength(1);
  return JSON.parse(JSON.stringify(calls[0].body)) as Record<string, unknown>;
};

describe("deployment template attach — --template-group reaches the wire", () => {
  beforeEach(() => {
    attached.length = 0;
    updated.length = 0;
    process.exitCode = undefined;
  });

  it("sends templateGroup when the flag is named", async () => {
    await run(
      attach("--enable-multi-language", "--template-group", JSON.stringify(TEMPLATE_GROUP))
    );

    expect(wireBody(attached).templateGroup).toEqual(TEMPLATE_GROUP);
    expect(wireBody(attached).enableMultiLanguage).toBe(true);
  });

  it("sends NO templateGroup key when the flag is absent", async () => {
    // THE CONTROL. A fix that forwarded the option unconditionally would satisfy
    // the case above while writing a key into every attach that never named it.
    await run(attach());

    expect(wireBody(attached)).not.toHaveProperty("templateGroup");
    expect(wireBody(attached).templateId).toBe(TEMPLATE_ID);
  });

  it("refuses invalid JSON and sends nothing", async () => {
    const { stderr } = await run(attach("--template-group", "{not json"));

    expect(attached).toHaveLength(0);
    expect(process.exitCode).not.toBe(0);
    expect(stderr).toMatch(/--template-group must be valid JSON/);
  });

  it("leaves carouselTemplateGroup alone", async () => {
    // The two are mutually exclusive at the route. A flag that wrote into its
    // sibling's key would be a 400 on every standard template, and the exit code
    // would still be 0 here.
    await run(attach("--template-group", JSON.stringify(TEMPLATE_GROUP)));

    expect(wireBody(attached)).not.toHaveProperty("carouselTemplateGroup");
  });
});

describe("deployment template update — --template-group reaches the wire", () => {
  beforeEach(() => {
    attached.length = 0;
    updated.length = 0;
    process.exitCode = undefined;
  });

  it("sends templateGroup when the flag is named", async () => {
    await run(update("--template-group", JSON.stringify(TEMPLATE_GROUP)));

    expect(wireBody(updated)).toEqual({ templateGroup: TEMPLATE_GROUP });
  });

  it("sends NO templateGroup key when the flag is absent", async () => {
    await run(update("--name", "Updated Welcome"));

    expect(wireBody(updated)).toEqual({ name: "Updated Welcome" });
    expect(wireBody(updated)).not.toHaveProperty("templateGroup");
  });

  it("refuses invalid JSON and sends nothing", async () => {
    const { stderr } = await run(update("--template-group", "{not json"));

    expect(updated).toHaveLength(0);
    expect(process.exitCode).not.toBe(0);
    expect(stderr).toMatch(/--template-group must be valid JSON/);
  });

  it("carries the switch and its map in one request", async () => {
    // The whole point of the ticket: the setting and the map the setting reads
    // must be expressible in a single command.
    await run(
      update("--enable-multi-language", "--template-group", JSON.stringify(TEMPLATE_GROUP))
    );

    expect(wireBody(updated)).toEqual({
      enableMultiLanguage: true,
      templateGroup: TEMPLATE_GROUP
    });
  });
});
