import { credentialHelperArgs } from "./credential-helper-args";

/** `git` argv for the clone. `credentialPath` is self-generated, never user input. */
export function buildCloneArgs(
  credentialPath: string,
  cloneUrl: string,
  directory: string,
  branch: string | undefined
): string[] {
  const args = [...credentialHelperArgs(credentialPath), "clone"];
  if (branch) args.push("--branch", branch);
  args.push("--", cloneUrl, directory);
  return args;
}
