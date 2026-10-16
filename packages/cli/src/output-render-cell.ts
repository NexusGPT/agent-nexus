// ---------------------------------------------------------------------------
// Value → text. The ONE conversion every human-channel printer performs.
// ---------------------------------------------------------------------------

/**
 * Marks a value the terminal cannot honestly render.
 *
 * A cell that says nothing is better than a cell that says the WRONG thing, and
 * `[object Object]` is the wrong thing: it looks like a value, occupies the
 * column, and tells the reader nothing about what is actually there.
 */
const UNRENDERABLE = "[unrenderable]";

/**
 * `String(x)` reached `Object.prototype.toString` somewhere in the value.
 *
 * A SUBSTRING test, not an anchored one, and the difference is a real hole:
 * `String([{a:1},{b:2}])` is `"[object Object],[object Object]"`, which an
 * anchored `^\[object \w+\]$` does not match — so a two-element array of objects
 * slipped through while a one-element array (whose `toString` IS the element's)
 * was caught. Arrays are handled before this test anyway, but the substring form
 * is the one that stays correct for whatever shape arrives next.
 */
const USELESS_TO_STRING = /\[object [A-Za-z]+\]/;

/**
 * Render one value into one terminal cell. The ONLY value-to-text conversion
 * the printers perform.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `String(value)` ON AN OBJECT PRINTS `[object Object]`, AND NOTHING CATCHES IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every printer here used to interpolate `String(field(row, key) ?? "")`. That is
 * correct for a string, a number and a boolean — and for an object or an array it
 * emits `[object Object]`, which typechecks, lints clean, passes every test that
 * asserts a column is present, and is unreadable. `nexus analytics overview`
 * shipped four such fields of twelve (`tokenUsage`, `timeSeries`, `byChannel`,
 * `byDeployment`, `byModel`), and `nexus access-card get` shipped `policies` — the
 * field whose whole point is that you must read the key set.
 *
 * A response field is a nested object often enough that a per-command `format`
 * cannot be the defence: the next command to render one has the bug again, and
 * the bug is invisible until a human looks at the output. So the printer refuses
 * to produce the shape at all.
 *
 * The rule is deliberately generic rather than a list of known types: use the
 * value's own `toString` when it has a real one, and JSON otherwise. That covers
 * every object shape a v1 response can carry, including ones nobody has written
 * yet.
 *
 * `--json` never reaches this function. It serializes the untouched response, so
 * a script still gets the full nested object.
 */
export function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  // A Date's own toString is a verbose local-time sentence; the wire format is
  // ISO 8601 and that is what the rest of the CLI prints.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? UNRENDERABLE : value.toISOString();
  }
  if (value instanceof Error) return value.message;

  // An array's own toString is a comma join, which is a "real" toString by the
  // test below and yet destroys the structure: `[1,2]` reads as `1,2`, and
  // `[{a:1},{b:2}]` reads as `[object Object],[object Object]`. Always JSON.
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value) ?? UNRENDERABLE;
    } catch {
      return UNRENDERABLE;
    }
  }

  const asString = String(value);
  if (!USELESS_TO_STRING.test(asString)) return asString;

  // Only objects with no useful toString reach here. JSON says what they hold.
  try {
    const json = JSON.stringify(value);
    return json ?? UNRENDERABLE;
  } catch {
    // Circular, or a BigInt inside. Never fall back to String() — that is the
    // exact `[object Object]` this function exists to make impossible.
    return UNRENDERABLE;
  }
}
