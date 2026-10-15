import fs from "node:fs";
import path from "node:path";

import type { CorpusFiles } from "../../src/skills-corpus/build-corpus";

/**
 * Every file under `root`, as a path relative to it with forward slashes.
 *
 * Nothing is filtered here and nothing is read. Which files ship is decided in
 * ONE place, `buildCorpusFromFiles` (src/skills-corpus/build-corpus.ts), which
 * the CLI also runs over a corpus it downloads — so the bundle and a download of
 * the same commit cannot disagree about what a skill contains.
 *
 * That selection has no extension allowlist, and the reason is recorded here
 * because this is where it was learned: collection used to filter on
 * `/\.(md|ts)$/`, which silently dropped every JSON schema, example spec and
 * .mjs/.sh/.py script the skill docs tell an agent to run. Only editor and OS
 * cruft is skipped (dotfiles, __pycache__, compiled .pyc).
 */
function listFiles(root: string, prefix = ""): string[] {
  const paths: string[] = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) paths.push(...listFiles(path.join(root, item.name), relPath));
    else paths.push(relPath);
  }
  return paths;
}

/**
 * An extracted skills repository as the corpus builder reads it: every path, and
 * each file's raw bytes. No encoding is decided here — `encodeSkillFile` decides
 * text or base64 for every shipped file, so a binary asset (a vendored `.tgz`, an
 * image) ships byte-exact instead of failing the build.
 */
export function corpusDirectory(root: string): CorpusFiles {
  return {
    paths: listFiles(root),
    read: (relPath) => fs.readFileSync(path.join(root, relPath))
  };
}
