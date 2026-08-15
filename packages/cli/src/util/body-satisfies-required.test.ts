import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import { enumOption } from "../contract-binding";
import { buildRootProgram } from "../index";
import { resolveRequiredBody } from "./body";
import {
  applyBodySatisfiesRequired,
  findDeferredRequirements,
  missingFieldMessage,
  resolveBodyField,
  satisfiedByBodyField
} from "./body-satisfies-required";
import {
  commandPath,
  MINIMUM_DEFERRED_COMMANDS,
  rebuildTreeWithoutTheFix,
  TREE_TIMEOUT_MS
} from "./deferred-requirements.testkit";

const COMMANDS_DIR = join(__dirname, "../commands");
const INDEX_TS = join(__dirname, "../index.ts");

/**
 * The rebuild and the floors live in `deferred-requirements.testkit.ts`, so this
 * spec and `body-scalar-reaches-the-action.test.ts` measure ONE population. Two
 * copies of the rebuild is two things to drift, and the drift is silent — the
 * stale copy keeps passing over a population that has quietly shrunk.
 *
 * The drift guard below is what makes "the same tree" a checked claim rather
 * than a comment: the set of one-argument `register*` exports and the set of
 * `register*(program)` calls in `root-program.ts` must be equal in BOTH
 * directions. A registrar that stops being wired, or one wired without being
 * discoverable here, fails that test rather than silently shrinking the
 * population every other test in this file measures.
 */
async function discoveredRegistrars(): Promise<string[]> {
  const out: string[] = [];
  const files = readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".conformance.ts"))
    .sort();
  for (const file of files) {
    const mod = (await import(join(COMMANDS_DIR, file))) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (name.startsWith("register") && typeof value === "function" && value.length === 1) {
        out.push(name);
      }
    }
  }
  return out.sort();
}

describe("the tree this file measures is the tree the entry point builds", () => {
  it(
    "wires every one-argument registrar, and wires nothing else",
    async () => {
      const discovered = await discoveredRegistrars();
      const wired = [
        ...readFileSync(INDEX_TS, "utf-8").matchAll(/^\s*(register[A-Za-z]+)\(program\);$/gm)
      ]
        .map((m) => m[1])
        .sort();

      expect(discovered.length).toBeGreaterThan(30); // control: discovery found a tree
      expect(wired).toEqual(discovered);
    },
    TREE_TIMEOUT_MS
  );
});

describe("no command can be blocked from a body-only invocation", () => {
  it(
    "finds the population before the fix is applied — the detector detects",
    async () => {
      const found = findDeferredRequirements(await rebuildTreeWithoutTheFix());

      // CONTROL. A collapsed population and a working fix are the same empty
      // result, and `toBeGreaterThan(0)` survived a collapse from dozens to one.
      // The floor is a real minimum, and it lives beside the derivation.
      expect(found.length).toBeGreaterThanOrEqual(MINIMUM_DEFERRED_COMMANDS);
      expect(found.map((f) => commandPath(f.command))).toContain("agent create");
    },
    TREE_TIMEOUT_MS
  );

  it(
    "leaves nothing behind in the REAL root program",
    async () => {
      // The actual object `index.ts` parses with, `applyBodySatisfiesRequired`
      // already applied. Not a reconstruction.
      expect(
        findDeferredRequirements(buildRootProgram()).map((f) => commandPath(f.command))
      ).toEqual([]);
    },
    TREE_TIMEOUT_MS
  );

  it(
    "only ever defers on a leaf, so the pre-action hook always runs",
    async () => {
      const nonLeaves = findDeferredRequirements(await rebuildTreeWithoutTheFix())
        .filter((f) => f.command.commands.length > 0)
        .map((f) => commandPath(f.command));

      // A command with subcommands would have its mandatory options checked while
      // a SUBCOMMAND runs, where this seam's own hook never fires — the deferral
      // would then delete the requirement instead of moving it.
      expect(nonLeaves).toEqual([]);
    },
    TREE_TIMEOUT_MS
  );
});

interface Harness {
  program: Command;
  seen: () => Record<string, unknown> | undefined;
  errors: () => string[];
}

