/**
 * `--type` accepts lowercase; the contract does not. That is the only remaining
 * divergence on this flag, and it is a WIDENING.
 *
 * ── What used to be here, and why it is worth one paragraph ─────────────────
 *
 * A declared NARROWING sat here, omitting `SMS`: the contract listed it, no
 * settings schema existed behind it, and the create failed as a 500 rather than
 * a validation message. The CLI omitted it on purpose and spent three lines of
 * `--help` saying so.
 *
 * It is gone because the CONTRACT was fixed rather than routed around.
 * `DeploymentTypeSchema` now derives from the Prisma enum, so `SMS` is not a
 * value anywhere and `INSTAGRAM` — which had a receiver, a sender, a validator
 * and a settings schema, and was invisible to every API consumer — is one. That
 * is the outcome a CLI-side omission could never have reached: the SDK and the
 * MCP catalog read the same schema and were being told the same false thing.
 *
 * The generator is what made the change impossible to miss. It refused to write
 * this namespace the moment the two lists stopped agreeing, printed both, and
 * named `INSTAGRAM` as present upstream and undeclared here. It picked no
 * winner, which was correct — on the previous run the contract was the wrong
 * list, and on this one the CLI was.
 */
export const CASE_INSENSITIVE = {
  because: "Values are case-insensitive"
} as const;

/** `--type embed` has always worked; the action upper-cases before sending. */
export const upperCase = (value: string): string => value.toUpperCase();
