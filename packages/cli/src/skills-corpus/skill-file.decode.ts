import type { SkillFile } from "../skills-content.generated";

/**
 * The bytes an install writes for one corpus file, decided by its `encoding`
 * marker and nothing else.
 *
 * No marker means UTF-8 text, which is every file a corpus held before binary
 * files could ship. `"base64"` means the content IS the file, base64-encoded.
 * Any other value is REFUSED, naming the file: the corpus was written by a newer
 * generator than this CLI, and writing its content as text would put a corrupted
 * file on disk with nothing to notice. The install plan is built before anything
 * is written, so the refusal leaves the target untouched.
 *
 * A base64 payload must re-encode to itself. `Buffer.from(s, "base64")` skips
 * characters it does not recognise rather than failing, so a damaged payload
 * would otherwise decode to plausible, wrong bytes.
 */
export function skillFileBytes(file: SkillFile): Buffer {
  // Read as `unknown`: the field comes from a JSON asset at runtime, and the
  // type's one member is exactly what this guard exists not to assume.
  const encoding: unknown = file.encoding;
  if (encoding === undefined) return Buffer.from(file.content, "utf-8");
  if (encoding === "base64") {
    const bytes = Buffer.from(file.content, "base64");
    if (bytes.toString("base64") !== file.content) {
      throw new Error(
        `Refusing to install "${file.path}": its base64 content does not decode cleanly, ` +
          `so the bytes it would write are not the file the bundle was cut from.`
      );
    }
    return bytes;
  }
  throw new Error(
    `Refusing to install "${file.path}": it is stored with encoding ${JSON.stringify(encoding)}, ` +
      `which this CLI does not read. Upgrade @agent-nexus/cli and run the install again.`
  );
}