function harness(declare: (command: Command) => Command): Harness {
  let seen: Record<string, unknown> | undefined;
  const errors: string[] = [];
  const program = new Command()
    .name("t")
    .exitOverride()
    .configureOutput({ writeErr: (s) => errors.push(s), writeOut: () => {} });
  declare(program.command("go")).action((opts: Record<string, unknown>) => {
    seen = opts;
  });
  applyBodySatisfiesRequired(program);
  return { program, seen: () => seen, errors: () => errors };
}

const declareGo = (command: Command): Command =>
  command
    .requiredOption("--first-name <name>", "first name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin");

describe("a field inside --body satisfies its required flag", () => {
  it("runs the action when only --body carries the field", async () => {
    const h = harness(declareGo);
    await h.program.parseAsync(["go", "--body", '{"firstName":"Ada"}'], { from: "user" });
    expect(h.seen()).toBeDefined();
    expect(h.errors()).toEqual([]);
  });

  it("still runs when only the flag carries it", async () => {
    const h = harness(declareGo);
    await h.program.parseAsync(["go", "--first-name", "Ada"], { from: "user" });
    expect(h.seen()?.firstName).toBe("Ada");
  });

  it("keeps the flag winning when both carry it", async () => {
    const h = harness(declareGo);
    await h.program.parseAsync(["go", "--first-name", "Flag", "--body", '{"firstName":"Body"}'], {
      from: "user"
    });
    // The seam does not merge. It must not touch the value the action reads, or
    // it would silently disagree with `mergeBodyWithFlags` a moment later.
    expect(h.seen()?.firstName).toBe("Flag");
  });

  it("refuses when NEITHER carries it, and names both paths", async () => {
    const h = harness(declareGo);
    await expect(
      h.program.parseAsync(["go", "--body", '{"somethingElse":1}'], { from: "user" })
    ).rejects.toThrow();

    const written = h.errors().join("");
    expect(written).toContain("error: required option '--first-name <name>' not specified");
    expect(written).toContain('"firstName"');
    expect(written).toContain("--body");
    expect(h.seen()).toBeUndefined();
  });

  it("refuses when --body is absent altogether", async () => {
    const h = harness(declareGo);
    await expect(h.program.parseAsync(["go"], { from: "user" })).rejects.toThrow();
    expect(h.errors().join("")).toContain("not specified");
    expect(h.seen()).toBeUndefined();
  });
});

describe("the message names both paths", () => {
  it("keeps commander's own first clause byte-identical", () => {
    const [option] = new Command().requiredOption("--first-name <name>", "x").options;
    const message = missingFieldMessage(option, "--body", "firstName");

    // Anything already matching commander's string keeps matching.
    expect(message.startsWith("error: required option '--first-name <name>' not specified")).toBe(
      true
    );
    expect(message).toContain('as "firstName" inside --body');
    expect(message).toContain("the flag wins");
  });
});

describe("the body is resolved once, so the check and the request agree", () => {
  it("returns the FIRST read even when the file changes underneath", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "nexus-body-")), "b.json");
    writeFileSync(file, JSON.stringify({ name: "first" }));

    const before = await resolveRequiredBody(file);
    writeFileSync(file, JSON.stringify({ name: "second" }));
    const after = await resolveRequiredBody(file);

    // The pre-action check approves one set of bytes and the action builds the
    // request from another unless this holds. For `--body -` the second read
    // does not merely differ — stdin has already emitted `end`, so the promise
    // never settles and the CLI hangs with no output at all.
    expect(before).toEqual({ name: "first" });
    expect(after).toEqual({ name: "first" });

    // CONTROL: the cache is keyed on the raw value, not global. A different
    // path must still be read.
    const other = join(mkdtempSync(join(tmpdir(), "nexus-body-")), "b.json");
    writeFileSync(other, JSON.stringify({ name: "other" }));
    expect(await resolveRequiredBody(other)).toEqual({ name: "other" });
  });
});

describe("a prose --body is not a request body", () => {
  it("leaves `--body <text-or-->` alone", () => {
    const program = new Command().name("t");
    program
      .command("comment")
      .requiredOption("--body <text-or-->", "Comment text")
      .action(() => {});
    // `ticket comment --body` is the comment itself. Nothing to defer, and
    // deferring it would delete a real requirement.
    expect(findDeferredRequirements(program)).toEqual([]);
  });
});

