import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerRoleCommands } from "./role";
import {
  ROLE_JOB_TYPES_CREATE_CONTRACT,
  ROLE_JOB_TYPES_UPDATE_CONTRACT
} from "./role.contract.generated";

/**
 * THE `--body` HELP NAMES EVERY FIELD THE ROUTE REQUIRES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE ORACLE IS THE GENERATED CONTRACT AND NOT A LIST TYPED HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `role create-job-type`'s Notes said *"every field is required"* and named six
 * of eleven. A caller following it verbatim got five validation errors naming
 * fields no surface mentions, and the escape the Notes offered — "read an
 * existing one" — does not exist in an organization with an empty library, which
 * is every new organization. The failure is not that a sentence was wrong; it is
 * that NOTHING read both the schema and the help.
 *
 * So the expectation is DERIVED from `role.contract.generated.ts`, which is
 * written by `scripts/generate-contract-help.ts` out of `@nexus/types` and is
 * gated against its own generator by `generated trees match their generators`. A
 * list typed into this file would be a third copy — the exact shape that
 * produced the defect.
 *
 * ⚠️ WHAT THIS CANNOT SEE. Both sides descend from `packages/types`, so this is
 * a reconciliation across two RENDERINGS of one contract rather than across two
 * independent facts. It catches a field the help omits and a field the help
 * invents. It cannot catch a field that leaves the contract and stays correct in
 * neither — that direction belongs to `Record<keyof RoleJobTypeBody, string>` in
 * `role-body-shapes.ts`, which is a compile error rather than a test.
 *
 * ⚠️ AND IT PINS THE KEY SET, NEVER THE SENTENCE. `fte number` where the
 * contract says `number | null` passes every assertion below.
 */

/** Render a leaf command's `--help` exactly as an operator sees it. */
function renderHelp(path: readonly string[]): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);

  let command: Command | undefined = program;
  for (const name of path) {
    command = command?.commands.find((c) => c.name() === name);
  }
  if (command === undefined) throw new Error(`No such command: nexus ${path.join(" ")}`);

  const chunks: string[] = [];
  command.configureOutput({ writeOut: (str) => chunks.push(str) });
  command.outputHelp();
  return chunks.join("");
}

/**
 * The hand-written half of a leaf's help — everything ABOVE the generated block.
 *
 * `bindCommand` appends a `Contract (METHOD /path):` reference that already
 * lists every field name, so asserting over the whole string would pass on a
 * command whose Notes named nothing at all. That is precisely the state this
 * file exists to refuse: the reference block is a schema dump, and the thing a
 * caller cannot get anywhere else is what each field MEANS and that `null` is
 * required rather than omission.
 */
function notesOnly(path: readonly string[]): string {
  const help = renderHelp(path);
  const contractAt = help.indexOf("\nContract (");
  return contractAt === -1 ? help : help.slice(0, contractAt);
}

/** Every required Body field of a descriptor, as its leaf name. */
function requiredBodyLeaves(descriptor: {
  readonly fields: readonly {
    readonly path: string;
    readonly slot: string;
    readonly required: boolean;
  }[];
}): string[] {
  return descriptor.fields
    .filter((field) => field.slot === "Body" && field.required)
    .map((field) => field.path.replace(/^Body\./, "").replace(/^parts\[\]\./, ""))
    .filter((leaf, index, all) => all.indexOf(leaf) === index);
}

/**
 * Every field name the ALIGNED BLOCK declares — four spaces, a key, two or more.
 *
 * Reading the block rather than the whole Notes is what makes the assertion able
 * to fail: prose sentences and the copyable JSON example mention field names
 * too, so a substring search over the Notes is satisfied by a block that names
 * nothing.
 */
function namedFields(notes: string): string[] {
  return [...notes.matchAll(/^ {4}([a-z][A-Za-z]*) {2,}/gm)]
    .map((match) => match[1])
    .filter((key, index, all) => all.indexOf(key) === index);
}

const JOB_TYPE_COMMANDS = [
  ["create-job-type", ROLE_JOB_TYPES_CREATE_CONTRACT],
  ["update-job-type", ROLE_JOB_TYPES_UPDATE_CONTRACT]
] as const;

