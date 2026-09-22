import { color } from "../../../output";

/**
 * Colour a custom domain's status: serving green, broken red, on its way
 * yellow. A value this CLI does not know passes through plain, so a status a
 * newer platform adds still prints rather than vanishing.
 */
export function colorizeDomainStatus(status: string): string {
  if (status === "ACTIVE") return color.green(status);
  if (status === "FAILED") return color.red(status);
  if (status === "PENDING_DNS" || status === "ISSUING_CERT") return color.yellow(status);
  return status;
}