describe("which body key satisfies a flag", () => {
  const optionNamed = (flags: string): Option => {
    const [o] = new Command().option(flags, "x").options;
    return o;
  };

  it("falls back to the flag's own attribute name", () => {
    expect(resolveBodyField(optionNamed("--first-name <n>"))).toEqual({
      field: "firstName",
      source: "attribute"
    });
  });

  it("prefers a declared field over the flag's name", () => {
    // The case the shadowing fix manufactures: the flag CANNOT be called
    // --base-url, because that global would eat its value.
    const option = satisfiedByBodyField(optionNamed("--endpoint-url <url>"), "baseUrl");
    expect(resolveBodyField(option)).toEqual({ field: "baseUrl", source: "declared" });
  });

  it("reads a contract binding that points into the Body slot", () => {
    const option = enumOption("--mode <m>", "mode", {
      path: "DocumentAddWebsite.Body.crawlMode",
      contractValues: ["sitemap", "crawl"]
    });
    expect(resolveBodyField(option)).toEqual({ field: "crawlMode", source: "contract" });
  });

  it("ignores a contract binding that points at Params, which is not a body key", () => {
    const option = enumOption("--group-by <g>", "group", {
      path: "AnalyticsOverview.Params.groupBy",
      contractValues: ["day", "week"]
    });
    expect(resolveBodyField(option)).toEqual({ field: "groupBy", source: "attribute" });
  });

  it("agrees silently when both channels name the same field", () => {
    const option = satisfiedByBodyField(
      enumOption("--mode <m>", "mode", {
        path: "X.Body.mode",
        contractValues: ["sitemap"]
      }),
      "mode"
    );
    expect(resolveBodyField(option)).toEqual({ field: "mode", source: "declared" });
  });

  it("GOES RED when the two channels contradict each other", () => {
    const option = satisfiedByBodyField(
      enumOption("--mode <m>", "mode", {
        path: "X.Body.crawlMode",
        contractValues: ["sitemap"]
      }),
      "someOtherField"
    );
    // Never a silent winner: one of the two is wrong and picking either hides it.
    expect(() => resolveBodyField(option)).toThrow(/"someOtherField".*"crawlMode"/s);
  });

  it("throws while the tree is being BUILT, not on some later invocation", () => {
    const program = new Command().name("t");
    program
      .command("go")
      .addOption(
        satisfiedByBodyField(
          enumOption("--mode <m>", "mode", { path: "X.Body.a", contractValues: ["v"] }),
          "b"
        ).makeOptionMandatory(true)
      )
      .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
      .action(() => {});

    expect(() => applyBodySatisfiesRequired(program)).toThrow(/--mode <m>/);
  });
});

describe("the refusal names the key it actually checked", () => {
  it("names the DECLARED field, never the flag's camelCase", async () => {
    let ran = false;
    const errors: string[] = [];
    const program = new Command()
      .name("t")
      .exitOverride()
      .configureOutput({ writeErr: (s) => errors.push(s), writeOut: () => {} });
    program
      .command("go")
      .addOption(
        satisfiedByBodyField(
          new Option("--endpoint-url <url>", "url"),
          "baseUrl"
        ).makeOptionMandatory(true)
      )
      .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
      .action(() => {
        ran = true;
      });
    applyBodySatisfiesRequired(program);

    // A body carrying the API's real field name must be ACCEPTED.
    await program.parseAsync(["go", "--body", '{"baseUrl":"https://p.example/v1"}'], {
      from: "user"
    });
    expect(ran).toBe(true);
    expect(errors).toEqual([]);

    // And a body missing it must be refused naming "baseUrl", never "endpointUrl".
    const second = new Command()
      .name("t")
      .exitOverride()
      .configureOutput({ writeErr: (s) => errors.push(s), writeOut: () => {} });
    second
      .command("go")
      .addOption(
        satisfiedByBodyField(
          new Option("--endpoint-url <url>", "url"),
          "baseUrl"
        ).makeOptionMandatory(true)
      )
      .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
      .action(() => {});
    applyBodySatisfiesRequired(second);
    errors.length = 0;
    await expect(
      second.parseAsync(["go", "--body", '{"displayName":"M"}'], { from: "user" })
    ).rejects.toThrow();

    const written = errors.join("");
    expect(written).toContain('"baseUrl" inside --body');
    expect(written).not.toContain("endpointUrl");
  });
});
