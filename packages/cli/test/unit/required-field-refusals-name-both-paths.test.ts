import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findRefusalsNamingOnePath,
  listCommandSources,
  REFUSALS_ALLOWED_TO_NAME_ONE_PATH
} from "./required-field-refusals-name-both-paths";

const COMMANDS_DIR = join(__dirname, "../../src/commands");

const allowed = (r: { file: string; message: string }): boolean =>
  REFUSALS_ALLOWED_TO_NAME_ONE_PATH.some(
    (a) => a.file === r.file && r.message.includes(a.fragment)
  );

/** A fixture directory holding one synthetic command file. */
function fixture(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "nexus-refusals-"));
  writeFileSync(join(dir, "probe.ts"), source);
  return dir;
}

const BODY_TAKING = (refusal: string): string => `
  program
    .command("go")
    .option("--mode <m>", "mode")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action(async (opts) => {
      const mode = readStringField(opts.mode, base, "mode");
      if (mode === undefined) {
        throw new Error(${refusal});
      }
    });
`;

describe("the detector detects", () => {
  it("flags a presence refusal that names only the flag", () => {
    const found = findRefusalsNamingOnePath(fixture(BODY_TAKING('"--mode is required."')));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("--mode is required.");
  });

  it("reads a command in a subdirectory, and names it by its path", () => {
    // A command moved into `commands/<domain>/` must stay in the population. A
    // top-level-only listing dropped it and reported the tree clean.
    const dir = mkdtempSync(join(tmpdir(), "nexus-refusals-"));
    mkdirSync(join(dir, "role", "leaf"), { recursive: true });
    writeFileSync(
      join(dir, "role", "leaf", "probe.command.ts"),
      BODY_TAKING('"--mode is required."')
    );

    expect(findRefusalsNamingOnePath(dir).map((r) => r.file)).toEqual([
      "role/leaf/probe.command.ts"
    ]);
  });

  // The arms that expect NOTHING read their fixture through `files` and floor it
  // first: a walk that reached no file reports no refusal, so "ignores X" would
  // pass over an empty directory exactly as over the probe.
  it("passes the same refusal once it names --body", () => {
    const dir = fixture(
      BODY_TAKING('"--mode is required. Pass it as a flag, or as \\"mode\\" inside --body."')
    );
    const files = listCommandSources(dir);
    expect(files).toEqual(["probe.ts"]);
    const found = findRefusalsNamingOnePath(dir, files);
    expect(found).toEqual([]);
  });

  it("ignores a command that takes no JSON body", () => {
    // `--operation-id is required` on a command with no --body is correct as it
    // stands: there is no second path to name. Flagging it is the false positive
    // that would get this gate switched off.
    const dir = fixture(`
  program
    .command("go")
    .option("--operation-id <id>", "op")
    .action(async (opts) => {
      if (!opts.operationId) {
        throw new Error("--operation-id is required");
      }
    });
`);
    const files = listCommandSources(dir);
    expect(files).toEqual(["probe.ts"]);
    const found = findRefusalsNamingOnePath(dir, files);
    expect(found).toEqual([]);
  });

  it("ignores a VALUE complaint, which read the field and disliked it", () => {
    const dir = fixture(BODY_TAKING('`Invalid --mode "${raw}". Expected sitemap or crawl.`'));
    const files = listCommandSources(dir);
    expect(files).toEqual(["probe.ts"]);
    const found = findRefusalsNamingOnePath(dir, files);
    expect(found).toEqual([]);
  });

  it("ignores a prose --body that is not a JSON body", () => {
    const dir = fixture(`
  program
    .command("comment")
    .requiredOption("--body <text-or-->", "Comment text")
    .action(async (opts) => {
      if (!opts.body) {
        throw new Error("--body is required");
      }
    });
`);
    const files = listCommandSources(dir);
    expect(files).toEqual(["probe.ts"]);
    const found = findRefusalsNamingOnePath(dir, files);
    expect(found).toEqual([]);
  });
});

/** 1-based line of the first occurrence of `needle` in `source`, or 0 when absent. */
const lineOfNeedle = (source: string, needle: string): number => {
  const at = source.indexOf(needle);
  return at === -1 ? 0 : source.slice(0, at).split("\n").length;
};

/**
 * The gate reads code, never prose. Each arm below is a shape that blinded the
 * raw-text scan, and each expects the ONE finding at the refusal's real line, so
 * an empty answer is a red here rather than a pass.
 */
