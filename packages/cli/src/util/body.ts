import { readStdin, resolveInputValue } from "./stdin";

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

/**
 * Resolve a `--input` style flag value into parsed JSON.
 *
 * Like {@link resolveBody}, but for arbitrary JSON inputs (objects, arrays,
 * scalars) and with the more permissive file detection used by other
 * file-or-stdin flags (`--prompt`, `--content`, …):
 *  - `"-"` → reads JSON from stdin
 *  - A path to an existing file → reads and parses the file contents
 *  - Anything else → parses the literal value as inline JSON
 *
 * Returns `undefined` when `raw` is `undefined` (flag not provided).
 */
export async function resolveInputJson(
  raw: string | undefined,
  flagName = "--input"
): Promise<unknown> {
  if (raw === undefined) return undefined;

  const jsonStr = await resolveInputValue(raw);

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Invalid JSON in ${flagName}: ${jsonStr.length > 120 ? jsonStr.slice(0, 120) + "…" : jsonStr}`
    );
  }
}

/**
 * Narrow one untyped value — a commander option, or a field read off a
 * `--body` — to the string it is supposed to be, or `undefined`.
 *
 * Commander types an action handler's `opts` as `any`, and `--body` arrives as
 * `Record<string, unknown>`, so BOTH sources reach a command with the check
 * switched off. Passing either straight into a typed request body compiles and
 * validates nothing; that is how `{ authType: "oauth" }` reached the server for
 * months against a contract that requires a `service` too.
 *
 * An empty string collapses to `undefined` on purpose. `--service ""` supplies
 * no service, and the caller's `?? ` chain must fall through to the next source
 * and then to a stated error, rather than putting `""` on the wire for the
 * server to reject with a field name the operator never typed. That is a
 * deliberate `||`-shaped decision, written once here instead of being re-derived
 * per call site — see the `prefer-nullish-coalescing` trap: `??` and `||` differ
 * on exactly this value.
 */
export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Read a field the operator may have supplied twice — as a flag, or inside
 * `--body` — with the flag winning.
 *
 * This is {@link mergeBodyWithFlags}'s precedence, minus its defect. That helper
 * merges every flag whose value is not `undefined`, and a commander DEFAULT is
 * never `undefined`: `--auth-type <type>` declared with a default of `"oauth"`
 * overwrote the `authType` of every `--body`, including the one `nexus tool
 * connect --help` printed as its own example. The flag looked explicit and was
 * not, and nothing in commander distinguishes the two.
 *
 * So a flag that can also be supplied through `--body` must carry NO commander
 * default, and be read through here. Its default then belongs after both sources
 * are known — the only place a value can mean "neither source said". The rule is
 * enforced by `commands/flag-defaults-never-overwrite-body.test.ts`.
 */
export function readStringField(
  flagValue: unknown,
  body: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  return readString(flagValue) ?? readString(body?.[key]);
}

/**
 * Merge a `--body` JSON object with explicit CLI flags.
 * Flags take precedence — any non-`undefined` flag value overwrites the body field.
 *
 * ⚠️ A commander DEFAULT is not `undefined`, so it merges too and silently wins
 * over `--body`. Declare no default on a flag merged here; use
 * {@link readStringField} and apply the default afterwards.
 */
export function mergeBodyWithFlags(
  body: Record<string, unknown> | undefined,
  flags: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...body };
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * THE boundary where operator-supplied JSON becomes a typed SDK argument.
 *
 * `--body` accepts arbitrary JSON — a literal, a file, or stdin — so what
 * arrives is `Record<string, unknown>` and nothing in the CLI can narrow it. The
 * CLI cannot validate it either: `safeParse` means a Zod import, and Zod pulls
 * the generated Prisma enums, which is the +5MB a published binary exists to
 * keep out. The server validates and returns a 400 with the field names, which
 * is a better error than anything a hand-rolled check here would produce.
 *
 * So the assertion is unavoidable. What is avoidable is it appearing inline at
 * every call site, where each one reads as a local shortcut rather than as the
 * one place a whole class of unchecked value enters. Naming it once means a
 * reader asking "where does unvalidated operator input cross into typed code?"
 * gets a single answer, and `as any` — which would also switch OFF checking on
 * everything downstream of the call — never has to be reached for.
 *
 * It takes a REQUIRED `Record`. An earlier version accepted `undefined` and
 * substituted `{}`, which turned "the operator omitted `--body`" into "the
 * operator sent an empty object" — a different request, reaching the server as
 * `{"auth":{}}` where it used to send nothing at all. A missing body is the
 * caller's problem to state, not this function's to invent.
 */
export function asRequestBody<T>(body: Record<string, unknown>): T {
  return body as unknown as T;
}
