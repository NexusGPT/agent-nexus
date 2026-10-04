import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { sourceFiles } from "./json-error-document.enumerate";
import { proseOnlyHelpers } from "./json-error-document.prose-only-helpers";
import type { ProseRefusal, StaticScanReport } from "./json-error-document.report";
import { scanFile } from "./json-error-document.scan-file";

/** Parse one source text the same way the tree is parsed. */
export function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

/**
 * Run the rule over a set of already-parsed sources.
 *
 * Exposed so the gate can run it over SYNTHETIC sources and prove the detector
 * fires — an instrument whose only evidence is its own clean result is the
 * thing this file exists to replace.
 */
export function scanSources(
  sources: readonly { readonly name: string; readonly source: ts.SourceFile }[]
): StaticScanReport {
  const proseHelpers = proseOnlyHelpers(sources);

  const report = { exitSites: 0, exitsThroughEmitter: 0, violations: [] as ProseRefusal[] };
  for (const { name, source } of sources) {
    scanFile(name, source, proseHelpers, report);
  }

  return {
    filesScanned: sources.length,
    exitSites: report.exitSites,
    exitsThroughEmitter: report.exitsThroughEmitter,
    proseHelpers: [...proseHelpers].sort(),
    violations: report.violations
  };
}

/** Run the rule over every scannable file under `root`. */
export function scanTree(root: string): StaticScanReport {
  const files = sourceFiles(root);
  if (files.length === 0) {
    throw new Error("no source files — the walk is broken, not the code");
  }
  return scanSources(
    files.map((file) => ({
      name: path.relative(root, file),
      source: parse(file, fs.readFileSync(file, "utf8"))
    }))
  );
}
