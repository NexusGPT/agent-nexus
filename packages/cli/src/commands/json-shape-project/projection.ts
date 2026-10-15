import type { JsonShapeId } from "../../json-shape-help";
import type { ShapePrinter } from "../json-shape.scan";

/** Every printer's shape id. Exhaustive by construction — `tsc` refuses a gap. */
export const SHAPE_OF: Readonly<Record<ShapePrinter, JsonShapeId>> = {
  printRecord: "record",
  printList: "list",
  printTable: "array",
  printSuccess: "success",
  printDryRun: "dryRun",
  printEnvelope: "envelope"
};

export interface Projection {
  /** Leaf path -> shape, for every leaf the derivation can answer for. */
  readonly shapes: Readonly<Record<string, JsonShapeId>>;
  /** Every leaf in the tree, so a reader can size the silence. */
  readonly leafCount: number;
  /**
   * Leaves with no entry, and why — for the generated file's header, so the
   * shadow is a figure rather than an absence.
   */
  readonly unclassified: Readonly<Record<UnclassifiedReason, number>>;
}

export type UnclassifiedReason =
  /** No scanned registration whose relative path is a suffix of this leaf's. */
  | "no-registration"
  /** Two registrations tie at the longest match; guessing would be worse. */
  | "ambiguous"
  /** The action writes its own JSON, so the printer it reaches is the human branch. */
  | "writes-its-own-json"
  /** The action reaches none of the six. */
  | "no-printer"
  /** The action reaches more than one — the shape depends on a branch. */
  | "branches";
