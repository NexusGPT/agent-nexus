/**
 * The value half of `nexus score` — resolving flags into a discriminated score
 * value, and rendering one back.
 *
 * Split out of `score.ts` deliberately: these are pure functions over strings,
 * so they can be tested without commander, without a client and without a
 * network. The command file is registration and prose; this file is the only
 * place a `--value-type` is turned into a value, and the only place a refusal is
 * decided.
 */

/** Which of the three value shapes a score carries. */
export type ScoreValueType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/** A score's value — exactly one shape per `valueType`. */
export type ResolvedScoreValue =
  | { valueType: "NUMERIC"; numericValue: number }
  | { valueType: "CATEGORICAL"; categoricalValue: string }
  | { valueType: "BOOLEAN"; booleanValue: boolean };

/** The `--value-type` values, paired with the one value flag each admits. */
const VALUE_FLAGS = [
  ["NUMERIC", "--numeric-value", "numericValue"],
  ["CATEGORICAL", "--categorical-value", "categoricalValue"],
  ["BOOLEAN", "--boolean-value", "booleanValue"]
] as const;

/**
 * Resolve `--value-type` and its one legal value flag into the shape the SDK
 * takes.
 *
 * 🔴 THE REFUSAL IS THE POINT, and it is local on purpose. Every wrong pairing
 * is rejected here rather than sent: the server would answer 400 with a Zod
 * path, where this can name the flag the caller should have used. It mirrors the
 * database's own `Score_value_matches_type_chk` constraint, so the CLI cannot
 * put a row on the wire the column would reject.
 *
 * Exactly one value flag must be present. Zero is a score with no value; two is
 * a caller who does not know which one took effect, and silently preferring the
 * one matching `--value-type` would teach them the wrong thing.
 *
 * @param opts - Raw commander options, every value still a string.
 * @throws If `--value-type` is unknown, if the matching value flag is absent, if
 * more than one value flag is present, or if the value does not parse.
 */
export function resolveScoreValue(
  opts: Record<string, string | boolean | undefined>
): ResolvedScoreValue {
  const valueType = String(opts.valueType);

  const supplied = VALUE_FLAGS.filter(([, , key]) => opts[key] !== undefined);
  if (supplied.length > 1) {
    throw new Error(
      `Pass exactly one value flag. Received ${supplied
        .map(([, flag]) => flag)
        .join(" and ")}, and --value-type ${valueType} admits only one.`
    );
  }

  const match = VALUE_FLAGS.find(([type]) => type === valueType);
  if (!match) {
    throw new Error(
      `--value-type must be NUMERIC, CATEGORICAL or BOOLEAN, received "${valueType}".`
    );
  }

  const [, flag, key] = match;
  const raw = opts[key];
  if (raw === undefined) {
    throw new Error(`--value-type ${valueType} requires ${flag}.`);
  }

  if (valueType === "BOOLEAN") {
    // 🔴 ALREADY A BOOLEAN. `--boolean-value` is parsed by `booleanFlag`, which
    // REFUSES anything but true/false in any case, at commander's parse time —
    // before this runs. Re-deriving it from a string here would rebuild the
    // coercion that parser exists to delete (`--active TRUE` read as false and
    // deactivated a live channel). So this asserts the type rather than parsing
    // it, and a non-boolean means the flag lost its parser.
    if (typeof raw !== "boolean") {
      throw new Error(
        `--boolean-value must be parsed by booleanFlag, received ${typeof raw} "${String(raw)}". ` +
          "The option has lost its argParser."
      );
    }
    return { valueType: "BOOLEAN", booleanValue: raw };
  }

  if (typeof raw !== "string") {
    throw new Error(`${flag} must be a string, received ${typeof raw}.`);
  }

  if (valueType === "NUMERIC") {
    const numericValue = Number(raw);
    // `Number("")` is 0 and `Number("abc")` is NaN — the first is the dangerous
    // one, because an empty flag would silently record a real score of zero.
    if (raw.trim() === "" || !Number.isFinite(numericValue)) {
      throw new Error(`--numeric-value must be a finite number, received "${raw}".`);
    }
    return { valueType: "NUMERIC", numericValue };
  }

  if (raw.length === 0) throw new Error("--categorical-value must not be empty.");
  return { valueType: "CATEGORICAL", categoricalValue: raw };
}

/**
 * How a score's value renders in one table cell, whichever shape it carries.
 *
 * An unknown `valueType` is NAMED rather than printed as `undefined`: a blank
 * cell reads as a score with no value, where this reads as a CLI that has not
 * been taught a contract the server has already started sending.
 */
export function renderScoreValue(score: {
  valueType: string;
  numericValue?: number;
  categoricalValue?: string;
  booleanValue?: boolean;
}): string {
  if (score.valueType === "NUMERIC") return String(score.numericValue);
  if (score.valueType === "CATEGORICAL") return String(score.categoricalValue);
  if (score.valueType === "BOOLEAN") return String(score.booleanValue);
  return `(unknown valueType ${score.valueType})`;
}

/**
 * Parse `--metadata` as JSON.
 *
 * Refused rather than passed through as a string: the field is free-form JSON on
 * the wire, so sending `{"a":1}` as a STRING would store a quoted blob that
 * reads back as text and never as an object — a corruption nothing downstream
 * would report.
 */
export function parseMetadata(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`--metadata must be valid JSON. Received: ${raw}`);
  }
}
