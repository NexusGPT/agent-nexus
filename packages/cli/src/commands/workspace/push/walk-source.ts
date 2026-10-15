import fs from "node:fs";
import path from "node:path";

import { addEntry } from "./add-entry";
import { isHiddenName } from "./hidden-name";
import type { PushPlan } from "./push-plan";

function joinRemote(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

/**
 * Walk one named source. A file lands at `<prefix>/<basename>`; a folder lands
 * at `<prefix>/<basename>/…` with its tree under it — the `cp -r` shape.
 * Hidden names are skipped only INSIDE a walked folder: a source the user
 * named is pushed whatever it is called, because naming it was the decision.
 */
export function collectSource(
  source: string,
  prefix: string,
  includeHidden: boolean,
  plan: PushPlan
): void {
  const absolute = path.resolve(source);
  const stat = fs.statSync(absolute);
  const remote = joinRemote(prefix, path.basename(absolute));
  if (stat.isFile()) {
    addEntry(plan, { localPath: absolute, remotePath: remote, size: stat.size });
    return;
  }
  if (!stat.isDirectory()) return;
  walkFolder(absolute, remote, includeHidden, plan, new Set([fs.realpathSync(absolute)]));
}

/**
 * `onWalk` holds the real path of every folder between the source and here:
 * a directory symlink that resolves to one of them is a loop, refused where
 * it is met rather than at the depth the OS gives up (ELOOP, 32 hops later).
 */
function walkFolder(
  dir: string,
  remoteDir: string,
  includeHidden: boolean,
  plan: PushPlan,
  onWalk: ReadonlySet<string>
): void {
  const children = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    if (!includeHidden && isHiddenName(child.name)) {
      plan.hiddenSkipped += 1;
      continue;
    }
    const localPath = path.join(dir, child.name);
    const remotePath = joinRemote(remoteDir, child.name);
    // A symlink is followed, like `cp -L`: the workspace holds bytes, not
    // links. `readdirSync`'s Dirent answers neither isFile nor isDirectory for
    // one, so without this branch a linked file vanished from the push uncounted.
    const kind = child.isSymbolicLink() ? statFollowing(localPath) : child;
    if (kind === "dangling") {
      plan.dangling.push(localPath);
    } else if (kind === "loop") {
      plan.loops.push(localPath);
    } else if (kind.isDirectory()) {
      const real = fs.realpathSync(localPath);
      if (onWalk.has(real)) {
        plan.loops.push(localPath);
        continue;
      }
      walkFolder(localPath, remotePath, includeHidden, plan, new Set([...onWalk, real]));
    } else if (kind.isFile()) {
      addEntry(plan, { localPath, remotePath, size: fs.statSync(localPath).size });
    }
  }
}

/**
 * The target's stat, or why the link cannot be followed: `dangling` when it
 * resolves nowhere (ENOENT), `loop` when it resolves forever (ELOOP — `a -> a`
 * and its cousins, which the walk's own loop set never reaches because the
 * stat fails first).
 */
function statFollowing(localPath: string): fs.Stats | "dangling" | "loop" {
  try {
    return fs.statSync(localPath);
  } catch (cause) {
    // The cast claims nothing: `code` stays `unknown` and is only compared.
    const code = (cause as { code?: unknown }).code;
    if (code === "ENOENT") return "dangling";
    if (code === "ELOOP") return "loop";
    throw cause;
  }
}
