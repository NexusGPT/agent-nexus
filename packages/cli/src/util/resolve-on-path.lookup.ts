import fs from "node:fs";
import path from "node:path";

/**
 * `which -a <name>` in Node — PATH resolution and nothing else.
 *
 * ── WHAT THIS MODELS, AND THE THREE THINGS IT CANNOT SEE ────────────────────
 *
 * A POSIX shell resolving a bare word searches `$PATH` left to right and takes
 * the first executable file. That is what {@link resolveOnPath} does, and it
 * agrees with `which -a` on every ordinary machine. It is NOT the whole of what
 * an interactive shell does, and the gap is deliberately named rather than
 * papered over:
 *
 *   - a shell FUNCTION or ALIAS named `nexus` wins over every path entry, and
 *     lives in the shell's own state — no child process can read it;
 *   - `hash`/`rehash` caching can keep a shell on a path that no longer exists
 *     until the table is cleared, so a freshly-correct PATH can still run the
 *     old binary in THAT terminal;
 *   - a login shell's PATH is not always the PATH this process inherited.
 *
 * All three make the reported list a lower bound on the confusion, never an
 * upper one. That is the safe direction: this module never reports agreement
 * that a shell would contradict, only disagreement a shell might also have.
 */

/**
 * The extensions a bare name may carry, in search order.
 *
 * POSIX has none. On Windows `PATHEXT` is the list, and a bare `nexus` resolves
 * to `nexus.cmd` — searching for `nexus` alone would find nothing there and
 * report "not on your PATH" on a machine where it plainly is.
 */
function executableExtensions(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return [""];
  const pathext = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return ["", ...pathext.split(";").filter((e) => e.length > 0)];
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
  } catch {
    return false;
  }
  // Windows reports X_OK for everything, which is why the extension list above
  // carries the real filter there.
  if (process.platform === "win32") return true;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every executable named `name` on PATH, in the order a shell searches.
 *
 * Empty when nothing matches — and also when `name` contains a separator, which
 * a shell runs directly rather than looking up. Modelling that as "no PATH
 * resolution" is correct: there genuinely is none.
 */
export function resolveOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (name.includes("/") || name.includes("\\")) return [];

  // `Path` is the casing Windows uses; `env` lookups there are case-insensitive
  // in practice, but a plain object read is not.
  const raw = env.PATH ?? env.Path ?? "";
  if (raw.length === 0) return [];

  const extensions = executableExtensions(env);
  const seen = new Set<string>();
  const found: string[] = [];

  for (const entry of raw.split(path.delimiter)) {
    // An EMPTY PATH entry means the current directory to a POSIX shell. Keeping
    // that faithful matters: it is one of the ways a stale local copy wins.
    const dir = entry.length === 0 ? "." : entry;
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (isExecutableFile(candidate)) found.push(candidate);
    }
  }

  return found;
}
