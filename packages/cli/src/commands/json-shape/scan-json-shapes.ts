import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { commandName, resolveCommandPath } from "../json-shape.command-path";
import { RegistrarPrefixes } from "../json-shape.registrar-prefix";
import { actionBodyOf } from "./action-body";
import { buildIndex } from "./build-index";
import { callsIn } from "./calls";
import { sourceFiles } from "./enumerate";
import { PRINTER_SET, type ShapePrinter } from "./printers";
import { reachedPrinters } from "./reached-printers";
import type { ScannedLeaf } from "./scanned-leaf";
import { reachesSelfJson } from "./self-json";

/** Scan a source tree and classify every `.command()` registration it can resolve. */
export function scanJsonShapes(root: string): ScannedLeaf[] {
  const parsed = sourceFiles(root).map((file) => ({
    file,
    source: ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  }));

  const index = buildIndex(parsed);
  const prefixes = new RegistrarPrefixes(parsed);

  const leaves: ScannedLeaf[] = [];

  for (const { file, source } of parsed) {
    const visit = (node: ts.Node): void => {
      if (commandName(node) !== null) {
        const call = node as ts.CallExpression;
        const resolved = resolveCommandPath(call, source);
        const body = actionBodyOf(call, source);

        if (resolved !== null && body !== null) {
          const own = callsIn(body);
          const printers = [...reachedPrinters(own, file, index)]
            .filter((name): name is ShapePrinter => PRINTER_SET.has(name))
            .sort();

          leaves.push({
            sourceModule: path.basename(file),
            relativePath: [...prefixes.above(call, resolved.base), ...resolved.segments].join(" "),
            printers,
            selfJson: reachesSelfJson(own, file, index, body)
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return leaves;
}
