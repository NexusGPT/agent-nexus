import fs from "node:fs";

import { resolveBody } from "../../util/body";
import { resolveUploadPath } from "../../util/upload-file";

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
    return fs.readFileSync(resolveUploadPath(opts.file), "utf8");
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