describe("the job-type --body help names every field the route requires", () => {
  // ANTI-VACUITY FIRST. Every assertion below is over a derived list, and a
  // derivation that returned nothing would make all of them vacuously true —
  // which is how a gate reads green against a help block naming no field at all.
  it("derives a non-empty field set from the generated contract", () => {
    const leaves = requiredBodyLeaves(ROLE_JOB_TYPES_CREATE_CONTRACT);

    expect(leaves.length).toBeGreaterThan(10);
    // The five that were absent from the Notes and cost a first-read failure.
    expect(leaves).toContain("category");
    expect(leaves).toContain("quantityUnit");
    expect(leaves).toContain("hoursExpression");
    expect(leaves).toContain("revenueExpression");
    expect(leaves).toContain("unit");
  });

  it.each(JOB_TYPE_COMMANDS)("%s's FIELD BLOCK is exactly the contract's fields", (name, spec) => {
    // 🚨 `toContain` OVER THE WHOLE NOTES IS VACUOUS HERE, AND IT WAS MEASURED
    // BEING SO. Two mutants — dropping `quantityUnit` and dropping
    // `parts[].unit` from the field records — both SURVIVED that assertion: the
    // worked example below the block carries `"quantityUnit":"FTE"`, and
    // `quantityUnit` itself contains the substring `unit`. A caller cannot
    // compose a body from a JSON blob that happens to mention a key; the ALIGNED
    // BLOCK is the thing being asserted, so the assertion has to read it.
    const named = namedFields(notesOnly(["role", name]));
    const declared = requiredBodyLeaves(spec);

    expect([...named].sort()).toEqual([...declared].sort());
  });

  it("shows a complete body a caller can copy, carrying every required key", () => {
    const notes = notesOnly(["role", "create-job-type"]);
    const example = /\{"name":[\s\S]*?\}\]\}/.exec(notes.replace(/\n\s*/g, ""));

    expect(example, "no copyable JSON body in create-job-type --help").not.toBeNull();

    const parsed: unknown = JSON.parse(example?.[0] ?? "null");
    expect(parsed).not.toBeNull();

    // The example is what a first-read caller sends, so it has to satisfy the
    // contract rather than merely illustrate it. Every top-level required key
    // present, and the nested part carrying its own four.
    const body = parsed as Record<string, unknown>;
    for (const leaf of requiredBodyLeaves(ROLE_JOB_TYPES_CREATE_CONTRACT)) {
      if (["key", "label", "unit", "source"].includes(leaf)) continue;
      expect(body, `the worked example omits the required key "${leaf}"`).toHaveProperty(leaf);
    }
    const [part] = body.parts as Record<string, unknown>[];
    expect(part).toHaveProperty("key");
    expect(part).toHaveProperty("label");
    expect(part).toHaveProperty("unit");
    expect(part).toHaveProperty("source");
  });
});

describe("set-scope-lines names the line shape, and the field callers miss", () => {
  it("names all three keys and says scope is required", () => {
    const notes = notesOnly(["role", "set-scope-lines"]);

    // The ALIGNED BLOCK, for the reason the job-type case measured: the example
    // JSON below it carries all three names, so a substring search over the
    // whole Notes passes against a block that lists none of them.
    // `RoleScopeLineInputSchema` is a strict object of exactly these three, and
    // `scope` being required-and-undocumented was the defect — a caller sending
    // {jobTypeId, quantity, note} is refused twice in one response.
    expect(namedFields(notes).sort()).toEqual(["jobTypeId", "quantity", "scope"]);
    expect(notes).toContain("REQUIRED");
    // The key that does NOT exist, named as a refusal rather than left out: it
    // is the obvious guess for the text field, and a silent omission leaves the
    // guess standing.
    expect(notes).toContain('"note"');
  });

  it("shows a copyable body that parses and carries all three keys", () => {
    const notes = notesOnly(["role", "set-scope-lines"]);
    const example = /\{"lines":[\s\S]*?\}\]\}/.exec(notes.replace(/\n\s*/g, ""));

    expect(example).not.toBeNull();

    const parsed = JSON.parse(example?.[0] ?? "null") as { lines: Record<string, unknown>[] };
    const [line] = parsed.lines;

    expect(line).toHaveProperty("jobTypeId");
    expect(line).toHaveProperty("quantity");
    expect(line).toHaveProperty("scope");
    expect(line).not.toHaveProperty("note");
  });
});

describe("delete-job-type describes the refusal, not damage that does not happen", () => {
  it("says the call is REFUSED with a count, and nothing is modified", () => {
    const notes = notesOnly(["role", "delete-job-type"]);

    expect(notes).toContain("409");
    expect(notes).toContain("REFUSED WHILE ANYTHING STILL QUANTIFIES IT");
  });

  it("no longer claims a scope line loses its price model", () => {
    const notes = notesOnly(["role", "delete-job-type"]);

    // `DeleteOrganizationJobTypeUseCase` counts first and throws
    // `RoleJobTypeInUseError` (409) before the delete, and `RoleScopeLine`'s key
    // into the library is NO ACTION — so the database refuses it regardless.
    // The old sentence was scarier than the product, which costs caution rather
    // than data, and is still a false claim about a route.
    expect(notes).not.toContain("LOSES ITS PRICE MODEL");
    expect(notes).not.toContain("NOTHING SAYS WHICH");
  });

  it("keeps the true half: the count is org-wide and names no Role", () => {
    const notes = notesOnly(["role", "delete-job-type"]);

    expect(notes).toContain("nexus role scope-lines");
    expect(notes).toContain("ORG-WIDE");
  });
});

