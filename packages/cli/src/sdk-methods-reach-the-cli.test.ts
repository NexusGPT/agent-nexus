/**
 * THE GATE between an SDK resource method and a command that can reach it.
 *
 * A Public API v1 endpoint arrives here in three steps — backend route, SDK
 * method, CLI command — and the third step is the one nothing checks. The first
 * two are typed against each other and guarded by
 * `packages/sdk/src/resources/multipart-routes-have-an-sdk-method.test.ts` and
 * `types-match-the-v1-contract.test.ts`. The third is a hand-written
 * `commander` registration that no type ever demands, so a feature can ship
 * complete on the server, complete in the SDK, and be unreachable from the
 * terminal — with `tsc`, ESLint and every suite green.
 *
 * `GET /public/v1/tickets/across-organizations` shipped that way and sat
 * unreachable for weeks. Its whole purpose is finding a ticket filed under
 * another organization before filing a duplicate, and the surface that files
 * tickets is this CLI, so the missing flag was the entire feature. Nobody
 * noticed, because the CLI kept answering `ticket list` perfectly — with one
 * organization's rows.
 *
 * ## Shape: an allowlist that has to shrink
 *
 * Every public method on every SDK resource must be CALLED somewhere in this
 * package's source, or be named in {@link SDK_METHODS_WITHOUT_A_CLI_COMMAND}
 * with the reason. Adding an SDK method and no command therefore fails until
 * someone writes down which of the two it is — a deliberate omission or the
 * defect above.
 *
 * The allowlist is checked in BOTH directions. An entry naming a method that no
 * longer exists, or one that has since gained a command, fails too: an
 * exemption list nobody prunes silently grows into a list of everything.
 *
 * ## It scans text, and that bounds what it can prove
 *
 * A name-based scan proves a call site exists somewhere in `src/`. It cannot
 * prove the call is reachable from a command, and two resources sharing a
 * method name (`list`, `get`, `create`) cover for each other. So this catches
 * the DISTINCTLY-NAMED method with no caller at all — which is exactly the
 * shape that shipped — and claims nothing beyond it.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripTsComments } from "./util/strip-ts-comments";

const CLI_SRC = path.resolve(__dirname);
const SDK_RESOURCES = path.resolve(__dirname, "../../sdk/src/resources");

/**
 * SDK methods with no CLI caller, on purpose. Each line says WHY, because
 * "unexposed" and "forgotten" look identical from here.
 */
const SDK_METHODS_WITHOUT_A_CLI_COMMAND: Record<string, string> = {
  // The v1 channels resource carries phone-number methods that the dedicated
  // `phoneNumbers` resource also carries; `nexus phone-number` drives that one.
  "channels.searchAvailablePhoneNumbers": "duplicated by phoneNumbers.searchAvailable",
  "channels.buyPhoneNumber": "duplicated by phoneNumbers.buy",
  "channels.listPhoneNumbers": "duplicated by phoneNumbers.list",
  "channels.getPhoneNumber": "duplicated by phoneNumbers.get",
  // Reading one connection by id: `nexus channel list-connections` covers the
  // discovery case, and nothing in the CLI takes a connection id yet.
  "channels.getConnection": "no command takes a connection id",
  // Typed shorthands over `cloudImports.import()`, which the CLI does call with
  // the provider as an argument.
  "cloudImports.importGoogleDrive": "provider shorthand for cloudImports.import",
  "cloudImports.importSharePoint": "provider shorthand for cloudImports.import",
  "cloudImports.importNotion": "provider shorthand for cloudImports.import",
  // `nexus auth orgs` predates this method and reads the endpoint through its
  // own fetch, because it must run before a NexusClient is built.
  "me.organizations": "auth orgs calls the endpoint directly, pre-client",
  // Workspace file browsing has no command group yet.
  "workspaces.listFiles": "no workspace file browsing command",
  "workspaces.getFileUrl": "no workspace file browsing command",
  // Dataset upload for an evaluation session has no command yet (NEX-2961).
  "evaluations.uploadDataset": "no evaluation dataset command",
  // The skills CATALOG re-reads workflows and tasks the CLI already lists
  // through their own resources (`nexus workflow list`, `nexus task list`).
  // `nexus skills` is a different thing entirely — it installs skill bundles.
  "skills.listWorkflows": "duplicated by workflows.list",
  "skills.getWorkflow": "duplicated by workflows.get",
  // A blocking client-side poll loop over pollStatus. `nexus tool
  // poll-handshake` exposes the single-shot call, so the CLI never blocks.
  "toolConnection.waitForConnection": "CLI exposes the single-shot pollStatus",
  // The workflows resource repeats three execution reads that the dedicated
  // workflowExecutions resource also carries; `nexus execution` drives that one.
  "workflows.getExecutionStatus": "duplicated by workflowExecutions.get",
  "workflows.getNodeExecutionResult": "duplicated by workflowExecutions.getNodeResult",
  "workflows.stopExecution": "duplicated by workflowExecutions.cancel"
};

const isScannableCliFile = (file: string): boolean =>
  file.endsWith(".ts") && !file.includes(".generated.") && !file.endsWith(".test.ts");

const walk = (dir: string, keep: (file: string) => boolean): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, keep);
    return keep(full) ? [full] : [];
  });

