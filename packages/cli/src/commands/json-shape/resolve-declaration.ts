import { type DeclarationSite, shortName, type SourceIndex } from "./module-index";

/**
 * Which DECLARATION does a call written in `file` actually reach?
 *
 * The file's own declarations win, then its own imports. 🚨 A NAME THAT IS
 * NEITHER IS UNRESOLVED, AND THE EDGE IS DROPPED RATHER THAN GUESSED — falling
 * back to a tree-wide lookup would reinstate the exact collision this index
 * exists to remove, and it would do it only on the names most likely to collide.
 *
 * `transport.send` in a file that neither declares nor imports `send` therefore
 * ends the walk, which is the correct reading: nothing syntactic here knows what
 * `transport` is.
 */
export function resolveDeclaration(
  index: SourceIndex,
  file: string,
  call: string
): DeclarationSite | null {
  const module = index.get(file);
  if (module === undefined) return null;

  const parts = call.split(".");

  if (parts.length > 1) {
    const namespaceFile = module.namespaces.get(parts[0]);
    if (namespaceFile !== undefined && index.get(namespaceFile)?.calls.has(parts[1]) === true) {
      return { file: namespaceFile, name: parts[1] };
    }
  }

  for (const candidate of parts.length > 1 ? [call, shortName(call)] : [call]) {
    if (module.calls.has(candidate)) return { file, name: candidate };

    const imported = module.imports.get(candidate);
    if (imported !== undefined && index.get(imported.file)?.calls.has(imported.name) === true) {
      return imported;
    }
  }

  return null;
}
