#!/usr/bin/env node

import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };
import { getBanner } from "./banner";
import { parseTimeoutSeconds } from "./client";
import { registerHelpScopeFooter } from "./help-scope";
import { addGlobalFlagsFooter } from "./root-global-flags-footer";
import { ROOT_EPILOGUE } from "./root-help-epilogue";
import { registerNamespaces } from "./root-namespace-registrars";
import { rootPreAction } from "./root-pre-action";
import { runCli } from "./root-run-cli";
import { applyFinishedTreeDecorations } from "./root-tree-decorations";

export const VERSION = packageJson.version;

/**
 * BUILD THE ROOT PROGRAM, AND RETURN IT WITHOUT PARSING.
 *
 * ── WHY THIS IS A FUNCTION AND NOT MODULE-LEVEL CODE ─────────────────────────
 *
 * This file used to build `program` at module scope and then parse argv, so
 * IMPORTING it RAN the CLI and nothing could read the tree it builds. Every tool
 * that needed the tree rebuilt one from the `register*` functions — which
 * reaches the NAMESPACE registrars and structurally cannot reach the
 * PROGRAM-LEVEL options below, applied to the root object this file builds.
 *
 * The cost was measured, not predicted:
 *
 *   - `--dashboard-url` and `--timeout` are real global options documented on no
 *     page, because a docs generator cannot enumerate the global set.
 *   - A command-level `.option()` that collides with a global never receives its
 *     value: this program does NOT call `enablePositionalOptions()`, so the root
 *     parses its own options across the whole of argv and consumes the value
 *     first, leaving the subcommand's slot `undefined`. That is silent, and on
 *     `custom-model` it sent this CLI's own authenticated request to a
 *     user-named third-party host. Detecting the CLASS needs the global set,
 *     which needs this function.
 *
 * ── 🚨 WHY THE OPTION CHAIN STAYS HERE WHEN EVERYTHING ELSE COMPOSED OUT ─────
 *
 * The GLOBAL OPTION DECLARATIONS below are read as TEXT by
 * `auto-update-is-opt-in.test.ts`, which derives the `--…auto-update…` flag set
 * from this file and asserts the resulting commander VALUE. So the two flags
 * stay declared here, in one chain, spelled literally. Three of the siblings
 * this function composes are text-read too and each says so in its own header:
 * `root-namespace-registrars.ts` and the `root-help-epilogue.*` set.
 *
 * Only the two statements that must not happen on import are behind
 * {@link isProcessEntryPoint}. Import this module, or `./root-program`, and you
 * get the tree without running the CLI.
 *
 * ── WHY THE VERSION IS A PARAMETER ───────────────────────────────────────────
 *
 * It defaults to {@link VERSION}, so every caller that wants the real program
 * keeps calling `buildRootProgram()` and gets the shipped version. The argument
 * exists for the help-scope gate: the footer PRINTS the version, and asserting
 * on it against `VERSION` would compare the file to itself and pass whatever
 * either side said. Injecting a fixed version is what makes that assertion mean
 * something. Nothing in the binary passes one.
 */
export function buildRootProgram(version: string = VERSION): Command {
  const program = new Command()
    .name("nexus")
    .description("Official CLI for the Nexus AI agent platform")
    .version(version, "-v, --version")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--dashboard-url <url>", "Override dashboard URL (for browser links)")
    .option("--profile <name>", "Use a specific named profile")
    .option(
      "--timeout <seconds>",
      "HTTP request timeout in seconds (default 30; 600 for operations that run a model)",
      parseTimeoutSeconds
    )
    // Declaring BOTH forms is what makes the default OFF: commander gives a lone
    // `--no-x` an implicit default of true, and stops doing so once the positive
    // flag exists. So `opts.autoUpdate` is `undefined` unless one is passed, and
    // the `else` branch in `root-run-cli.ts` — print a notice, install nothing —
    // is the default.
    // Why the default moved (NEX-3708): the updater replaces the directory the
    // running binary lives in, from inside that binary, and cannot relink the
    // global shim itself. A half-applied update leaves the shim pointing at a
    // pnpm hash directory that no longer exists, and then NOTHING in this package
    // runs — including any repair we could write, because Node fails to resolve
    // dist/index.js before our first line executes.
    .option("--auto-update", "Self-update to the latest version on exit (off by default)")
    .option("--no-auto-update", "Do not self-update on exit (the default)")
    .hook("preAction", rootPreAction);

  // Prepend banner to top-level --help only (not subcommands)
  program.addHelpText("before", getBanner(version));
  program.addHelpText("after", ROOT_EPILOGUE);
  program.configureHelp({ sortSubcommands: true });

  // BEFORE the scope footer, so the derived global-flag block renders above it.
  addGlobalFlagsFooter(program);

  // The scope footer, on EVERY help screen at every depth. One registration:
  // commander fires `afterAll` on the helped command and all its ancestors.
  // Read `help-scope.ts` before moving, rewording or removing this — the
  // position below the command's own Notes block is the point of it.
  registerHelpScopeFooter(program, version);

  registerNamespaces(program);
  applyFinishedTreeDecorations(program);

  return program;
}

/**
 * True only when Node was pointed at this module directly.
 *
 * 🚨 THIS GUARD ONLY EXISTS IN THE BUILT ARTIFACT, SO READING THE SOURCE CANNOT
 * VERIFY IT. Getting it wrong does not degrade the CLI, it DELETES it: the
 * binary would exit 0 having done nothing, silently, on every command. tsup
 * emits a single CJS bundle (`format: ["cjs"]`, `entry: ["src/index.ts"]`) and
 * `package.json` points `bin` at `dist/index.js`, so `require.main === module`
 * is the correct test there — and `pnpm build && node dist/index.js --version`
 * is the only thing that proves it. Run that, not a typecheck, after touching
 * this.
 *
 * Defensive rather than bare because the same source is loaded by vitest
 * through an ESM transform, where `require` and `module` are interop shims and
 * may be absent entirely. Failing closed is right in that direction: a test
 * importing this file must never launch the CLI.
 */
function isProcessEntryPoint(): boolean {
  try {
    return (
      typeof require !== "undefined" && typeof module !== "undefined" && require.main === module
    );
  } catch {
    return false;
  }
}

if (isProcessEntryPoint()) {
  const program = buildRootProgram();

  // If no arguments, show help (which includes the banner)
  if (process.argv.length <= 2) {
    program.help();
  }

  void runCli(program, VERSION);
}
