import { readFileSync } from "node:fs";

/**
 * Resolve the OpenAPI spec string from exactly one of --spec-file / --spec.
 * The endpoint requires a non-empty spec; supplying neither or both is a
 * client-side usage error caught before the request goes out.
 */
export function resolveOpenApiSpec(cmdOpts: { specFile?: string; spec?: string }): string {
  const { specFile, spec } = cmdOpts;
  if (specFile !== undefined && spec !== undefined) {
    throw new Error("Pass exactly one of --spec-file or --spec, not both.");
  }
  if (specFile !== undefined) {
    let contents: string;
    try {
      contents = readFileSync(specFile, "utf8");
    } catch (err) {
      throw new Error(
        `Could not read OpenAPI spec file "${specFile}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (contents.trim().length === 0) {
      throw new Error(`OpenAPI spec file "${specFile}" is empty.`);
    }
    return contents;
  }
  if (spec !== undefined) {
    if (spec.trim().length === 0) throw new Error("--spec must not be empty.");
    return spec;
  }
  throw new Error("Missing OpenAPI spec. Pass --spec-file <path> or --spec <string>.");
}
