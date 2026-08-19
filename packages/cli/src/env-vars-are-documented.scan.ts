import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * WHICH `NEXUS_*` VARIABLES THE BINARY READS, AND WHICH HELP SCREEN NAMES EACH.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` claimed five of the nine `NEXUS_*` variables appeared on no
 * help screen. One did. The claim was wrong about FOUR of them —
 * `NEXUS_BASE_URL`, `NEXUS_ENV` and `NEXUS_DASHBOARD_URL` are all named on
 * `nexus docs --help`, and `NEXUS_NO_AUTO_UPDATE` on `nexus --help` — and it
 * shipped in the package's stability contract, where a second lane then restated
 * it from the document rather than measuring it.
 *
 * ── THE CAUSE, WHICH IS THE WHOLE REASON THIS FILE RENDERS ───────────────────
 *
 * The claim was derived by READING SOURCE. A source search answers
 * `where is this variable USED`. The contract's claim was about
 * `where is this variable DOCUMENTED`. Those are different questions with
 * different answers, and nothing about a grep announces that it answered the
 * other one: `NEXUS_BASE_URL` is read inside the bundled SDK's HTTP client and
 * is named on `nexus docs --help`, and neither location predicts the other.
 *
 * So this scan uses BOTH instruments and keeps them apart on purpose:
 *
 *   - {@link readEnvVarNames} reads SOURCE, because "does the binary read this"
 *     is a fact about code.
 *   - the gate renders every `--help`, because "is this documented" is a fact
 *     about output.
 *
 * ── WHAT THIS CANNOT DO ──────────────────────────────────────────────────────
 *
 *  - It matches `process.env.X` and `process.env["X"]` textually. A variable
 *    reached through a computed key (`process.env[name]`) is invisible to it,
 *    and so is one read by a dependency this scan does not walk.
 *  - `named on a screen` means the screen's text CONTAINS the name. It cannot
 *    tell a real explanation from a passing mention, and it should not try: a
 *    mention is what makes a reader able to find the variable at all, which is
 *    the property the contract is actually about.
 *  - It says nothing about whether the documented BEHAVIOUR is correct.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Files excluded from the source read, and why each one.
 *
 * 🚨 EXCLUSIONS ARE NAMED, NEVER PATTERNED AWAY. A census that quietly drops a
 * file is how a count goes wrong in the direction nobody checks — and one of
 * these is 9 MB on ONE LINE, so a naive line-based count over this tree returned
 * 60 where the answer was 1.
 */
const EXCLUDED_FROM_SOURCE_READ = {
  ".test.ts": "a test may NAME a variable it does not read; only shipped code counts",
  ".generated.ts": "emitted by a generator, and one is 9 MB on a single line",
  ".generated.json": "same generator, same single-line shape",
  ".scan.ts": "this file and its siblings quote variable names in prose",
  ".ledger.ts": "a ledger quotes names as data, and reads none of them"
} as const;

function isExcluded(file: string): boolean {
  return Object.keys(EXCLUDED_FROM_SOURCE_READ).some((suffix) => file.endsWith(suffix));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!full.endsWith(".ts") && !full.endsWith(".mts")) continue;
    if (isExcluded(full)) continue;
    out.push(full);
  }
  return out;
}

/** `process.env.NEXUS_X` and `process.env["NEXUS_X"]`, in that order. */
const ENV_READ =
  /process\s*\.\s*env\s*(?:\.\s*(NEXUS_[A-Z0-9_]+)|\[\s*["'`](NEXUS_[A-Z0-9_]+)["'`]\s*\])/g;

/** Every root this binary's behaviour can come from. The SDK is bundled in. */
export const SOURCE_ROOTS: readonly string[] = [join(HERE), join(HERE, "..", "..", "sdk", "src")];

/**
 * Every `NEXUS_*` variable the shipped code READS, across the CLI and the
 * bundled SDK, sorted.
 */
export function readEnvVarNames(): string[] {
  const found = new Set<string>();
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf-8");
      for (const match of text.matchAll(ENV_READ)) {
        const name = match[1] ?? match[2];
        if (name !== undefined) found.add(name);
      }
    }
  }
  return [...found].sort();
}

/** The root program's own `--help`, which is not a node in the command tree. */
export const ROOT_SCREEN = "<root>";

/**
 * THE OBLIGATION SET. Every variable the binary reads, and the ONE help screen
 * a reader is sent to for it — `null` when no screen names it at all.
 *
 * 🚨 THIS IS NOT A COUNT AND NOT A FLOOR. The gate asserts this map's keys equal
 * the derived read-set exactly, so a NEW variable fails the build until it is
 * declared here, and a variable that stops being read fails it too. A count
 * would let one arrive as another left.
 *
 * A `null` is a DECLARATION that the variable is undocumented, not a gap the
 * gate tolerates: the gate asserts a `null` entry appears on NO screen, so
 * documenting one without moving its line here fails just as loudly as leaving a
 * new one undeclared. `COMPATIBILITY.md` treats an undocumented variable as
 * internal and promises nothing about it, which is a position the package is
 * allowed to hold — it is not allowed to hold it by accident.
 *
 * The value is a command PATH as `deriveCommandNodes()` keys them, or
 * {@link ROOT_SCREEN} for `nexus --help`. Several of these are named on more
 * screens than the one recorded; the gate asserts the recorded screen still
 * names the variable and says nothing about the others, because which `auth`
 * screen repeats `NEXUS_API_KEY` is presentation and moves freely.
 */
export const ENV_VAR_DOCUMENTATION: Readonly<Record<string, string | null>> = {
  NEXUS_ADMIN_TOKEN: "admin",
  NEXUS_API_KEY: ROOT_SCREEN,
  NEXUS_BASE_URL: "docs",
  NEXUS_DASHBOARD_URL: "docs",
  NEXUS_ENV: "docs",
  NEXUS_NO_AUTO_UPDATE: ROOT_SCREEN,
  NEXUS_NO_PROMPTS: null,
  NEXUS_ORGANIZATION_ID: ROOT_SCREEN,
  NEXUS_PROFILE: ROOT_SCREEN
};
