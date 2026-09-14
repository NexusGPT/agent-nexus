/**
 * THE SWEEP JUDGES A DOCUMENT BY STDOUT, AND ITS CREDENTIAL SCAN DEPENDS ON IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG, AND WHY THE SEVERE HALF IS THE SILENT ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both sweeps concatenated a leaf's stdout and stderr and asked whether the
 * RESULT was JSON. The CLI never promised that: its epilogue promises "ONE JSON
 * document on STDOUT and nothing else", and three shipped features write to
 * stderr on a run where nothing is wrong — the response-contract warning (on by
 * default), the retry notice, and the deprecation notice. None is gated on
 * `--json`, each says so at its own declaration.
 *
 * The VISIBLE half was a false verdict: `document get` reported `FAILED — exit=0
 * but the response is not JSON` about a response that is JSON, because
 * `GET /documents/:documentId` publishes `size` as `number | null` and the
 * server sends a decimal string (`Document.size` is Prisma `BigInt?`, and
 * `main.ts` installs `BigInt.prototype.toJSON`). That API drift is real and is
 * owned elsewhere — NEX-4123 — and the warning reporting it is the CLI working.
 *
 * 🔴 THE SILENT HALF IS THE ONE THAT MATTERS. `scan-response.py` parses before
 * it walks: `scan()` returns `1, []` the instant `json.loads` fails, so
 * `findings()` — the credential walk the whole gate exists for — never runs on a
 * body that did not parse. Merging stderr therefore did not extend the secret
 * scan to stderr; it DISABLED the secret scan over stdout. One byte of
 * commentary blinded it to the entire response body.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW THIS WAS PROVEN, INCLUDING THE HALF THIS FILE CANNOT RUN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The arms below drive the real scanner, so the security claim is measured
 * rather than described. The END-TO-END proof is a stub binary rather than the
 * network, and it is not in this suite because it spawns the whole harness; it
 * is reproducible in one command from `packages/cli`, with a stub `nexus` that
 * prints a JSON document on stdout and a warning on stderr for one leaf:
 *
 *     NEXUS_BIN="node <stub>" NOISY_LEAF="document get" tsx scripts/id-thread-sweep.ts
 *
 * Measured 2026-09-09, the same stub, only `splitLeafOutput` changing:
 *
 *   body = stdout            REACHED  document get  json ok, 1 id(s) threaded · 160 bytes on stderr
 *                            exit 0
 *   body = stdout + stderr   FAILED   document get  exit=0 but the response is not JSON
 *                            exit 1
 *
 * The second row is the CI failure on promotion #5678, verbatim.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { splitLeafOutput } from "./id-graph.streams";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNER = join(PACKAGE_ROOT, "scripts", "scan-response.py");
const ID_THREAD = join(PACKAGE_ROOT, "scripts", "id-thread-sweep.ts");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const SEED = join(PACKAGE_ROOT, "scripts", "seed-sweep-fixtures.sh");

/** Run the real scanner over one payload. */
function scan(payload: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("python3", [SCANNER], { input: payload, encoding: "utf8" });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? -1, stdout: failure.stdout ?? "" };
  }
}

/**
 * A file with its comments removed.
 *
 * ⚠️ The wiring arms below match SOURCE, and a source match is satisfied by a
 * comment by default — `sweep-never-leaks-a-secret.test.ts` records a mutation
 * that survived for exactly that reason, because the script named the file it
 * had stopped calling. This file's own headers discuss `body` and `transcript`
 * at length, so an unstripped match here would be vacuous by construction.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return (
        t !== "" &&
        !t.startsWith("*") &&
        !t.startsWith("//") &&
        !t.startsWith("#") &&
        !t.startsWith("/*")
      );
    })
    .join("\n");
}

/** The real shape: a v1 payload the CLI printed, plus the warning it raised about it. */
const DOCUMENT = JSON.stringify({ id: "d1", name: "n", size: "85" }, null, 2) + "\n";
const COMMENTARY =
  "⚠ the server answered GET /documents/:documentId with a shape the API does not publish\n" +
  "  size: the route publishes null | number and the payload holds string\n";

describe("splitLeafOutput — which stream is the document", () => {
  it("hands back stdout ALONE as the body", () => {
    const split = splitLeafOutput({ stdout: DOCUMENT, stderr: COMMENTARY });
    // `toBe`, never `toContain`: a containment assertion is satisfied by the
    // merged text, which is the exact mutant this arm exists to kill.
    expect(split.body).toBe(DOCUMENT);
    expect(split.body).not.toContain("does not publish");
  });

  it("hands back BOTH streams as the transcript, because a refusal lives on stderr", () => {
    const split = splitLeafOutput({ stdout: DOCUMENT, stderr: COMMENTARY });
    expect(split.transcript).toBe(DOCUMENT + COMMENTARY);
  });

  it("counts the commentary in bytes, and reports zero when there was none", () => {
    expect(splitLeafOutput({ stdout: DOCUMENT, stderr: COMMENTARY }).diagnosticBytes).toBe(
      Buffer.byteLength(COMMENTARY, "utf8")
    );
    // The control. A counter that never returns 0 would decorate every row.
    expect(splitLeafOutput({ stdout: DOCUMENT, stderr: "" }).diagnosticBytes).toBe(0);
  });

  it("treats absent streams as empty rather than throwing", () => {
    const split = splitLeafOutput({ stdout: null, stderr: undefined });
    expect(split.body).toBe("");
    expect(split.transcript).toBe("");
    expect(split.diagnosticBytes).toBe(0);
  });
});

