import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RESOLVE_HOOK, TYPE_STRIPPED_SCRIPTS } from "./type-stripped-script";

/**
 * THE TWO HALVES OF RUNNING A SCRIPT WITHOUT `tsx`, EACH WATCHED REFUSE.
 *
 * `type-stripped-script.ts` holds the reasoning. The specs that spawn a script
 * through it prove the happy path end to end; what they cannot prove is that the
 * erasable-syntax typecheck covers every script they launch, or that the resolve
 * hook refuses what it should rather than reaching for a file it should not.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("tsconfig.strip.json", () => {
  const { config, error } = ts.readConfigFile(join(PACKAGE_ROOT, "tsconfig.strip.json"), (path) =>
    ts.sys.readFile(path)
  );
  if (error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const strip = config as {
    compilerOptions?: { erasableSyntaxOnly?: unknown };
    include?: unknown;
    files?: unknown;
  };

  it("typechecks exactly the scripts the specs strip-run, and the hook they load", () => {
    // A script launched through the helper and missing here is typechecked by no
    // erasable-only program, so a parameter property in its graph reaches a spec
    // as a runtime refusal instead of a typecheck error.
    expect([...(strip.files as string[])].sort()).toEqual(
      [...TYPE_STRIPPED_SCRIPTS, RESOLVE_HOOK].sort()
    );
  });

  it("allows erasable syntax only", () => {
    expect(strip.compilerOptions?.erasableSyntaxOnly).toBe(true);
  });

  it("inherits no include, so its errors answer for those files alone", () => {
    expect(strip.include).toEqual([]);
  });
});

describe("the resolve hook", () => {
  let dir: string;

  /** Run `main.ts` under stripping, with or without the hook. */
  const run = (withHook: boolean): { code: number | null; stdout: string; stderr: string } => {
    const hook = ["--import", pathToFileURL(join(PACKAGE_ROOT, RESOLVE_HOOK)).href];
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        ...(withHook ? hook : []),
        join(dir, "main.ts")
      ],
      { encoding: "utf8" }
    );
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  const writeMain = (body: string): void => writeFileSync(join(dir, "main.ts"), body);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "type-stripped-script-"));
    writeFileSync(join(dir, "dep.ts"), 'export const dep: string = "dep";\n');
    // The shape `./commands/apps` has in this package: a directory and a file
    // of the same name. The bundler takes the file, and so must the hook.
    mkdirSync(join(dir, "shadowed"));
    writeFileSync(join(dir, "shadowed", "inner.ts"), 'export const inner = "inner";\n');
    writeFileSync(join(dir, "shadowed.ts"), 'export const shadowed: string = "file";\n');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves an extensionless import and a file shadowing a directory", () => {
    writeMain(
      'import { dep } from "./dep";\nimport { shadowed } from "./shadowed";\nconsole.log(dep, shadowed);\n'
    );
    const result = run(true);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("dep file\n");
  });

  it("is what makes that import resolve — without it Node refuses", () => {
    // The control: were Node to resolve extensionless imports itself, the case
    // above would be green with the hook deleted.
    writeMain('import { dep } from "./dep";\nconsole.log(dep);\n');
    const result = run(false);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("ERR_MODULE_NOT_FOUND");
  });

  it("rethrows the ORIGINAL refusal when no .ts file exists either", () => {
    writeMain('import { gone } from "./gone";\nconsole.log(gone);\n');
    const result = run(true);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("ERR_MODULE_NOT_FOUND");
    expect(result.stderr).not.toContain("gone.ts");
  });
});
