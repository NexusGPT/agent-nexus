/**
 * Renders a contract shape into `--help` text. Runtime-safe: no Zod, no
 * `@nexus/types`, no filesystem, no dependency beyond the language.
 *
 * ── Why this renders at RUNTIME and not into the generated file ─────────────
 *
 * The first version of this baked the rendered block into
 * `<namespace>.contract.generated.ts` as a string. That version printed `SMS`
 * into `nexus deployment create --help` — a deployment type the contract lists,
 * the parser accepts, and the server 500s on. The CLI omits it on purpose and
 * spends three lines of hand-written help saying so, and the generated block sat
 * directly above those three lines contradicting them.
 *
 * The generator cannot know about that omission: it is declared at the FLAG, in
 * the command file, beside the prose explaining it. So the generated file now
 * carries only the contract's facts as DATA, and the sentence is composed here,
 * where both halves are in scope. A generated string that can disagree with the
 * `.choices()` beside it is worse than no generated string at all.
 */

/** A slot a contract descriptor can carry, in the order a reader meets them. */
export const SLOTS = ["PathVars", "Params", "Body"] as const;
export type Slot = (typeof SLOTS)[number];

/** One leaf or branch of a descriptor's input, flattened to a dotted path. */
export interface ProjectedField {
  /** `<slot>.<dotted path>`, with `[]` stepping into an array element. */
  readonly path: string;
  readonly slot: Slot;
  /** JSON Schema `type`, or `"unknown"` where the converter emitted none. */
  readonly type: string;
  /** Required by its immediate parent object. */
  readonly required: boolean;
  /** Present only for an enum. Contract order, never sorted. */
  readonly enumValues?: readonly string[];
  /**
   * An object the contract does not describe — a record, a passthrough, a
   * `z.custom`. Its shape is decided elsewhere (by another field's value, or by
   * the handler), so there is nothing here to print and saying so is the honest
   * output.
   */
  readonly opaque?: boolean;
  /** Nesting depth. 0 is a direct child of the slot. */
  readonly depth: number;
}

export interface ProjectedDescriptor {
  readonly name: string;
  readonly method: string;
  readonly route: string;
  /** Every field, depth-first, in contract declaration order. */
  readonly fields: readonly ProjectedField[];
}

/** What the command file declared it does not offer, keyed by contract path. */
export interface RenderedOmission {
  readonly values: readonly string[];
  readonly because: string;
}

const WRAP_AT = 76;

function wrapValues(values: readonly string[], indent: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const value of values) {
    const next = current === "" ? value : `${current}, ${value}`;
    if (`${indent}${next}`.length > WRAP_AT && current !== "") {
      lines.push(indent + current);
      current = value;
    } else {
      current = next;
    }
  }
  if (current !== "") lines.push(indent + current);
  return lines;
}

const SLOT_LABEL: Record<Slot, string> = {
  PathVars: "Path",
  Params: "Query",
  Body: "Body"
};

/**
 * THE READABILITY RULE, stated once and implemented once:
 * REQUIRED AT DEPTH 0 · ENUMS AT ANY DEPTH · EVERYTHING ELSE TALLIED.
 *
 * A schema dump is not documentation. A `deployment create` body reaches
 * settings that differ per type and run to dozens of leaves for one variant;
 * printing them destroys the page for the 90% of readers who wanted a different
 * variant, and prints nothing the server's 400 would not have said better. So
 * the block prints:
 *
 *   · every REQUIRED field at depth 0, with its type — the smallest call that
 *     can succeed;
 *   · every ENUM at any depth, with the values ACTUALLY OFFERED — the class of
 *     failure this whole mechanism exists to move from the server to the
 *     terminal;
 *   · any declared omission, with its reason, on its own line;
 *   · an opaque object NAMED as opaque, never expanded, because the contract
 *     genuinely does not describe it and inventing a shape is worse than
 *     silence;
 *   · one tally of what was left out, so the omission is visible rather than
 *     reading as the whole story.
 *
 * `--print-contract` prints every field. The block is the summary; the flag is
 * the escape hatch.
 *
 * ⚠️ `required` is the CONTRACT's opinion, and the contract is wrong at least
 * once. `DeploymentList.Params.isActive` is
 * `z.preprocess(fn, z.boolean().optional())` — the `.optional()` sits INSIDE the
 * pipe, so the outer type is not optional and this prints it as required. The
 * live `deployment_list` MCP tool advertises it as required for exactly the same
 * reason, from the same converter. Printing what the contract says is correct
 * here; the fix belongs in `packages/types`.
 */
export function renderHelpBlock(
  descriptor: ProjectedDescriptor,
  omissions: ReadonlyMap<string, RenderedOmission> = new Map()
): string {
  if (descriptor.fields.length === 0) return "";

  const lines: string[] = [`Contract (${descriptor.method} ${descriptor.route}):`];
  let omittedOptional = 0;
  let omittedNested = 0;

  for (const slot of SLOTS) {
    const inSlot = descriptor.fields.filter((field) => field.slot === slot);
    if (inSlot.length === 0) continue;

    const shown: string[] = [];
    for (const field of inSlot) {
      const leaf = field.path.slice(field.path.indexOf(".") + 1);
      const isEnum = field.enumValues !== undefined;

      if (!isEnum && !(field.depth === 0 && field.required)) {
        if (field.depth > 0) omittedNested += 1;
        else omittedOptional += 1;
        continue;
      }

      if (isEnum) {
        const omission = omissions.get(`${descriptor.name}.${field.path}`);
        const hidden = new Set(omission?.values ?? []);
        const offered = (field.enumValues ?? []).filter((value) => !hidden.has(value));

        shown.push(`  ${leaf}${field.required ? " (required)" : ""} — one of:`);
        shown.push(...wrapValues(offered, "      "));
        if (omission && omission.values.length > 0) {
          shown.push(`    Not offered: ${omission.values.join(", ")} — ${omission.because}`);
        }
      } else if (field.opaque) {
        shown.push(`  ${leaf} (required) — object; the contract does not describe its shape`);
      } else {
        shown.push(`  ${leaf} (required) — ${field.type}`);
      }
    }

    if (shown.length > 0) lines.push(`${SLOT_LABEL[slot]}:`, ...shown);
  }

  const tally: string[] = [];
  if (omittedOptional > 0) tally.push(`${omittedOptional} optional field(s)`);
  if (omittedNested > 0) tally.push(`${omittedNested} nested field(s)`);
  if (tally.length > 0) {
    lines.push(`  Not shown: ${tally.join(", ")}. Use --print-contract for the full list.`);
  }

  return lines.join("\n");
}

/** Every field, one per line — the `--print-contract` output. */
export function renderFullContract(descriptor: ProjectedDescriptor): string {
  const lines = [`${descriptor.name} — ${descriptor.method} ${descriptor.route}`, ""];
  for (const field of descriptor.fields) {
    const flags = [field.required ? "required" : "optional"];
    if (field.opaque) flags.push("opaque; shape not described by the contract");
    lines.push(`  ${field.path}  [${flags.join(", ")}] ${field.type}`);
    if (field.enumValues) lines.push(...wrapValues(field.enumValues, "      "));
  }
  return lines.join("\n");
}
