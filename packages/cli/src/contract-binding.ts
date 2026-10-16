/**
 * THE JOIN KEY between a `--flag` and the Public API v1 field it fills.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * `--help` is hand-typed prose describing behaviour defined three packages away
 * in `packages/types/src/api/public/v1/`. Nothing linked the two, so an audit of
 * 674 help claims found 75 contradicted. The specific, mechanical half of that
 * is enum values: every enum the CLI accepts was validated only by the server
 * and documented only as English inside a `.option()` description. There was not
 * one `.choices()` call in the package, so `--granularity dayly` left the
 * machine, crossed the network, and came back a 400 with no list of what would
 * have worked.
 *
 * Fixing that needs one thing nothing in this repository records: WHICH schema
 * field a given flag fills. `--group-by` → `groupBy` is a convention;
 * `--metric` → `metrics` and `--filter` → `filters[].op` are not, and each
 * `.action()` does the mapping by hand in a different way. So the mapping is
 * declared ON the flag, rather than in a table somewhere else — a table goes
 * stale the first time somebody renames a flag and nothing points at it.
 *
 * ── What is generated and what is not ────────────────────────────────────────
 *
 * SHAPE is generated: the values of an enum, and the required keys of a body.
 * `<namespace>.contract.generated.ts` holds them, emitted by
 * `scripts/generate-contract-help.ts` from the real Zod schemas.
 *
 * MEANING is not, and never will be. Why a field is null, what breaks if you run
 * a command twice, which parser branch swallows a malformed input — no schema
 * contains any of that. It stays in `addHelpText` in the command file, beside the
 * behaviour it describes.
 *
 * ── The rule that matters most ───────────────────────────────────────────────
 *
 * 🚨 THE CONTRACT IS NOT AN AUTHORITY. It is one of two opinions, and it has
 * been the wrong one. `DeploymentTypeSchema` listed `SMS`, which no settings
 * schema stands behind and which answers 500 rather than a validation error,
 * while omitting `INSTAGRAM`, which shipped with a receiver, a sender, a
 * validator and a settings schema and was invisible to every API consumer. The
 * CLI's hand-typed list was right about the first and wrong about the second, so
 * no rule of precedence would have got both. A generator that preferred its
 * source would have deleted a correct correction and re-advertised a broken
 * value with generated authority behind it.
 *
 * So a divergence is DECLARED, at the flag, with its reason, and the reason is
 * rendered into `--help` for the operator to read. It is not a suppression entry
 * in a list somewhere: `contract-help.test.ts` fails when a declared omission no
 * longer matches anything upstream, which turns a stale correction into a red
 * build instead of a silent no-op, and the generator refuses outright when a
 * contract change invalidates a declaration.
 *
 * A declaration is also NOT the fix when the contract is wrong. It leaves the
 * SDK and the MCP catalog reading the same false schema. `SMS` was removed from
 * `packages/types` rather than papered over here, and that is the pattern.
 *
 * ── 🔴 THIS FILE IS A RE-EXPORT INDEX AND DECLARES NOTHING ───────────────────
 *
 * 288 files import from here, so the path is the package's internal API and does
 * not move. What moved out are the declarations, into the `contract-binding.*`
 * siblings this file re-exports — one job each, and none of them imports this
 * file back. That direction is load-bearing rather than tidy: `import/no-cycle`
 * is `warn` in `packages/config/eslint/base-flat.js`, a sibling importing a
 * shared value back out of the index it is re-exported from costs ONE warning
 * PER SIBLING, and this package runs `eslint . --max-warnings 9` sitting at 8.
 */

export { bindCommand } from "./contract-binding.bind-command";
export { enumInCompositeOption } from "./contract-binding.composite";
export { enumArgument } from "./contract-binding.enum-argument";
export { enumOption } from "./contract-binding.enum-option";
export { boundArgument, boundCommand, boundOption } from "./contract-binding.registry";
export type {
  BoundArgument,
  BoundCommand,
  BoundOption,
  ContractEnum,
  EnumDivergence
} from "./contract-binding.types";
