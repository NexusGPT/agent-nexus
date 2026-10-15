import path from "node:path";

import ts from "typescript";

import { createScanProgram, scanSourceFiles } from "../../util/scan-program";
import { NARROWING_PRINTERS, type PrinterCallSite, type PrinterExemption } from "./call-site";
import { keysReachingTheDocument } from "./document-keys";
import { insideEnvelopeCallback } from "./envelope-callback";
import { enclosingBody, resolveAccess } from "./expressions";
import { humanOnly } from "./json-mode";
import { defaultScanRoot, type EnvelopeNarrowing } from "./narrowing";

/**
 * Every call to a narrowing printer in the tree, classified.
 *
 * One walk answers both questions — which sites narrow, and which sites exist —
 * because a type-checked walk of this package costs seconds and because two
 * walks could drift into two opinions about what a printer call is.
 */
export function scanPrinterCallSites(root = defaultScanRoot()): PrinterCallSite[] {
  const fileNames = scanSourceFiles(root);
  const program = createScanProgram(fileNames);
  const checker = program.getTypeChecker();
  const sites: PrinterCallSite[] = [];

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    if (!fileNames.includes(path.normalize(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);

      if (!ts.isCallExpression(node)) return;
      if (!ts.isIdentifier(node.expression)) return;
      if (!NARROWING_PRINTERS.has(node.expression.text)) return;

      const file = path.relative(root, source.fileName);
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const printer = node.expression.text;
      const exempt = (reason: PrinterExemption): void => {
        sites.push({ file, line, printer, narrowing: null, exempt: reason });
      };

      if (node.arguments.length === 0) return exempt("no-payload-argument");

      // A printer under `!isJsonMode()` writes no document, so it cannot drop a
      // field from one. Neither does one inside a `printEnvelope` callback.
      if (humanOnly(node)) return exempt("human-only");
      if (insideEnvelopeCallback(node)) return exempt("inside-envelope");

      const access = resolveAccess(node.arguments[0], checker);
      if (access === null || !ts.isIdentifier(access.expression)) {
        return exempt("payload-is-not-a-response-key");
      }

      const responseName = access.expression.text;
      const declared = checker
        .getTypeAtLocation(access.expression)
        .getProperties()
        .map((symbol) => symbol.getName());

      // One key is the whole response; narrowing it loses nothing.
      if (declared.length < 2) return exempt("single-key-response");

      const reached = keysReachingTheDocument(enclosingBody(node), responseName);
      if (reached === "all") return exempt("whole-response-reaches-the-document");

      const lost = declared.filter((key) => !reached.has(key)).sort();
      if (lost.length === 0) return exempt("every-key-reaches-the-document");

      sites.push({
        file,
        line,
        printer,
        narrowing: { file, line, printer, source: responseName, taken: access.name.text, lost },
        exempt: null
      });
    };

    visit(source);
  }

  return sites.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

/** Every place a printer is handed one key of a multi-key response. */
export function scanEnvelopeNarrowing(root = defaultScanRoot()): EnvelopeNarrowing[] {
  return narrowingsIn(scanPrinterCallSites(root));
}

/** The reported narrowings among a set of classified call sites. */
export function narrowingsIn(sites: readonly PrinterCallSite[]): EnvelopeNarrowing[] {
  return sites
    .map((site) => site.narrowing)
    .filter((narrowing): narrowing is EnvelopeNarrowing => narrowing !== null);
}
