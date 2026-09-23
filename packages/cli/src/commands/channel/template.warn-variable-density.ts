import { color } from "../../output";

const VARIABLE_PATTERN = /\{\{\d+\}\}/g;

/**
 * Warn if any text field in the template types has high variable density.
 * Meta rejects templates where variables dominate the content.
 *
 * ⚠️ THIS IS ADVICE, NOT A GATE — it returns whether it warned and the caller
 * creates the template either way. `create`'s own help text says so, because a
 * warning that silently blocked would be the more surprising of the two.
 */
export function warnIfHighVariableDensity(types: Record<string, unknown>): boolean {
  let warned = false;

  function checkField(text: string, fieldLabel: string): void {
    const matches = text.match(VARIABLE_PATTERN) ?? [];
    if (matches.length === 0) return;
    const variableCharsLength = matches.reduce((sum, m) => sum + m.length, 0);
    const staticLength = text.length - variableCharsLength;
    if (staticLength < matches.length * 3) {
      console.warn(
        color.yellow("⚠ Warning:") +
          ` ${fieldLabel} has very high variable density (${staticLength} static chars, ${matches.length} variable(s)).` +
          ` Meta may reject this with "too many variables for its length."`
      );
      warned = true;
    }
  }

  for (const [typeKey, typeValue] of Object.entries(types)) {
    if (!typeValue || typeof typeValue !== "object") continue;
    const tv = typeValue;

    // `in` narrowing rather than a cast: the value is operator-supplied JSON,
    // so every field is genuinely a claim that has to be checked at runtime.
    if ("body" in tv && typeof tv.body === "string") checkField(tv.body, `${typeKey} body`);
    if ("title" in tv && typeof tv.title === "string") checkField(tv.title, `${typeKey} title`);
    if ("subtitle" in tv && typeof tv.subtitle === "string") {
      checkField(tv.subtitle, `${typeKey} subtitle`);
    }

    if ("cards" in tv && Array.isArray(tv.cards)) {
      tv.cards.forEach((card: unknown, i: number) => {
        if (typeof card !== "object" || card === null) return;
        if ("body" in card && typeof card.body === "string") {
          checkField(card.body, `${typeKey} card[${i}] body`);
        }
        if ("title" in card && typeof card.title === "string") {
          checkField(card.title, `${typeKey} card[${i}] title`);
        }
      });
    }
  }

  if (warned) {
    console.warn(
      color.yellow("  Tip:") +
        " Add more descriptive static text around {{N}} placeholders to avoid Meta rejection.\n"
    );
  }

  return warned;
}
