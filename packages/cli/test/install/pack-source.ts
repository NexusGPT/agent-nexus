import { cpSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PACKAGE_ROOT, tempDir } from "./install-harness";

/**
 * The directory handed to `npm pack`: PACKAGE_ROOT with `node_modules` omitted.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS NOT A FOURTH SUBSTITUTION. EVERY FILE IS HARD-LINKED, SO npm READS
 *    THE SAME INODES IT WOULD READ IN THE REAL TREE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `npm pack` DESCENDS `node_modules` and then discards everything it finds
 * there. In a pnpm workspace that directory is a farm of symlinks into the
 * content-addressed store, so npm walks the whole store to produce a tarball
 * that provably contains not one byte of it — and that walk is the single
 * largest cost in this suite.
 *
 * Measured on this package, npm 11.6.0 / node 24.9.0, `npm pack --json
 * --dry-run`, with the packed manifest identical in every field on both sides
 * (`entryCount` 5, `size` 3440460, `unpackedSize` 11525052, same paths, same
 * per-file sizes and modes) and a negative control confirming the comparison
 * can fail:
 *
 *     PACKAGE_ROOT                                    3846 / 3460 / 5072 ms
 *     the same tree with node_modules omitted           487 /  480 /  672 ms
 *     the same tree + ONE symlink to node_modules/.pnpm         11044 ms
 *     the same tree + a plain node_modules of one package         519 ms
 *
 * So the cost is the SYMLINK FARM — not the name `node_modules`, and not this
 * package's own 472 files, which pack in under half a second. Two cures that
 * look right and are not: `--ignore-scripts` changes nothing (3350 ms; no
 * lifecycle script is involved) and an `.npmignore` naming `node_modules`
 * changes nothing either (3557 ms; npm 11 walks first and filters after).
 *
 * ── WHAT KEEPS THIS HONEST ──────────────────────────────────────────────────
 *
 * `node_modules` is the one directory npm excludes from a tarball
 * unconditionally, and `bundleDependencies` is the single rule under which it
 * would not — so that is refused BY NAME rather than assumed absent.
 *
 * The mirror's completeness is ASSERTED, never trusted: the same relative-path
 * set with the same sizes, everywhere outside `node_modules`. A mirror that
 * silently lost a file would pack a smaller tarball and every case in the spec
 * would still pass, which is exactly the failure this assertion exists to catch.
 */
let cached: string | null = null;

export function packSource(): string {
  if (cached !== null) return cached;

  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  if (manifest.bundleDependencies !== undefined || manifest.bundledDependencies !== undefined) {
    throw new Error(
      "This package now declares bundleDependencies, which is the ONE rule under which " +
        "`npm pack` packs files out of node_modules. Pack PACKAGE_ROOT itself again — do " +
        "not relax this check, which is the only thing making the omission provably free."
    );
  }

  const mirror = tempDir("packroot");
  mirrorTree(PACKAGE_ROOT, mirror, true);
  assertMirrorIsComplete(PACKAGE_ROOT, mirror);
  cached = mirror;
  return mirror;
}

/** Forget the mirror, so a suite that cleaned its temp dirs cannot reuse a path. */
export function forgetPackSource(): void {
  cached = null;
}

function mirrorTree(from: string, into: string, isRoot: boolean): void {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (isRoot && entry.name === "node_modules") continue;
    const source = join(from, entry.name);
    const target = join(into, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      mirrorTree(source, target, false);
    } else if (entry.isFile()) {
      // A hard link is the point: npm reads the same inode, so the mirror cannot
      // hold different bytes from the real tree. Some machines put `os.tmpdir()`
      // on another volume, where a link is impossible — copy there instead, and
      // the completeness assertion below covers both paths identically.
      try {
        linkSync(source, target);
      } catch {
        cpSync(source, target);
      }
    }
    // Anything else — a symlink outside node_modules — is deliberately NOT
    // mirrored, so `assertMirrorIsComplete` fails naming it rather than packing
    // a tree that quietly differs. There are none in this package today.
  }
}

/** `<relative path>\t<size>` for every file, sorted. `node_modules` excluded at the root only. */
function entriesOf(root: string, skipNodeModules: boolean, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipNodeModules && entry.name === "node_modules") continue;
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...entriesOf(full, false, relative));
    else if (entry.isFile()) out.push(`${relative}\t${statSync(full).size}`);
    else out.push(`${relative}\tNOT-A-REGULAR-FILE`);
  }
  return out.sort();
}

function assertMirrorIsComplete(real: string, mirror: string): void {
  // The mirror is walked WITHOUT the node_modules skip on purpose: if one ever
  // appeared in there, this comparison must report it rather than hide it.
  const expected = entriesOf(real, true);
  const actual = entriesOf(mirror, false);
  if (expected.join("\n") === actual.join("\n")) return;

  const missing = expected.filter((line) => !actual.includes(line));
  const extra = actual.filter((line) => !expected.includes(line));
  throw new Error(
    `The pack source is not PACKAGE_ROOT minus node_modules, so the tarball below ` +
      `would not be the one a user receives.\n` +
      `  missing from the mirror (${missing.length}): ${missing.slice(0, 10).join(", ")}\n` +
      `  present only in the mirror (${extra.length}): ${extra.slice(0, 10).join(", ")}`
  );
}
