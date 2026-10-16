import { createHash } from "node:crypto";

import type { Argument, Option } from "commander";

import type { SurfaceTier } from "./cli-surface.model";
import type { CommandNode } from "./command-universe";

/**
 * THE PER-FIELD ENCODERS of a surface row: the tier rule, commander's own flag
 * and argument spellings, and the rename-stable shape hash.
 *
 * Split out of `cli-surface.project.ts`, whose header documents the projection
 * as a whole. Everything here is pure — a value in, a string in, no walk and no
 * filesystem — so `cli-surface.codegen.test.ts` can exercise the tier RULE on
 * synthetic input without building a command tree.
 */

/**
 * Namespaces `COMPATIBILITY.md` carves out of STABLE by name.
 *
 * `apps` and `admin` are named under UNSTABLE — "visible because operators need
 * to find them, not because they are stable". `nexus api` has its own UNSTABLE
 * section. This is a transcription of that document, so a leaf's tier is a
 * CHECKABLE consequence of the promise rather than a second opinion about it.
 */
const UNSTABLE_NAMESPACES: ReadonlySet<string> = new Set(["admin", "api", "apps"]);

/**
 * Which promise governs this leaf's path and required positionals.
 *
 * Hiddenness wins over everything: `COMPATIBILITY.md`'s INTERNAL tier opens with
 * "hidden commands", and a hidden command under `admin` is still hidden.
 */
export function tierOf(node: Pick<CommandNode, "path" | "hidden">): SurfaceTier {
  if (node.hidden) return "INTERNAL";
  return UNSTABLE_NAMESPACES.has(node.path.split(" ")[0]) ? "UNSTABLE" : "STABLE";
}

/** `{a|b|c}`, or nothing when the value is unrestricted. */
function choiceSuffix(choices: readonly string[] | undefined): string {
  return choices === undefined || choices.length === 0 ? "" : ` {${choices.join("|")}}`;
}

/**
 * One option, encoded.
 *
 * The `flags` string is commander's own and carries the short alias, the long
 * name, the value placeholder and negation. `!` and `~` carry the two facts it
 * does not: a MANDATORY option, and one hidden from `--help`.
 *
 * 🚨 EVERY FIELD HERE IS READ AS DECLARED, WITH NO CAST, AND THAT IS THE POINT.
 * `mandatory`, `hidden` and `argChoices` are all public on commander's `Option`,
 * as `required`, `variadic` and `argChoices` are on `Argument` and
 * `registeredArguments` is on `Command`. A cast would compile identically today
 * and fail SILENTLY on an upstream rename — the read yields `undefined`, the
 * comparison is `false`, and every mandatory option in the manifest quietly
 * reports as optional with no type error anywhere.
 *
 * `command-universe.ts` documents that failure beside `isHiddenCommand`, having
 * been bitten by it. This file is generated evidence about the public surface;
 * a fact that can go wrong without a compiler error is the defect, not the cast.
 */
export function encodeOption(option: Option): string {
  return `${option.mandatory ? "!" : ""}${option.hidden ? "~" : ""}${option.flags}${choiceSuffix(option.argChoices)}`;
}

/** One positional, in commander's own spelling: `<required>`, `[optional]`, `...` variadic. */
export function encodeArgument(argument: Argument): string {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;
  return `${argument.required ? `<${name}>` : `[${name}]`}${choiceSuffix(argument.argChoices)}`;
}

/**
 * THE RENAME-STABLE IDENTITY. Everything except the path.
 *
 * The description is load-bearing and was measured rather than assumed. Without
 * it the fingerprint collapses to module + flags + arity, and that collides on
 * hundreds of leaves — `agent get <id>` and `agent delete <id>` are the same
 * shape under it. Including the description separates them.
 *
 * It does not make the field unique, and it cannot: leaves registered as aliases
 * of ONE action share every input this hashes. `Projection.shapeCollisions`
 * reports each such group and the generated header names them, so the current
 * answer is read there rather than from a number written down here.
 */
export function shapeOf(input: {
  readonly module: string;
  readonly description: string;
  readonly args: readonly string[];
  readonly flags: readonly string[];
}): string {
  // Joined on NUL, because no flag, argument or description can contain one, so
  // two different field splits can never hash to the same material. Written as
  // an ESCAPE rather than a literal: a raw NUL is invisible in an editor, and it
  // makes `grep` classify the whole file as binary and report zero matches.
  const material = [
    input.module,
    [...input.flags].sort().join("|"),
    input.args.join(" "),
    input.description
  ].join("\u0000");
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}