describe("update says an unknown field is dropped rather than refused", () => {
  it("names the silence, and the 400 that is the only signal", () => {
    const notes = notesOnly(["role", "update"]);

    // `RoleUpdateV1BodySchema` is `.pick()`ed off a plain `z.object`, so zod
    // STRIPS an unknown key: a typo answers 200 with the field unchanged.
    expect(notes).toContain("AN UNKNOWN FIELD IN --body IS DROPPED, NOT REFUSED");
    // The quoted server message wraps in the rendered block, so match it with
    // the line breaks collapsed. A single-line `toContain` fails here for a
    // reason that has nothing to do with the sentence being present.
    expect(notes.replace(/\s+/g, " ")).toContain("An update must change at least one field");
  });

  it("names the four the product has and this route does not", () => {
    const notes = notesOnly(["role", "update"]);

    for (const field of ["currency", "data-retention", "paused", "access card"]) {
      expect(notes).toContain(field);
    }
  });
});

describe("set-variables separates the two things called a formula check", () => {
  it("says a dimension key is refused, and that unit is not parsed", () => {
    const notes = notesOnly(["role", "set-variables"]);

    expect(notes).toContain("A VARIABLE CARRIES NO DIMENSION");
    expect(notes).toContain("DIMENSIONAL check");
  });

  it("does not let that be read as 'formulas are never checked'", () => {
    const notes = notesOnly(["role", "set-variables"]);

    // The coverage engine's formulas ARE dimension-checked and are authored in
    // the dashboard. A job type's expressions are infix STRINGS stored verbatim
    // — `RoleJobTypeExpressionSchema` is `z.string().max(500).nullable()` and no
    // server parses one. Collapsing the two is the misreading this paragraph is
    // written against, so the distinction has to survive an edit.
    expect(notes).toContain('THAT IS NOT "expressions are checked elsewhere and not here"');
    expect(notes).toContain("stored verbatim");
  });
});

describe("coverage enumerates its reason vocabulary", () => {
  it("names every reason both closed unions can answer", () => {
    const notes = notesOnly(["role", "coverage"]);

    // Read off `CoverageNotModelledReason` / `CoverageMoneyNotModelledReason`
    // through `Record<Union, true>` in `role-body-shapes.ts`, so an arm added to
    // the SDK is a compile error there rather than a reason no surface names.
    // Spelled out HERE on purpose: a test deriving them from the same Record
    // would assert the block equals itself.
    for (const reason of [
      "NO_WORKLOAD_MODEL",
      "NO_WORKING_TIME_MODEL",
      "WORKING_TIME_MODEL_INVALID",
      "WORKLOAD_MODEL_INVALID",
      "WORKLOAD_WRONG_DIMENSION",
      "WORKLOAD_ZERO_HOURS",
      "WORKLOAD_NEGATIVE_HOURS",
      "WORKLOAD_WRONG_PERIOD_BASIS",
      "RATIO_NOT_FINITE",
      "NO_CURRENCY"
    ]) {
      expect(notes, `coverage --help never names the reason "${reason}"`).toContain(reason);
    }
  });

  it("keeps a wrapped list readable as ONE list", () => {
    const notes = notesOnly(["role", "coverage"]);

    // A wrapped enumeration whose continuation lines carry no trailing comma
    // reads as several complete lists, and a caller who stops at the first has
    // an incomplete vocabulary with nothing telling them so.
    expect(notes).toMatch(/NO_WORKLOAD_MODEL, NO_WORKING_TIME_MODEL, WORKING_TIME_MODEL_INVALID,/);
  });

  it("says which reasons are org-wide, because those two answer for every Role", () => {
    const notes = notesOnly(["role", "coverage"]);

    expect(notes).toContain("org-wide rather than per Role");
    expect(notes).toContain("nexus role set-automation-settings");
  });
});

describe("role --help names the capabilities that have no verb here", () => {
  it("names all five, and says they exist in the product", () => {
    const help = renderHelp(["role"]);

    for (const capability of [
      "boards and card placement",
      "the system map",
      "a Role's workload",
      "a system's impact model",
      "task graduation"
    ]) {
      expect(help, `role --help never names "${capability}"`).toContain(capability);
    }

    // The sentence, not just the list. An enumeration of verbs is read as an
    // enumeration of the platform — a CEO audit of this namespace concluded the
    // product could not do these things, and the routes are all served today.
    expect(help).toContain("NOT THE PLATFORM'S LIMIT");
    expect(help).toContain("logged-in dashboard session");
  });

  it("does not list a verb the namespace actually has", () => {
    const program = new Command();
    program.name("nexus").exitOverride();
    registerRoleCommands(program);
    const role = program.commands.find((c) => c.name() === "role");
    const verbs = new Set((role?.commands ?? []).map((c) => c.name()));

    // Control: the enumeration is real, and `coverage` IS a verb — so a gap list
    // that named it would be wrong in the direction that sends a caller away
    // from a command they already have.
    expect(verbs.size).toBeGreaterThan(50);
    expect(verbs.has("coverage")).toBe(true);

    const help = renderHelp(["role"]);
    const gaps = help.slice(help.indexOf("WHAT THIS NAMESPACE DOES NOT COVER"));
    for (const verb of ["board", "card", "graduate", "system-map", "workload", "impact"]) {
      expect(verbs.has(verb), `"${verb}" is listed as absent but is a real verb`).toBe(false);
    }
    expect(gaps.length).toBeGreaterThan(200);
  });
});
