import { describe, expect, it } from "vitest";

import { stripTsComments } from "./strip-ts-comments";

/**
 * Each fixture below is a shape a walk that tracks quotes and nothing else reads
 * inside out. That walk deletes the line marked `kept`, so a spec built on it
 * reports an absence over code that is there. Every arm asserts the code that
 * must SURVIVE, and the comment that must not, so an arm passes only on a
 * stripper that tells the two apart.
 */
describe("stripTsComments keeps code a quote-only walk deletes", () => {
  it("keeps the code after a pattern literal holding a block-comment opener", () => {
    const source = ["const opener = /\\/*\\//;", "const kept = 1;", "/* a real comment */"].join(
      "\n"
    );

    const stripped = stripTsComments(source);

    expect(stripped).toContain("const kept = 1;");
    expect(stripped).toContain("const opener = /\\/*\\//;");
    expect(stripped).not.toContain("a real comment");
  });

  it("keeps the code after a template nested inside a substitution", () => {
    const source = ["const nested = `${`//x`}`; const kept = 2;", "// a real comment"].join("\n");

    const stripped = stripTsComments(source);

    expect(stripped).toContain("const kept = 2;");
    expect(stripped).toContain("`${`//x`}`");
    expect(stripped).not.toContain("a real comment");
  });

  it("keeps a URL that follows a pattern literal holding a quote", () => {
    const source = [
      'const quote = /"/;',
      'const url = "https://example.com/a";',
      "const kept = 3; // a real comment"
    ].join("\n");

    const stripped = stripTsComments(source);

    expect(stripped).toContain('const url = "https://example.com/a";');
    expect(stripped).toContain("const kept = 3;");
    expect(stripped).not.toContain("a real comment");
  });
});

describe("stripTsComments removes comments and nothing else", () => {
  it("removes line and block comments, and keeps a `//` inside a string", () => {
    const source = [
      "/** docblock naming process.exit(1) */",
      'const url = "https://example.com"; // trailing',
      "const n = 1; /* inline */ const m = 2;"
    ].join("\n");

    expect(stripTsComments(source)).toBe(
      ["", 'const url = "https://example.com"; ', "const n = 1;  const m = 2;"].join("\n")
    );
  });

  it("keeps the newlines inside a block comment, so a line counted on the output is the line in the file", () => {
    const source = ["/*", " * three", " */", "const fourth = 4;"].join("\n");

    const stripped = stripTsComments(source);

    expect(stripped.split("\n")).toHaveLength(4);
    expect(stripped.split("\n")[3]).toBe("const fourth = 4;");
  });
});
