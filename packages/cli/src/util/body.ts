/**
 * `--body` — resolving it, reading fields out of it, and handing it to the SDK.
 *
 * The PUBLIC NAME for the family. Every import in the package names this path,
 * and the three leaves behind it are the three jobs:
 *
 *  - `body.resolve.ts`    — turning a raw `--body` flag value into an object,
 *                           once per distinct value, because stdin is readable
 *                           exactly once.
 *  - `body.input-json.ts` — the same for `--input`-style flags, which accept
 *                           arrays and scalars that `--body` does not.
 *  - `body.fields.ts`     — reading one field back out, with the flag winning
 *                           over the body, and the one assertion that turns
 *                           operator JSON into a typed SDK argument.
 *
 * Nothing is declared here: each value lives in the leaf that owns it and no
 * leaf imports this file back, so `import/no-cycle` has nothing to report.
 */

export {
  asRequestBody,
  CLEAR_TOKEN,
  mergeBodyWithFlags,
  readClearableFlag,
  readString,
  readStringField
} from "./body.fields";
export { resolveInputJson } from "./body.input-json";
export { resetResolvedBodies, resolveBody, resolveRequiredBody } from "./body.resolve";
