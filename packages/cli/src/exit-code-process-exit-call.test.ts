import { describe, expect, it } from "vitest";

import { callsProcessExitWith } from "./exit-code-process-exit-call.testkit";

/**
 * `callsProcessExitWith` READS A CALL, NEVER A SENTENCE ABOUT ONE.
 *
 * It decides whether `success` and `interrupted` — the two categories no
 * function returns — have a producer at all, so a false hit is a category
 * reported reachable that nothing reaches. Each arm below is one way prose or
 * data can spell the call, beside the code spelling that must still count, so
 * an arm cannot pass on a helper that simply answers `false` to everything.
 */
describe("callsProcessExitWith reads a call, never a sentence about one", () => {
  const docblock = [
    "/**",
    " * The `process.exit(EXIT_CODES.interrupted)` below is the ONLY producer of 130.",
    " */"
  ].join("\n");

  it("a docblock quote is not a producer", () => {
    const source = [docblock, "export function follow(): void {", "  stop();", "}"].join("\n");
    expect(callsProcessExitWith(source, "interrupted")).toBe(false);
  });

  it("the same docblock above the real call is one", () => {
    const source = [
      docblock,
      "export function follow(): void {",
      "  if (interrupts > 1) process.exit(EXIT_CODES.interrupted);",
      "}"
    ].join("\n");
    expect(callsProcessExitWith(source, "interrupted")).toBe(true);
  });

  it("a line comment naming the call is not a producer", () => {
    expect(callsProcessExitWith("// process.exit(EXIT_CODES.success)\nrun();", "success")).toBe(
      false
    );
  });

  it("a call inside a string or a template's text is not this process's exit", () => {
    const source = [
      'const child = "process.exit(EXIT_CODES.success)";',
      "const script = `process.exit(EXIT_CODES.success)`;"
    ].join("\n");
    expect(callsProcessExitWith(source, "success")).toBe(false);
  });

  it("a call inside a template's ${…} is code, and counts", () => {
    expect(
      callsProcessExitWith("const s = `${process.exit(EXIT_CODES.success)}`;", "success")
    ).toBe(true);
  });

  it('a bracket-keyed call keeps its key — EXIT_CODES["not-found"] counts', () => {
    // The literal blank alone would read the key as spaces and lose this.
    expect(callsProcessExitWith('process.exit(EXIT_CODES["not-found"]);', "not-found")).toBe(true);
    expect(callsProcessExitWith('// process.exit(EXIT_CODES["not-found"])', "not-found")).toBe(
      false
    );
  });

  it("another category's call is not this category's producer", () => {
    expect(callsProcessExitWith("process.exit(EXIT_CODES.success);", "interrupted")).toBe(false);
  });
});
