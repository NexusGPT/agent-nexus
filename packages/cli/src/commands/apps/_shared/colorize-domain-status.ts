import { color } from "../../../output";
import { formatUnlistedWord } from "./format-unlisted-word";

/**
 * Colour a custom domain's status: serving green, broken red, on its way
 * yellow. A value this CLI does not know prints as the server's word, marked as
 * newer than this CLI, so a status a newer platform adds never vanishes.
 */
export function colorizeDomainStatus(status: string): string {
  if (status === "ACTIVE") return color.green(status);
  if (status === "FAILED") return color.red(status);
  if (status === "PENDING_DNS" || status === "ISSUING_CERT") return color.yellow(status);
  return formatUnlistedWord(status, "status");
}
