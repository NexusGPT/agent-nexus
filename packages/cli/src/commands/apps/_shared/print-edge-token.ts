import { color, isJsonMode, printRecord } from "../../../output";
import { type VibeEdgeTokenDto } from "../../../vibe-wire-types";

/**
 * Reveal an edge token, and show the request that uses it.
 *
 * The `curl` line is the point of the command rather than a courtesy: the token
 * is useless without knowing which header carries it, and that header name is
 * exactly what NEX-2972 could not find from outside. Printing the two together
 * means a reader never has to guess the pairing.
 */
export function printEdgeToken(edgeToken: VibeEdgeTokenDto, toolResyncRequired?: boolean): void {
  if (isJsonMode()) {
    // Mirror the server's two response shapes exactly: reveal answers
    // `{ edgeToken }`, rotate answers `{ edgeToken, toolResyncRequired }`. The
    // flag is omitted rather than defaulted to false on the reveal path,
    // because reveal changes nothing and so cannot have invalidated a tool —
    // emitting `false` there would answer a question that was never asked.
    console.log(
      JSON.stringify(
        toolResyncRequired === undefined ? { edgeToken } : { edgeToken, toolResyncRequired },
        null,
        2
      )
    );
    return;
  }

  printRecord(edgeToken, [
    { key: "token", label: "Token" },
    { key: "headerName", label: "Header" },
    {
      key: "publicUrl",
      label: "App URL",
      format: (v) => (v === null ? color.dim("— (no canonical URL yet)") : String(v))
    }
  ]);

  if (edgeToken.publicUrl !== null) {
    console.log("");
    console.log(color.dim("Reach the app with:"));
    console.log(`  curl -H '${edgeToken.headerName}: ${edgeToken.token}' ${edgeToken.publicUrl}`);
  }

  console.log("");
  console.log(
    color.yellow("This is a live credential — anyone holding it reaches the app. Do not commit it.")
  );

  // Owned by the printer, not the caller, so the JSON payload and the human
  // warning cannot disagree about whether a tool was just broken. Rotation
  // invalidates the token baked into a registered tool, and that is the one
  // consequence an operator cannot infer from a successful-looking response.
  if (toolResyncRequired === true) {
    console.log(
      color.yellow(
        "This app is registered as a tool. Re-register it — the token it sends is now the old one."
      )
    );
  }
}
