import fs from "node:fs";
import path from "node:path";

import { isIgnored } from "./skill-bundle.ignored-segments";
import type { ZipEntry } from "./zip";

/**
 * Collect a skill directory's files, rooted so `SKILL.md` sits at the top.
 *
 * Accepts either shape a user is likely to point at: the skill folder itself
 * (`./my-skill` containing `SKILL.md`), or a wrapper holding exactly one skill
 * folder (`./bundles` containing `my-skill/SKILL.md`). Anything else is an error
 * naming what was found, because the alternative is uploading a bundle the
 * server rejects for a reason phrased in terms of the ZIP rather than the
 * directory the user actually chose.
 *
 * Symlinks are skipped, not followed: a link can point outside the directory
 * being packaged, and a bundle assembled here is uploaded and later extracted
 * elsewhere.
 */
export function readSkillDirectory(dir: string): ZipEntry[] {
  const absolute = path.resolve(dir);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`Not a directory: ${absolute}`);
  }

  let root = absolute;
  if (!fs.existsSync(path.join(root, "SKILL.md"))) {
    const children = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => !isIgnored(entry.name))
      .filter((entry) => entry.isDirectory());
    const candidates = children.filter((entry) =>
      fs.existsSync(path.join(root, entry.name, "SKILL.md"))
    );
    if (candidates.length !== 1) {
      throw new Error(
        `${absolute} has no SKILL.md, and ${
          candidates.length === 0
            ? "none of its sub-directories has one either"
            : `${candidates.length} of its sub-directories do (${candidates
                .map((entry) => entry.name)
                .join(", ")})`
        }. Point --dir at the skill folder itself.`
      );
    }
    root = path.join(root, candidates[0].name);
  }

  const files: ZipEntry[] = [];
  const walk = (current: string, relative: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (isIgnored(entry.name)) continue;
      const childPath = path.join(current, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      // `withFileTypes` reports link types without following them, so this is
      // already an lstat-equivalent check.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(childPath, childRelative);
      } else if (entry.isFile()) {
        files.push({ path: childRelative, content: fs.readFileSync(childPath) });
      }
    }
  };
  walk(root, "");

  if (files.length === 0) {
    throw new Error(`${root} contains no files.`);
  }
  // The same closing check `extractPresetFromTarball` makes, and for the same
  // reason: the root above was chosen on `existsSync`, which answers TRUE for a
  // symlink named `SKILL.md` and for a DIRECTORY named `SKILL.md`, while the
  // walk collects neither — it skips symlinks by design and descends into
  // directories. Without this the bundle packs and uploads, and the server
  // rejects it with a sentence about the archive that never names the file.
  if (!files.some((file) => file.path === "SKILL.md")) {
    throw new Error(
      `${root} has no SKILL.md at its root — it is not a valid skill folder. ` +
        `A symlink or a directory named SKILL.md does not count: symlinks are ` +
        `skipped when packaging, so the bundle would upload without one.`
    );
  }
  return files;
}
