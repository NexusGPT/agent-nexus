import { EXIT_CODES } from "../../../exit-codes";

/** The npm package this command upgrades. */
export const PACKAGE_NAME = "@agent-nexus/cli";

/** The command name a shell resolves. `package.json`'s `bin` key, in one place. */
export const BINARY_NAME = "nexus";

/**
 * Exit code for "the install succeeded and your shell still runs the old one".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT WAS 2, AND 2 ALREADY MEANT "NOT AUTHENTICATED" IN THE ADMIN TREE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both other failures leave the machine exactly as it was — the registry was
 * unreachable, or the install command itself failed — so a caller reading 1 can
 * retry and lose nothing. This outcome is the opposite: a package was written to
 * disk, and RETRYING IS THE TRAP. It writes the same bytes to the same directory
 * forever while the shell keeps resolving the other copy, which is precisely the
 * loop this outcome exists to end. That distinction is real and it keeps its own
 * code; what it does not keep is a NUMBER this binary spends on something else.
 *
 * `outcome-not-reached` is the general name for it, and this command is only its
 * first caller. See `src/exit-codes.ts`.
 */
export const EXIT_INSTALLED_BUT_NOT_RESOLVED = EXIT_CODES["outcome-not-reached"];

/**
 * Exit code for "the install succeeded and I cannot check it for YOU".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT IS NOT {@link EXIT_INSTALLED_BUT_NOT_RESOLVED}, BECAUSE THAT IS A
 *    FINDING AND THIS IS THE ABSENCE OF ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `outcome-not-reached` says something was READ BACK and disagreed — a specific file wins on
 * your PATH and here it is. Under `sudo` nothing of the sort was established:
 * the install ran as root and the verification read the ROOT process's
 * environment, and whether that is your shell's environment depends on a
 * sudoers configuration this command cannot see.
 *
 * Reporting that as a finding would name a PATH problem that may not exist. Reporting it
 * as 0 is the defect this whole namespace exists to prevent — a success sentence
 * about a machine nobody checked. An UNMEASURED outcome is neither, and it gets
 * its own code so a script can tell "I checked and it is wrong" from "I could
 * not check".
 *
 * Retrying does not help here either, and for a different reason: the
 * same `sudo` produces the same non-answer forever. The remedy is one command
 * WITHOUT `sudo`, which the output names.
 */
export const EXIT_VERIFICATION_NOT_YOURS = EXIT_CODES.unmeasured;

/**
 * The alternative spellings of `upgrade`, DECLARED ON THE COMMAND ITSELF.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SPELLING BELONGS HERE ONLY IF IT CANNOT MEAN ANYTHING ELSE IN THIS CLI.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This list was eighteen HIDDEN top-level commands, added so that "any
 * intuitive word triggers the upgrade". That rule has no stopping point, and it
 * reached words this CLI already uses for something else: `get` ends 40 leaves,
 * `update` ends 29, and `install` and `sync` are declared aliases of `skills
 * update`, which installs the skills bundle rather than the binary. Typed bare,
 * every one of them replaced the running binary instead — off every help screen,
 * so nothing warned anyone.
 *
 * The rule that replaced it is the one above, and it has a written boundary:
 * `update`, `latest` and `up` are the three the published docs
 * (`content/docs/cli/installation.mdx`) already instruct people to type. Adding
 * a fourth means writing it down there first.
 *
 * They are `.alias()` calls on `upgrade` rather than separate commands, which is
 * this CLI's own idiom (`task-eval` → `eval`, `workspace unmount` → `umount`).
 * One command, one help entry, and a guess that misses now prints "unknown
 * command" and points at `--help` instead of silently reinstalling.
 *
 * ⚠️ COMMANDER RENDERS ONLY THE FIRST ALIAS in a usage line, so that entry reads
 * `upgrade|update` — not `upgrade|update|latest|up`. `task-eval|eval` hides this,
 * because one alias is the whole list. So `latest` and `up` would be as
 * undiscoverable as the eighteen were, and the Notes block in `upgrade.help.ts`
 * names all three explicitly to close that gap. Verify against the binary, never
 * against this comment: `node dist/index.js --help | grep upgrade`.
 *
 * ⚠️ `index.ts` still needs the WORDS, because it reads `process.argv[2]` to
 * skip the auto-update after the upgrade ran. Commander reports an aliased
 * invocation under the command's NAME, so the word a user typed is not
 * recoverable from the tree.
 */
export const UPGRADE_ALIASES = ["update", "latest", "up"];
