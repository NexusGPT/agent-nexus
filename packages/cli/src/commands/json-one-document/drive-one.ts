import { CliArgumentError } from "../../errors";
import { classifyErrorOutcome } from "./classify-error";
import { describeErrorDetail } from "./describe-error-detail";
import { describeStdout } from "./describe-stdout";
import type { DriveDeps } from "./drive-deps";
import type { LeafRun } from "./outcome";
import { preview } from "./preview";
import { runInSandbox } from "./sandbox";

/** A run that never finished. Its own shape, so `driveOne` stays under the cap. */
function budgetExpired(
  key: string,
  leaf: string,
  argv: readonly string[],
  requestsAttempted: number,
  refusedByCommander: boolean
): LeafRun {
  return {
    key,
    leaf,
    argv,
    outcome: "undrivable",
    detail: "did not finish in the budget",
    errorOutcome: "not-an-error",
    errorDetail: "",
    errorCode: undefined,
    requestsAttempted,
    refusedByCommander
  };
}

/** Drive one leaf under `--json` and classify what each stream actually held. */
export async function driveOne(
  key: string,
  leaf: string,
  argv: readonly string[],
  deps: DriveDeps
): Promise<LeafRun> {
  const { stdout, stderr, runExitCode, timedOut, threw } = await runInSandbox(argv, deps);
  const requestsAttempted = deps.requestCount();

  // `CliArgumentError` is what the production installer throws for a refusal at
  // the parse boundary — the class `handleError` itself branches on, so the scan
  // reads the same fact the CLI does rather than sniffing a message.
  const refusedByCommander = threw instanceof CliArgumentError;

  if (timedOut) return budgetExpired(key, leaf, argv, requestsAttempted, refusedByCommander);

  const { documents, prose } = describeStdout(stdout);
  const failed = (runExitCode !== undefined && runExitCode !== 0) || threw !== undefined;

  const { errorOutcome, errorCode, miscodeReason } = classifyErrorOutcome({
    failed,
    documents,
    prose,
    stdout,
    stderr,
    requestsAttempted
  });

  const errorDetail = describeErrorDetail({ errorOutcome, miscodeReason, stdout, stderr });

  const base = {
    key,
    leaf,
    argv,
    errorOutcome,
    errorDetail,
    errorCode,
    requestsAttempted,
    refusedByCommander
  };

  if (documents === 0 && !prose) {
    return { ...base, outcome: "silent", detail: "stdout was empty" };
  }
  if (prose || documents > 1) {
    const cause = prose
      ? documents === 0
        ? "prose on stdout"
        : `${documents} document(s) then prose`
      : `${documents} concatenated documents`;
    return { ...base, outcome: "violation", detail: `${cause}: ${preview(stdout)}` };
  }

  const parsed: unknown = JSON.parse(stdout.trim());
  const isError =
    typeof parsed === "object" && parsed !== null && "error" in (parsed as Record<string, unknown>);
  return {
    ...base,
    outcome: isError ? "error-path" : "clean",
    detail: isError ? preview(stdout) : ""
  };
}