describe("the detector reads code, not prose", () => {
  const REFUSAL = '"--mode is required."';

  it("is not blinded by a header comment quoting `.action(` and an unpaired quote", () => {
    // A docblock about this gate opened a slice at the prose `.action(` that
    // never closed, and its unpaired quote inverted literal pairing after it.
    const source = `/**
 * The gate brace-matches each \`.action(\`, walks back to \`.command(\` and
 * requires \`.option("--body <json\` in that chain.
 */
${BODY_TAKING(REFUSAL)}`;
    expect(findRefusalsNamingOnePath(fixture(source)).map((r) => `${r.file}:${r.line}`)).toEqual([
      `probe.ts:${lineOfNeedle(source, REFUSAL)}`
    ]);
  });

  it("is not blinded by a comment inside the action holding an unpaired quote", () => {
    const source = BODY_TAKING(REFUSAL).replace(
      "const mode =",
      '// a body can carry "mode, so read the merged object\n      const mode ='
    );
    expect(findRefusalsNamingOnePath(fixture(source)).map((r) => `${r.file}:${r.line}`)).toEqual([
      `probe.ts:${lineOfNeedle(source, REFUSAL)}`
    ]);
  });

  it("does not read a refusal quoted in a comment as a refusal", () => {
    const named = '"--mode is required, as a flag or in --body."';
    const source = BODY_TAKING(named).replace(
      "if (mode === undefined)",
      '// was: throw new Error("--mode is required.");\n      if (mode === undefined)'
    );
    const dir = fixture(source);
    const files = listCommandSources(dir);
    expect(files).toEqual(["probe.ts"]);
    expect(findRefusalsNamingOnePath(dir, files)).toEqual([]);
  });

  it("does not end the action at a `)` inside a string", () => {
    const source = BODY_TAKING(REFUSAL).replace(
      "const mode =",
      'const close = ")";\n      const mode ='
    );
    expect(findRefusalsNamingOnePath(fixture(source)).map((r) => `${r.file}:${r.line}`)).toEqual([
      `probe.ts:${lineOfNeedle(source, REFUSAL)}`
    ]);
  });

  it("does not start the chain at a `.command(` inside a string", () => {
    const source = BODY_TAKING(REFUSAL).replace(
      "    .action(",
      '    .description("Each .command( here takes a body.")\n    .action('
    );
    expect(findRefusalsNamingOnePath(fixture(source)).map((r) => `${r.file}:${r.line}`)).toEqual([
      `probe.ts:${lineOfNeedle(source, REFUSAL)}`
    ]);
  });
});

describe("every refusal in this package names both paths", () => {
  /**
   * The population both arms below sweep, floored before either reads it — an
   * empty answer over a walk that found nothing reads exactly like a clean
   * tree.
   */
  const COMMAND_SOURCES = listCommandSources(COMMANDS_DIR);

  it("reads the whole commands tree (control)", () => {
    expect(COMMAND_SOURCES.length, "the commands walk found almost nothing").toBeGreaterThan(800);
    expect(COMMAND_SOURCES).toContain("upgrade.ts");
  });

  it("reads credential/connect.command.ts, whose header discusses this gate (control)", () => {
    // That header quotes `.action(` and an unpaired `"--body <json`, which once
    // hid both of the file's presence refusals from the scan. Strip `--body` from
    // them and the gate must name each one; the phrase is the anchor, so a reworded
    // refusal reds here by name rather than silently leaving the file unread. Only
    // PRESENCE refusals are stripped: the file's value refusal carries the phrase too.
    const PHRASE = ", as a flag or in --body";
    const file = "credential/connect.command.ts";
    const lines = readFileSync(join(COMMANDS_DIR, file), "utf-8").split("\n");
    const isPresenceRefusal = (text: string): boolean =>
      text.includes(PHRASE) && text.includes("is required");
    const expected = lines.flatMap((text, i) =>
      isPresenceRefusal(text) ? [`${file}:${i + 1}`] : []
    );
    expect(expected.length, `${file} no longer has two presence refusals naming --body`).toBe(2);

    const dir = mkdtempSync(join(tmpdir(), "nexus-refusals-"));
    mkdirSync(join(dir, "credential"));
    const stripped = lines.map((text) =>
      isPresenceRefusal(text) ? text.replace(PHRASE, "") : text
    );
    writeFileSync(join(dir, file), stripped.join("\n"));
    expect(findRefusalsNamingOnePath(dir).map((r) => `${r.file}:${r.line}`)).toEqual(expected);
  });

  it("finds nothing outside the allowlist", () => {
    const found = findRefusalsNamingOnePath(COMMANDS_DIR, COMMAND_SOURCES).filter(
      (r) => !allowed(r)
    );

    expect(
      found.map((r) => `${r.file}:${r.line}  ${r.message}`),
      "A body-taking command refuses a field while naming only its flag. The " +
        "operator can supply it through --body and this message says otherwise. " +
        "Name both paths, or add an entry to REFUSALS_ALLOWED_TO_NAME_ONE_PATH " +
        "with the reason the field cannot come from a body."
    ).toEqual([]);
  });

  it("keeps no allowlist entry that no longer matches anything", () => {
    const all = findRefusalsNamingOnePath(COMMANDS_DIR, COMMAND_SOURCES);
    const dead = REFUSALS_ALLOWED_TO_NAME_ONE_PATH.filter(
      (a) => !all.some((r) => r.file === a.file && r.message.includes(a.fragment))
    );
    // An allowlist that outlives what it excused silently re-opens the gate.
    expect(dead.map((d) => `${d.file}  ${d.fragment}`)).toEqual([]);
  });
});
