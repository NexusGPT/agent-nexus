/**
 * One required field of a whole-object PUT: the body key, and the flag a user
 * actually types to supply it.
 *
 * 🚨 THE PAIR IS EXPLICIT BECAUSE DERIVING THE FLAG NAME WAS WRONG. Kebab-casing
 * the body key produces `--working-weeks-per-year`, `--paid-leave-weeks`,
 * `--public-holiday-days` and `--sickness-days` — four flags that do not exist.
 * The real options are shorter than their body keys, so the refusal named
 * something the caller could not pass, and they edited the wrong thing and
 * retried. That is worse than a bare "missing field", because the error looked
 * actionable.
 *
 * A derivation cannot be made correct here: commander's option names are a
 * product decision and the body keys are the server's, so the two are related by
 * nothing a function can compute. Stating both is the only form that cannot
 * drift, and a wrong pair is now visible at the call site instead of hidden in a
 * regex.
 */
interface RequiredField {
  /** The key the request body must carry. */
  readonly field: string;
  /** The flag exactly as a user types it, WITHOUT the leading `--`. */
  readonly flag: string;
}

/**
 * Refuse a PUT that is missing a required field, BEFORE it reaches the wire.
 *
 * These routes replace a whole object, so an omitted field is a 400 rather than
 * "leave it alone". Naming every missing flag at once beats one 400 per attempt —
 * which only holds while the names are the ones the user can actually type.
 */
export function requireAll(
  provided: Record<string, unknown>,
  required: readonly RequiredField[],
  hint: string
): void {
  const missing = required.filter(({ field }) => provided[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required ${missing.length === 1 ? "flag" : "flags"}: ${missing
        .map(({ flag }) => `--${flag}`)
        .join(", ")}. ${hint}`
    );
  }
}
