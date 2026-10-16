/**
 * Typed errors for the admin command tree, and the one renderer that prints
 * them.
 *
 * Thirty-odd command files import `AdminCliError`, `handleAdminError`, or both,
 * from this path. It stays a pure re-export so none of them has to care which
 * leaf a symbol lives in — and so the two leaves can keep their own reasons to
 * change:
 *
 *   · `admin-errors.cli-error.ts` — the error CLASS and its five constructors,
 *     each pinned to an exit code from `src/exit-codes.ts`.
 *   · `admin-errors.handle.ts`    — the RENDERER, which owns the single
 *     `printFailure` path both channels go through.
 *
 * The edge runs one way, renderer → class, so the class can be constructed
 * anywhere without pulling an output channel in behind it.
 */

export { AdminCliError } from "./admin-errors.cli-error";
export { handleAdminError } from "./admin-errors.handle";
