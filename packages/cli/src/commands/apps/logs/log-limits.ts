import { VIBE_LOG_WIRE_MAX_LIMIT } from "../../../vibe-wire-types";

/** How far back a read goes when the caller does not say. */
export const VIBE_LOG_CLI_DEFAULT_SINCE = "1h";

/** Lines per read when the caller does not say. */
export const VIBE_LOG_CLI_DEFAULT_LIMIT = 200;

/**
 * The most lines one read will ask for.
 *
 * STRICTER than the server's own `VIBE_LOG_WIRE_MAX_LIMIT` (5000) on purpose, and
 * the two are separate numbers rather than one shared ceiling. A terminal is not
 * a log viewer: five thousand lines is a scrollback nobody reads, and the honest
 * answer to wanting more of them is `--json` into a file. The server refuses
 * independently at its own, higher, number — so both layers refuse, and the
 * CLI's refusal is the one a user actually meets.
 */
export const VIBE_LOG_CLI_MAX_LIMIT = 1000;

/** Named so the help text and the refusal message cannot drift from the ceiling. */
export const VIBE_LOG_CLI_LIMIT_HELP = `Lines to read (1–${String(VIBE_LOG_CLI_MAX_LIMIT)}). Default ${String(VIBE_LOG_CLI_DEFAULT_LIMIT)}. The server's own ceiling is ${String(VIBE_LOG_WIRE_MAX_LIMIT)}.`;
