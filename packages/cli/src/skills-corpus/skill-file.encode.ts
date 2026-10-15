import type { SkillFile } from "../skills-content.generated";

/**
 * True when `bytes` survive a UTF-8 decode and re-encode unchanged and hold no NUL.
 *
 * The round trip is the actual requirement: a text entry is written back with
 * `Buffer.from(content, "utf-8")`, so anything that does not round-trip would
 * reach disk with replacement characters. The NUL test is git's own binary
 * heuristic, and it matters because a text entry is TRIMMED — a binary file that
 * happened to be valid UTF-8 and ended in a whitespace byte would lose it.
 */
function isText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  return Buffer.from(bytes.toString("utf-8"), "utf-8").equals(bytes);
}

/**
 * One shipped file, in the form the corpus stores it.
 *
 * Text is stored exactly as it always was — the decoded string, trimmed, with NO
 * `encoding` field — so every bundle cut before binary files existed, and every
 * text file in one cut after, is byte-identical in the asset.
 *
 * Anything else is stored as base64 with `encoding: "base64"` and NOT trimmed:
 * those bytes are the file. The marker is explicit so the read side never has to
 * guess — `skill-file.decode.ts` decodes by the marker and refuses one it does
 * not know.
 */
export function encodeSkillFile(path: string, bytes: Buffer): SkillFile {
  if (isText(bytes)) return { path, content: bytes.toString("utf-8").trim() };
  return { path, content: bytes.toString("base64"), encoding: "base64" };
}
