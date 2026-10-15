import { Command } from "commander";

import { GENERATED_NAMESPACE_LEDGER } from "../contract-help.ledger";
import { NAMESPACE_REGISTRARS } from "./namespace-registrars";

export interface GeneratedNamespace {
  /** The top-level command name, e.g. `analytics`. */
  readonly namespace: string;
  /** Keys into `ZPublicApiV1`. Sorted by the generator, never by hand. */
  readonly descriptors: readonly string[];
  /** The root registrar that hangs this namespace off a program. */
  readonly register: (program: Command) => void;
}

/**
 * The ledger, with each entry's registrar attached.
 *
 * Anything that BUILDS a namespace reads this. The generator's phase 1 reads
 * `GENERATED_NAMESPACE_LEDGER` instead, because importing THIS module pulls in
 * every command file and therefore every `*.contract.generated.ts` it is about
 * to write.
 */
export const GENERATED_NAMESPACES: readonly GeneratedNamespace[] = GENERATED_NAMESPACE_LEDGER.map(
  (entry) => ({
    namespace: entry.namespace,
    descriptors: entry.descriptors,
    register: NAMESPACE_REGISTRARS[entry.namespace]
  })
);

/**
 * Build one namespace and hand back its top-level command.
 *
 * A fresh `Command` per namespace rather than one shared root: commander mutates
 * the parent on registration, and a shared root would let one namespace's
 * failure read as another's.
 */
export function buildNamespace(entry: GeneratedNamespace): Command {
  const program = new Command();
  program.name("nexus").exitOverride();
  entry.register(program);

  const group = program.commands.find((cmd) => cmd.name() === entry.namespace);
  if (!group) {
    throw new Error(`"${entry.namespace}" registered no command called "${entry.namespace}"`);
  }
  return group;
}
