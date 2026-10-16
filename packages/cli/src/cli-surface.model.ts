/**
 * THE TYPES UNDER `cli-surface.generated.ts` — deliberately dependency-free.
 *
 * `cli-surface.generated.ts` is a DATA module: one row per leaf and one import.
 * It must not drag the command tree in behind it, so the type it names lives here
 * and this file imports nothing at run time — every re-export below is type-only
 * and erases. `cli-surface.project.ts` is the half that walks commander, and
 * nothing that merely READS the manifest has to load it.
 *
 * This module is the PUBLIC NAME for that type set. The declarations sit in two
 * siblings — the per-field unions in `cli-surface.model.fields.ts`, the row in
 * `cli-surface.model.leaf.ts` — and neither imports this file back, so the
 * re-export stays acyclic.
 */

export type {
  ConfirmationKind,
  SurfaceDisposition,
  SurfaceJsonShape,
  SurfaceTier
} from "./cli-surface.model.fields";
export type { SurfaceLeaf } from "./cli-surface.model.leaf";
