import type { Command } from "commander";

/**
 * THE GLOBAL FLAGS, NAMED ON THE SCREEN THAT DOES NOT DECLARE THEM.
 *
 * Every global option is declared ONCE, on the program in `index.ts`. So they
 * appear in the Options block of the root and of NO subcommand — while `--json`
 * appears in the Examples block of nearly every subcommand. A reader on a leaf
 * therefore sees the flag used and never sees it documented, which reads as
 * undocumented rather than as inherited.
 *
 * 🚨 THE LIST IS DERIVED FROM `program.options`, NEVER TYPED OUT. A
 * hand-written one is the defect this closes, one level up: it goes stale the
 * moment an option is added to the root, and it silently omits whatever its
 * author forgot. The docblock on `buildRootProgram` records that
 * `--dashboard-url` and `--timeout` were "real global options documented on no
 * page" for exactly that reason — and a hand-typed five-flag version of this
 * footer reproduced the `--dashboard-url` half of it before the derivation
 * replaced it.
 *
 * `--no-auto-update` is filtered out because commander declares it as the
 * negated twin of `--auto-update`; printing both would advertise the default
 * as if it were an action.
 *
 * 🚨 REGISTER THIS BEFORE THE SCOPE FOOTER so it renders above it, and note it
 * is suppressed on the root itself, whose epilogue already spells the flags out
 * with their resolution order. `afterAll` fires on the helped command and its
 * ancestors, so the guard is on the command being helped, not on the
 * registration.
 */
export function addGlobalFlagsFooter(program: Command): void {
  program.addHelpText("afterAll", (ctx) => {
    if (ctx.command === program) return "";
    const flags = program.options
      .filter((option) => !option.long?.startsWith("--no-"))
      .map((option) => option.flags)
      .join("  ");
    return (
      '\nGLOBAL FLAGS, USABLE HERE THOUGH THEY ARE LISTED ONLY ON "nexus --help"\n' +
      `  ${flags}\n` +
      "  They work anywhere in the line, before or after the subcommand, and none\n" +
      "  of them appears in a subcommand's own Options block. --json is one of\n" +
      "  them, which is why the Examples above use a flag this screen never lists.\n"
    );
  });
}
