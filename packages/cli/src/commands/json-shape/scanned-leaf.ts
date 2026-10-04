import type { ShapePrinter } from "./printers";

/** One classified registration, keyed by its path RELATIVE to the registrar's root. */
export interface ScannedLeaf {
  /** `src/commands/*.ts` basename the registration is written in. */
  readonly sourceModule: string;
  /**
   * Space-joined path from the registrar's own `Command` parameter, e.g. `node
   * get` — extended upward through that registrar's call site wherever it
   * resolves, so a leaf registered on a handed-in `role` reads `role list`. See
   * `json-shape.registrar-prefix.ts`.
   */
  readonly relativePath: string;
  /**
   * The printers this registration's action reaches, sorted. Exactly one is a
   * classification; zero or more than one is deliberately not.
   */
  readonly printers: readonly ShapePrinter[];
  /**
   * The action decides its own `--json` output. See {@link SELF_JSON_MARKERS}.
   * When true, `printers` describes the HUMAN branch and must not be published.
   */
  readonly selfJson: boolean;
}