describe("the credential scan survives commentary — the reason for the split", () => {
  it("finds a secret in the body, and CANNOT find it in the transcript", () => {
    // The same response, twice, differing only in what it is concatenated with.
    const leaking = JSON.stringify({ id: "d1", pushToken: "a".repeat(40) }, null, 2) + "\n";
    const split = splitLeafOutput({ stdout: leaking, stderr: COMMENTARY });

    const onBody = scan(split.body);
    expect(onBody.code).toBe(2);
    expect(onBody.stdout).toContain("pushToken");
    expect(onBody.stdout).not.toContain("a".repeat(40));

    // 🔴 THE WHOLE FINDING. Not "a weaker verdict" — the credential is never
    // looked for, because `scan()` returns before `findings()` runs.
    const onTranscript = scan(split.transcript);
    expect(onTranscript.code).toBe(1);
    expect(onTranscript.stdout.trim()).toBe("NOT-JSON");

    // CONTROL — the miss is caused by the commentary and by nothing else about
    // this payload. With stderr empty the transcript catches it too.
    const quiet = splitLeafOutput({ stdout: leaking, stderr: "" });
    expect(scan(quiet.transcript).code).toBe(2);
  });

  it("reads a healthy response as JSON on the body while the transcript says NOT-JSON", () => {
    const split = splitLeafOutput({ stdout: DOCUMENT, stderr: COMMENTARY });
    expect(scan(split.body).code).toBe(0);
    expect(scan(split.transcript).code).toBe(1);
  });
});

describe("both sweeps are WIRED to the body — an unwired split reads exactly like a fixed one", () => {
  it("id-thread-sweep scans the BODY and diagnoses a refusal from the TRANSCRIPT", () => {
    const source = code(ID_THREAD);
    expect(source).toContain("scan(res.body)");
    expect(source).not.toContain("scan(res.transcript)");
    // The non-zero path genuinely needs stderr; losing it would turn every
    // client-side refusal into an unrecognised failure.
    expect(source).toContain("fromExitCode(leaf.path, res.code, res.transcript)");
  });

  it("id-thread-sweep stores the BODY as a producer's rows", () => {
    // A producer body poisoned by commentary does not merely fail itself:
    // `bodyOf` is shared, so every consumer of that producer reports
    // SKIPPED_NO_ID — "returned zero rows" — about a list this run actually held.
    const source = code(ID_THREAD);
    expect(source).toContain("bodyOf.set(producer, res.body)");
    expect(source).toContain("rowsFrom(res.body)");
    expect(source).not.toContain("bodyOf.set(producer, res.out)");
  });

  it("sweep.sh captures stderr to its own file rather than folding it into stdout", () => {
    const source = code(SWEEP);
    // The invocation must not merge. `2>&1` on this line is the whole defect.
    const invocation = source.split("\n").find((l) => l.includes("$path --json"));
    expect(invocation).toBeDefined();
    expect(invocation).not.toContain("2>&1");
    expect(invocation).toContain('2>"$errfile"');
    // And the scan must be handed stdout, while the refusal matcher gets both.
    expect(source).toContain('printf \'%s\' "$out" | python3 "$SCRIPT_DIR/scan-response.py"');
    expect(source).toContain('is_policy_refusal "$transcript"');
  });

  it("seed-sweep-fixtures.sh splits too, because it asks emptiness with the SAME instrument", () => {
    // 🚨 THIS ARM WAS ADDED BECAUSE ITS MUTANT SURVIVED. Folding the seeder's
    // streams back was scored against the whole neighbouring suite and NOTHING
    // went red — the seeder's invariant ("the emptiness question is asked with
    // the same instrument the sweep uses, so 'seeded' and 'the sweep is
    // satisfied' cannot drift apart") was prose with no gate under it.
    //
    // The drift it permits is not cosmetic and is not loud: the sweep would
    // report a leaf's rows while the seeder read the same leaf as `empty` and
    // wrote fixtures over it, because one byte of stderr makes
    // `scan-response.py --require-non-empty` answer NOT-JSON. Two tools, one
    // leaf, opposite answers, and a write on the strength of the wrong one.
    const source = code(SEED);
    const invocation = source.split("\n").find((l) => l.includes("nx $leaf --json"));
    expect(invocation).toBeDefined();
    expect(invocation).not.toContain("2>&1");
    expect(invocation).toContain('2>"$errfile"');
    // The emptiness probe gets stdout; the refusal matcher gets both.
    expect(source).toContain(
      'printf \'%s\' "$out" | python3 "$SCRIPT_DIR/scan-response.py" --require-non-empty'
    );
    expect(source).toContain('is_policy_refusal "$transcript"');
  });
});
