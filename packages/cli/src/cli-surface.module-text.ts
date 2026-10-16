import type { SurfaceLeaf } from "./cli-surface.model";
import { renderSurfaceHeader } from "./cli-surface.module-header";
import type { Projection } from "./cli-surface.projection.model";

/**
 * THE TEXT OF `cli-surface.generated.ts`, assembled from one projection.
 *
 * One function writes it and the gate calls the same one, so the writer and its
 * check cannot answer differently — `cli-surface.project.ts`'s header owns that
 * argument. The docblock is `cli-surface.module-header.ts`; this file is the
 * rows and the module around them.
 */

/** One row, on one line, so a changed leaf is a readable one-line diff. */
export function renderLeaf(leaf: SurfaceLeaf): string {
  const cell = (values: readonly string[]): string =>
    `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
  return (
    `  { path: ${JSON.stringify(leaf.path)}` +
    `, tier: ${JSON.stringify(leaf.tier)}` +
    `, module: ${JSON.stringify(leaf.module)}` +
    `, disposition: ${JSON.stringify(leaf.disposition)}` +
    `, args: ${cell(leaf.args)}` +
    `, flags: ${cell(leaf.flags)}` +
    `, aliases: ${cell(leaf.aliases)}` +
    `, hidden: ${String(leaf.hidden)}` +
    `, confirm: ${leaf.confirm === null ? "null" : JSON.stringify(leaf.confirm)}` +
    `, json: ${JSON.stringify(leaf.json)}` +
    `, shape: ${JSON.stringify(leaf.shape)} }`
  );
}

/** The generated module's text. One function, so the writer and the gate share it. */
export function renderCliSurfaceModule(projection: Projection): string {
  return `import type { SurfaceLeaf } from "./cli-surface.model";

${renderSurfaceHeader(projection)}
export const CLI_SURFACE: readonly SurfaceLeaf[] = [
${projection.leaves.map(renderLeaf).join(",\n")}
];

/** The root program's own options, encoded exactly as a leaf's \`flags\` are. */
export const CLI_GLOBAL_OPTIONS: readonly string[] = [
${projection.globals.map((flag) => `  ${JSON.stringify(flag)}`).join(",\n")}
];
`;
}
