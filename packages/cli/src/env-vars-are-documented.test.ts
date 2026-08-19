import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, describe, expect, it } from "vitest";

import { captureHelp, deriveCommandNodes } from "./command-universe";
import {
  ENV_VAR_DOCUMENTATION,
  readEnvVarNames,
  ROOT_SCREEN,
  SOURCE_ROOTS
} from "./env-vars-are-documented.scan";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * THE `NEXUS_*` PARTITION, RENDERED RATHER THAN GREPPED.
 *
 * The rule and the obligation set live in `env-vars-are-documented.scan.ts`;
 * read its header first. This file renders every help screen and asserts the
 * partition.
 *
 * 🚨 THE RENDERING IS THE POINT, AND A GREP HERE WOULD REPRODUCE THE DEFECT.
 * The claim this gate protects is about what a READER IS TOLD. Source says what
 * the binary READS. The contract went wrong by answering the second question and
 * writing the answer under the first, so this file never reads source for the
 * documentation half — it renders 605 screens and searches their text.
 */

/** Every screen the binary can print: the root program plus every command node. */
let screens: ReadonlyArray<readonly [string, string]> = [];
let nodeCount = 0;

beforeAll(async () => {
  const nodes = await deriveCommandNodes();
  nodeCount = nodes.length;
  screens = [
    [ROOT_SCREEN, captureHelp(buildRootProgram(VERSION))] as const,
    ...nodes.map((node) => [node.path, node.help] as const)
  ];
});

/** Every screen whose text names `variable`. */
function screensNaming(variable: string): string[] {
  return screens.filter(([, help]) => help.includes(variable)).map(([path]) => path);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS FIRST. Every assertion below is a claim about a rendered corpus and a
// derived set, so both have to be shown to have produced something. A rendering
// that produced nothing would satisfy every "is not documented" assertion in the
// file at once.
// ─────────────────────────────────────────────────────────────────────────────
describe("controls", () => {
  it("renders one screen per command node, plus the root", () => {
    expect(nodeCount).toBeGreaterThan(500);
    expect(screens.length).toBe(nodeCount + 1);
  });

  it("renders screens with text in them — an empty corpus passes every absence claim", () => {
    const empty = screens.filter(([, help]) => help.trim().length === 0).map(([path]) => path);
    expect(empty).toEqual([]);
  });

  it("POSITIVE: a string known to be on the root screen is found", () => {
    // Without this the search could be broken and every variable would read as
    // undocumented, which is the exact shape of the defect this gate exists for.
    expect(screensNaming("--api-key")).toContain(ROOT_SCREEN);
  });

  it("NEGATIVE: a variable that appears nowhere is found nowhere", () => {
    expect(screensNaming("NEXUS_THIS_VARIABLE_DOES_NOT_EXIST")).toEqual([]);
  });

  it("reads source from more than one root, and finds variables in it", () => {
    // The SDK is bundled into dist/, so a variable it reads is one this binary
    // reads. A scan over the CLI alone would miss NEXUS_BASE_URL's read site.
    expect(SOURCE_ROOTS.length).toBeGreaterThan(1);
    expect(readEnvVarNames()).toContain("NEXUS_API_KEY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE POPULATION. Declared, never counted.
// ─────────────────────────────────────────────────────────────────────────────
describe("every NEXUS_* variable the binary reads is declared", () => {
  it("the declaration and the read-set are the SAME set", () => {
    const read = readEnvVarNames();
    const declared = Object.keys(ENV_VAR_DOCUMENTATION).sort();

    expect(
      read.filter((name) => !declared.includes(name)),
      "This variable is read by the shipped code and is not declared in " +
        "ENV_VAR_DOCUMENTATION. Add it there with the help screen that names it, " +
        "or null if none does — and if you add a null, say so in COMPATIBILITY.md " +
        "under INTERNAL, because an undocumented variable is a promise nobody made."
    ).toEqual([]);

    expect(
      declared.filter((name) => !read.includes(name)),
      "This variable is declared in ENV_VAR_DOCUMENTATION and nothing reads it. " +
        "Delete its line here and its row in COMPATIBILITY.md — a documented " +
        "variable the binary ignores is worse than an undocumented one."
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PARTITION. Both arms, because only asserting one of them is how the
// contract went wrong: it listed the undocumented set and never checked it.
// ─────────────────────────────────────────────────────────────────────────────
const DOCUMENTED = eachOrRefuse(
  Object.entries(ENV_VAR_DOCUMENTATION).filter(
    (entry): entry is [string, string] => entry[1] !== null
  ),
  "ENV_VAR_DOCUMENTATION entries declaring a help screen"
);

const UNDOCUMENTED = eachOrRefuse(
  Object.entries(ENV_VAR_DOCUMENTATION)
    .filter((entry) => entry[1] === null)
    .map(([name]) => name),
  "ENV_VAR_DOCUMENTATION entries declaring NO help screen"
);

describe("a variable declared as documented is named on the screen it names", () => {
  it.each(DOCUMENTED)("%s is on `%s`", (variable, screen) => {
    const found = screensNaming(variable);
    expect(
      found,
      `${variable} is declared as documented on '${screen}' and that screen does ` +
        `not name it. It is named on: ${found.length === 0 ? "NO screen at all" : found.join(", ")}. ` +
        `Either the help text lost the variable, or the declaration points at the wrong screen. ` +
        `COMPATIBILITY.md's environment-variable table says the same thing and needs the same fix.`
    ).toContain(screen);
  });
});

describe("a variable declared as undocumented is named on NO screen", () => {
  it.each(UNDOCUMENTED)("%s is on no help screen", (variable) => {
    const found = screensNaming(variable);
    expect(
      found,
      `${variable} is declared as UNDOCUMENTED and is now named on: ${found.join(", ")}. ` +
        `If that is deliberate, move its line in ENV_VAR_DOCUMENTATION from null to that ` +
        `screen and add it to COMPATIBILITY.md's table — the contract calls an undocumented ` +
        `variable internal and promises nothing about it, so documenting one is a promise ` +
        `being made and has to be written down.`
    ).toEqual([]);
  });
});
