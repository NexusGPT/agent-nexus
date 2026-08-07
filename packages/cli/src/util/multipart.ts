import fs from "node:fs";
import path from "node:path";

/**
 * The form field every Public API v1 upload route reads its file from.
 *
 * The contract declares it per route as `multipart: { field: "file" }`, and all
 * eight upload routes say `"file"`. That VALUE is reconciled against the
 * contract in `packages/sdk`, which drives each of its upload methods and
 * compares the field name it produced to the descriptor
 * (`multipart-routes-have-an-sdk-method.test.ts`). This package cannot join
 * that reconciliation — it has no `@nexus/types` dependency and is not getting
 * one — so it names the constant here instead of spelling the string inline,
 * and a route that ever chose a different name is a flag on this command
 * rather than a hunt through call sites.
 *
 * multer rejects a file arriving under any other name with `Unexpected field`,
 * a 400 that names the field the CLIENT sent and never the one the server
 * wanted.
 */
export const MULTIPART_FILE_FIELD = "file";

/**
 * The one test that separates a shape `Object.entries` can walk from every JSON
 * value that only looks like one.
 *
 * `resolveBody` types its result as a `Record` but only casts a bare
 * `JSON.parse`, so ANY of the seven JSON shapes reaches its callers wearing the
 * object type. Six are caught by `typeof` and `Array.isArray`. The seventh is
 * `null`, and `typeof null === "object"` — the oldest hole in the language — so
 * a guard written from `typeof` alone lets it straight through to a raw
 * `TypeError` that reads as a CLI bug rather than as bad input.
 *
 * Spelled as a type guard rather than three inline conditions so the narrowing
 * is real: the caller takes `unknown`, and this is the only way to reach the
 * loop.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build the `multipart/form-data` body for `nexus api --file`.
 *
 * The FILE NAME is sent, not just the bytes, and that is load-bearing rather
 * than a nicety: `POST /skills/tasks/:taskId/evaluations/:sessionId/dataset`
 * chooses between its JSON and CSV parsers by testing the name for a `.json`
 * suffix and reads no media type at all, and ticket attachments store the name
 * and show it back. A body sent without one arrives as `blob`.
 *
 * `fields` carries the remaining `--body` keys as ordinary text parts, because
 * a multipart request may hold both — `POST /documents/file` reads
 * `description` and `metadata` beside the file. A string goes verbatim;
 * anything else is JSON-encoded, which is what that route's `metadata` field
 * expects and what the SDK's own `documents.uploadFile` already does.
 *
 * @throws {Error} When the file does not exist, when `--body` is not a JSON
 *   object, or when it would collide with the file part.
 */
export function buildMultipartBody(filePath: string, fields: unknown): FormData {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const form = new FormData();
  form.append(
    MULTIPART_FILE_FIELD,
    new Blob([fs.readFileSync(absolutePath)]),
    path.basename(absolutePath)
  );

  // `--body` was not passed at all. That is not an error — the file is the
  // whole request. `null` IS an error, and is caught below: an explicit flag
  // carrying a nonsense value is a mistake worth naming.
  if (fields === undefined) return form;

  // Refuse by runtime shape, because the declared type is a lie the whole way
  // down (see `isJsonObject`). Silently iterating an array's indices would send
  // parts named "0" and "1".
  if (!isJsonObject(fields)) {
    throw new Error("--body must be a JSON object when --file is used.");
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (key === MULTIPART_FILE_FIELD) {
      throw new Error(
        `--body cannot carry a "${MULTIPART_FILE_FIELD}" key when --file is used — ` +
          `that is the field the uploaded file is sent under.`
      );
    }
    form.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  return form;
}
