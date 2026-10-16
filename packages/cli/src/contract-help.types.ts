/**
 * THE PROJECTED SHAPE OF ONE PUBLIC API v1 CONTRACT DESCRIPTOR — plain data,
 * written by `scripts/v1-contract-projection.ts` and read by the renderer, the
 * codegen and every `*.contract.generated.ts` module.
 *
 * Runtime-safe and dependency-free on purpose: no Zod, no `@nexus/types`, no
 * filesystem. `contract-help.render.ts` is the public name for these types and
 * for the rendering beside them.
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
