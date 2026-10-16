import { readStdin } from "./stdin";

/**
 * One resolution per distinct raw `--body` value, for the lifetime of the
 * process.
 *
 * `--body` is now resolved TWICE on every command that also declares required
 * flags: once by {@link applyBodySatisfiesRequired}'s pre-action check, which
 * has to know which fields the body supplies before it can decide whether a
 * required field is missing, and once by the action handler that builds the
 * request. Without a cache those two reads are not guaranteed to be the same
 * bytes, and for two of the three accepted forms they are actively wrong:
 *
 *  - `--body -` — stdin is consumable exactly ONCE. The second `readStdin()`
 *    attaches listeners to a stream that has already emitted `end`, so its
 *    promise never settles and the CLI hangs with no output and no exit.
 *  - `--body file.json` — a second read can see different bytes than the ones
 *    the check approved, so the request would carry a body nobody validated.
 *
 * Keyed on the raw flag value, which is the whole input to the resolution.
 * This process is one-shot per command, so there is no staleness window to
 * reason about.
 */
const resolvedBodies = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Forget every memoized body. For a caller that runs MANY commands in one
 * process — there is exactly one, and it is a scanner, not the CLI.
 *
 * 🚨 "ONE-SHOT PER PROCESS" IS TRUE OF THE BINARY AND FALSE OF THE GATE.
 * `help-truth-rules.ts` parses every `--help` example in the package in a single
 * node process, and the key for a piped body is the literal `"-"` for all of
 * them. Without this the FIRST example to resolve stdin answers for every later
 * one: `role create --body -` would be judged against the document
 * `workflow node update --body -` had piped in, so an example could pass on
 * another example's bytes, or fail on them. Both verdicts are about the wrong
 * input, and neither says so.
 *
 * Nothing in `src/` calls this and nothing should. The alternative — the scanner
 * spawning a process per example — costs about a thousand node startups to avoid
 * four lines.
 */
export function resetResolvedBodies(): void {
  resolvedBodies.clear();
}

/**
 * Resolve a `--body` flag value that the caller guarantees is present, into a
 * parsed object.
 *
 * Accepts:
 *  - `"-"` → reads JSON from stdin
 *  - A path ending in `.json` → reads and parses the file
 *  - A raw JSON string → parses directly
 *
 * Separate from {@link resolveBody} rather than an overload of it: TypeScript
 * overloads are the natural spelling, but the base `no-redeclare` rule does not
 * understand them and reports two errors. Two named functions say the same thing
 * and let the required case return a `Record` with no narrowing step and no
 * unreachable guard at the call site.
 */
export async function resolveRequiredBody(raw: string): Promise<Record<string, unknown>> {
  const cached = resolvedBodies.get(raw);
  if (cached) return cached;

  const pending = readAndParseBody(raw);
  resolvedBodies.set(raw, pending);
  return pending;
}

async function readAndParseBody(raw: string): Promise<Record<string, unknown>> {
  let jsonStr: string;

  if (raw === "-") {
    jsonStr = await readStdin();
  } else if (raw.endsWith(".json")) {
    try {
      const fs = await import("node:fs/promises");
      jsonStr = (await fs.readFile(raw, "utf-8")).trim();
    } catch (err) {
      throw new Error(
        `Could not read file "${raw}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    jsonStr = raw;
  }

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Invalid JSON in --body: ${jsonStr.length > 120 ? jsonStr.slice(0, 120) + "…" : jsonStr}`
    );
  }
}

/**
 * {@link resolveRequiredBody} for an OPTIONAL `--body`.
 *
 * Returns `undefined` when the flag was not provided, and the caller must deal
 * with that itself — silently substituting `{}` sends the server a DIFFERENT
 * request rather than no request.
 */
export async function resolveBody(
  raw: string | undefined
): Promise<Record<string, unknown> | undefined> {
  return raw === undefined ? undefined : resolveRequiredBody(raw);
}