/**
 * A public instance method, at class-body indentation. `private` / `protected`
 * members do not match: the optional `async` cannot absorb the modifier, so the
 * name capture runs into a space where it needs `(` or `<`.
 */
const PUBLIC_METHOD = /^ {2}(?:async )?([a-z][A-Za-z0-9]*)\s*[(<]/gm;

/** Resource name (`tickets`) → its public method names. */
function readSdkResourceMethods(): Map<string, string[]> {
  const files = walk(SDK_RESOURCES, (file) => file.endsWith(".ts") && !file.includes(".test."));
  const byResource = new Map<string, string[]>();
  for (const file of files) {
    const source = stripTsComments(fs.readFileSync(file, "utf-8"));
    const names = [...source.matchAll(PUBLIC_METHOD)]
      .map(([, name]) => name)
      .filter((name) => name !== "constructor");
    if (names.length > 0) {
      byResource.set(toResourceName(path.basename(file, ".ts")), [...new Set(names)]);
    }
  }
  return byResource;
}

/** `cloud-imports.ts` → `cloudImports`, matching the client's property name. */
function toResourceName(fileName: string): string {
  return fileName.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Every `.someMethod(` this package's non-test source calls. */
function readCliCallSites(): Set<string> {
  const called = new Set<string>();
  for (const file of walk(CLI_SRC, isScannableCliFile)) {
    const source = stripTsComments(fs.readFileSync(file, "utf-8"));
    for (const [, name] of source.matchAll(/\.([a-z][A-Za-z0-9]*)\s*\(/g)) called.add(name);
  }
  return called;
}

describe("every SDK resource method reaches the CLI", () => {
  it("has a caller for each SDK method, or a written reason it has none", () => {
    const called = readCliCallSites();
    const unreachable: string[] = [];

    for (const [resource, methods] of readSdkResourceMethods()) {
      for (const method of methods) {
        const qualified = `${resource}.${method}`;
        if (called.has(method)) continue;
        if (qualified in SDK_METHODS_WITHOUT_A_CLI_COMMAND) continue;
        unreachable.push(qualified);
      }
    }

    expect(
      unreachable.sort(),
      "These SDK methods have no caller anywhere in the CLI, so the endpoint behind each is " +
        "unreachable from the terminal. REMEDY: add the command or flag that calls it — or, if " +
        "it is deliberately unexposed, add it to SDK_METHODS_WITHOUT_A_CLI_COMMAND with the " +
        "reason. Do not delete this assertion: a shipped-but-unreachable endpoint is the defect " +
        "it exists to catch."
    ).toEqual([]);
  });

  it("keeps the exemption list honest — every entry names a real, still-unexposed method", () => {
    const called = readCliCallSites();
    const methodsByResource = readSdkResourceMethods();

    const stale = Object.keys(SDK_METHODS_WITHOUT_A_CLI_COMMAND).filter((qualified) => {
      const [resource, method] = qualified.split(".");
      const exists = methodsByResource.get(resource)?.includes(method) ?? false;
      return !exists || called.has(method);
    });

    expect(
      stale.sort(),
      "Each of these exemptions is no longer true — the method was renamed or removed, or it " +
        "now has a CLI caller. REMEDY: delete the entry. An exemption list nobody prunes grows " +
        "into a list of everything and the gate above stops gating."
    ).toEqual([]);
  });

  it("CONTROL: the scan reads the SDK's real resource tree", () => {
    const methodsByResource = readSdkResourceMethods();
    const total = [...methodsByResource.values()].reduce((sum, names) => sum + names.length, 0);

    expect(
      methodsByResource.size,
      "Far fewer resources than the SDK ships. The walk is not reaching the tree, so an empty " +
        "result above would mean nothing."
    ).toBeGreaterThan(20);
    expect(
      total,
      "Far fewer methods than the SDK ships. The method regex is broken, and a broken scan " +
        "satisfies the assertion above vacuously."
    ).toBeGreaterThan(200);
  });

  it("CONTROL: the scan finds the method this gate was written for", () => {
    // Cross-org ticket listing is the worked example: it existed in the SDK
    // with no CLI flag. Both halves must be visible to this scan, or the gate
    // cannot see the very case that motivated it.
    expect(
      readSdkResourceMethods().get("tickets") ?? [],
      "The tickets resource did not parse. Check PUBLIC_METHOD against its current shape."
    ).toContain("listAcrossOrganizations");
    expect(
      readCliCallSites().has("listAcrossOrganizations"),
      "`nexus ticket list --all-orgs` no longer calls listAcrossOrganizations. The cross-org " +
        "search is gone and single-org results are silently back."
    ).toBe(true);
  });

  it("CONTROL: a private method is not counted as public surface", () => {
    // The gate would demand a CLI caller for internals otherwise, and the
    // pressure to relieve that is to widen the exemption list until it exempts
    // everything.
    const names = [
      ...`  private async hidden(): Promise<void> {}\n  async shown(): Promise<void> {}\n`.matchAll(
        PUBLIC_METHOD
      )
    ].map(([, name]) => name);

    expect(names, "The method regex is matching modifiers or private members.").toEqual(["shown"]);
  });
});
