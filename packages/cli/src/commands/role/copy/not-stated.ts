/**
 * What `nexus role` prints in place of a working-year term nobody has stated.
 *
 * It read `(org default)` until 2026-08-14, on four fields and in two places,
 * and no organization default exists for any of them — see
 * `working-year-has-no-organization-fallback.ts`. A constant rather than a
 * literal for the same reason the two statements above are constants: the wrong
 * word was in five places at once, and a correction has to land in all of them.
 */
export const NOT_STATED = "(not stated)";
