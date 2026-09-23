import fs from "node:fs";
import path from "node:path";

import { resolveBody } from "../../util/body";

/**
 * Resolve the OpenAPI spec string for `update-spec` from --file (raw JSON/YAML
 * text, or '-' for stdin) or --body (a JSON object carrying `openApiSpec`).
 * Returns null when neither is provided.
 */
export async function resolveSpecString(opts: {
  file?: string;
  body?: string;
}): Promise<string | null> {
  if (opts.file) {
    if (opts.file === "-") {
      return fs.readFileSync(0, "utf8");
    }
    const absPath = path.resolve(opts.file);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    return fs.readFileSync(absPath, "utf8");
  }
  if (opts.body) {
    const parsed = await resolveBody(opts.body);
    const spec = parsed?.openApiSpec;
    if (typeof spec !== "string" || spec.length === 0) {
      throw new Error('--body must be a JSON object with a non-empty "openApiSpec" string');
    }
    return spec;
  }
  return null;
}
