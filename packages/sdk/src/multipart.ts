/**
 * Append the file part of a multipart upload, passing the filename ONLY when
 * there is one.
 *
 * `FormData.append(name, blobValue, filename)` declares `filename` OPTIONAL, and
 * WebIDL says an optional argument passed as `undefined` is not provided — so
 * `append(f, file, undefined)` should behave exactly like `append(f, file)`.
 * undici did not implement it that way across most of the range this package
 * supports. It decided by ARITY:
 *
 *   filename = arguments.length === 3 ? webidl.converters.USVString(filename) : undefined
 *
 * With three arguments and `filename === undefined`, that runs
 * `String(undefined)` and sends the literal name `"undefined"` — silently
 * replacing the name a `File` already carried. Node 24 ships the corrected
 * undici (verified there: both forms return the `File`'s own name), but this
 * package declares `engines: >=18`, and Node 18 and 20 do not.
 *
 * **The name is not cosmetic, which is why this is a guard and not a nicety.**
 * `POST /skills/tasks/:taskId/evaluations/:sessionId/dataset` chooses between
 * its JSON and CSV parsers by testing the name for a `.json` suffix and reads no
 * media type at all, and ticket attachments store the name and display it back.
 * So a filename of `"undefined"` changes how a file is PARSED, not merely how it
 * is labelled.
 *
 * Centralised rather than inlined at each call site: there are eight upload
 * methods across the resources, seven of them with an optional `fileName`, and a
 * per-site `if` is seven chances to reintroduce this on the next upload route.
 *
 * @param formData - The form being built.
 * @param field - The form field the file is sent under.
 * @param file - The file, as a `Blob` or `File`.
 * @param fileName - Name to send. Omitted entirely when `undefined`, which lets
 *   a `File` keep its own name and leaves a bare `Blob` to the server default.
 */
export function appendFilePart(
  formData: FormData,
  field: string,
  file: Blob | File,
  fileName?: string
): void {
  if (fileName === undefined) {
    formData.append(field, file);
    return;
  }

  formData.append(field, file, fileName);
}
