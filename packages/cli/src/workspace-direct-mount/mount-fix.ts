import type { Engine } from "../mount-registry";

/**
 * The mount that reaches ONE copy of a slug on ONE engine — `--shared` is what
 * picks the other copy, and a cache drains only through the engine that wrote it.
 */
export function mountFix(slug: string, shared: boolean, engine: Engine): string {
  return `nexus workspace mount ${slug}${shared ? " --shared" : ""} --engine ${engine}`;
}
