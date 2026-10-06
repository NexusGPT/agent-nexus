import { color } from "../../../output";

/**
 * A value of a server enum this binary does not list, rendered as the server's
 * own word and marked as newer than this CLI.
 *
 * A published binary routinely talks to a backend newer than itself, so a field
 * the contract reads leniently can carry a value no reader here has words for.
 * The word is the only honest rendering: mapping it to the nearest listed value
 * ("private", "inconclusive", "off") is a guess presented as a fact, and a blank
 * reads as "the server said nothing". `noun` names what the value is — a state,
 * a verdict, a visibility — so the reader knows which column learned a word.
 */
export function formatUnlistedWord(word: string, noun: string): string {
  return color.yellow(word) + color.dim(` — a ${noun} this CLI version does not know`);
}
