import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findRefusalsNamingOnePath,
  REFUSALS_ALLOWED_TO_NAME_ONE_PATH
} from "./required-field-refusals-name-both-paths";

const COMMANDS_DIR = join(__dirname, "../commands");

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

  it("passes the same refusal once it names --body", () => {
    const found = findRefusalsNamingOnePath(
      fixture(
        BODY_TAKING('"--mode is required. Pass it as a flag, or as \\"mode\\" inside --body."')
      )
    );
    expect(found).toEqual([]);
  });

  it("ignores a command that takes no JSON body", () => {
    // `--operation-id is required` on a command with no --body is correct as it
    // stands: there is no second path to name. Flagging it is the false positive
    // that would get this gate switched off.
    const found = findRefusalsNamingOnePath(
      fixture(`
  program
    .command("go")
    .option("--operation-id <id>", "op")
    .action(async (opts) => {
      if (!opts.operationId) {
        throw new Error("--operation-id is required");
      }
    });
`)
    );
    expect(found).toEqual([]);
  });

  it("ignores a VALUE complaint, which read the field and disliked it", () => {
    const found = findRefusalsNamingOnePath(
      fixture(BODY_TAKING('`Invalid --mode "${raw}". Expected sitemap or crawl.`'))
    );
    expect(found).toEqual([]);
  });

  it("ignores a prose --body that is not a JSON body", () => {
    const found = findRefusalsNamingOnePath(
      fixture(`
  program
    .command("comment")
    .requiredOption("--body <text-or-->", "Comment text")
    .action(async (opts) => {
      if (!opts.body) {
        throw new Error("--body is required");
      }
    });
`)
    );
    expect(found).toEqual([]);
  });
});

describe("every refusal in this package names both paths", () => {
  it("finds nothing outside the allowlist", () => {
    const found = findRefusalsNamingOnePath(COMMANDS_DIR).filter((r) => !allowed(r));

    expect(
      found.map((r) => `${r.file}:${r.line}  ${r.message}`),
      "A body-taking command refuses a field while naming only its flag. The " +
        "operator can supply it through --body and this message says otherwise. " +
        "Name both paths, or add an entry to REFUSALS_ALLOWED_TO_NAME_ONE_PATH " +
        "with the reason the field cannot come from a body."
    ).toEqual([]);
  });

  it("keeps no allowlist entry that no longer matches anything", () => {
    const all = findRefusalsNamingOnePath(COMMANDS_DIR);
    const dead = REFUSALS_ALLOWED_TO_NAME_ONE_PATH.filter(
      (a) => !all.some((r) => r.file === a.file && r.message.includes(a.fragment))
    );
    // An allowlist that outlives what it excused silently re-opens the gate.
    expect(dead.map((d) => `${d.file}  ${d.fragment}`)).toEqual([]);
  });
});
