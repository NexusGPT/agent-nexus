import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createZip, normalizeZipPath } from "./zip";

/**
 * The archives this writer produces are only ever read by ONE reader: JSZip, on
 * the backend, inside `CodeInterpreterSkillsService`. So the tests read them
 * back with JSZip rather than re-parsing the bytes with a mirror of the writer
 * — a hand-rolled parser would agree with a hand-rolled writer about a header
 * both got wrong, which is exactly the failure this file exists to catch.
 *
 * `jszip` is a devDependency here for that reason. The CLI ships with one
 * runtime dependency and this does not become a second.
 */
describe("createZip", () => {
  it("produces an archive JSZip can read back byte-for-byte", async () => {
    const entries = [
      { path: "SKILL.md", content: Buffer.from("# demo\n\nA skill.\n", "utf8") },
      { path: "scripts/run.py", content: Buffer.from("print('hi')\n", "utf8") }
    ];

    const zip = await JSZip.loadAsync(createZip(entries));

    expect(Object.keys(zip.files).sort()).toEqual(["SKILL.md", "scripts/run.py"]);
    for (const entry of entries) {
      const roundTripped = await zip.files[entry.path].async("nodebuffer");
      expect(roundTripped.equals(entry.content)).toBe(true);
    }
  });

  it("round-trips binary content and non-ASCII paths", async () => {
    // A 4 KB pseudo-random payload: incompressible enough that deflating it
    // grows the payload, which is the branch that stores the entry instead.
    const binary = Buffer.alloc(4096);
    for (let i = 0; i < binary.length; i++) binary[i] = (i * 37 + (i % 251)) % 256;

    const zip = await JSZip.loadAsync(
      createZip([
        { path: "assets/blob.bin", content: binary },
        { path: "références/naïve.md", content: Buffer.from("é ü ß 中文\n", "utf8") }
      ])
    );

    expect((await zip.files["assets/blob.bin"].async("nodebuffer")).equals(binary)).toBe(true);
    expect(await zip.files["références/naïve.md"].async("string")).toBe("é ü ß 中文\n");
  });

  it("compresses a repetitive file rather than storing it", async () => {
    const repetitive = Buffer.from("nexus ".repeat(5000), "utf8");
    const zip = createZip([{ path: "SKILL.md", content: repetitive }]);

    expect(zip.length).toBeLessThan(repetitive.length / 4);
    const reloaded = await JSZip.loadAsync(zip);
    expect((await reloaded.files["SKILL.md"].async("nodebuffer")).equals(repetitive)).toBe(true);
  });

  it("is byte-reproducible across runs", () => {
    const entries = [{ path: "SKILL.md", content: Buffer.from("stable", "utf8") }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });

  it("writes a readable empty archive", async () => {
    const zip = await JSZip.loadAsync(createZip([]));
    expect(Object.keys(zip.files)).toEqual([]);
  });
});

describe("normalizeZipPath", () => {
  it("normalizes separators and strips leading slashes", () => {
    expect(normalizeZipPath("scripts\\run.py")).toBe("scripts/run.py");
    expect(normalizeZipPath("/SKILL.md")).toBe("SKILL.md");
    expect(normalizeZipPath("a//b///c.txt")).toBe("a/b/c.txt");
  });

  it("rejects traversal, empty, and null-byte paths", () => {
    expect(() => normalizeZipPath("../escape.md")).toThrow(/relative segment/);
    expect(() => normalizeZipPath("a/../../b")).toThrow(/relative segment/);
    expect(() => normalizeZipPath("./SKILL.md")).toThrow(/relative segment/);
    expect(() => normalizeZipPath("/")).toThrow(/Invalid archive path/);
    expect(() => normalizeZipPath("a/\0b")).toThrow(/null byte/);
  });

  it("keeps a traversal path out of the archive entirely", () => {
    expect(() => createZip([{ path: "../../etc/passwd", content: Buffer.from("x") }])).toThrow(
      /relative segment/
    );
  });
});
