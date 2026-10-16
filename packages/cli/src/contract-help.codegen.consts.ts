import { constNameFor, shapeConstNameFor } from "./contract-help.codegen.names";
import type { ProjectedDescriptor, ProjectedField } from "./contract-help.render";

/**
 * ONE `export const` AT A TIME — the enum consts and the shape consts a
 * generated contract module is made of.
 *
 * Determinism is a property of these two renderers together with their caller:
 * fields are emitted in contract declaration order and nothing here reads the
 * filesystem or iterates an object whose key order it did not establish.
 * `contract-help.codegen.ts` is the public name for this family.
 */

function literal(text: string): string {
  return JSON.stringify(text);
}

export function renderEnumConst(descriptor: ProjectedDescriptor, field: ProjectedField): string {
  const name = constNameFor(descriptor.name, field.path);
  const values = (field.enumValues ?? []).map((value) => `    ${literal(value)}`).join(",\n");
  return `export const ${name} = {
  path: ${literal(`${descriptor.name}.${field.path}`)},
  contractValues: [
${values}
  ]
} as const satisfies ContractEnum;`;
}

export function renderShapeConst(descriptor: ProjectedDescriptor): string {
  const fields = descriptor.fields
    .map((field) => {
      const parts = [
        `path: ${literal(field.path)}`,
        `slot: ${literal(field.slot)}`,
        `type: ${literal(field.type)}`,
        `required: ${field.required}`,
        `depth: ${field.depth}`
      ];
      if (field.enumValues) {
        parts.push(`enumValues: [${field.enumValues.map(literal).join(", ")}]`);
      }
      if (field.opaque) parts.push("opaque: true");
      return `    { ${parts.join(", ")} }`;
    })
    .join(",\n");

  return `export const ${shapeConstNameFor(descriptor.name)} = {
  name: ${literal(descriptor.name)},
  method: ${literal(descriptor.method)},
  route: ${literal(descriptor.route)},
  fields: [
${fields}
  ]
} as const satisfies ProjectedDescriptor;`;
}
