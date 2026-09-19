import { color } from "../../../output";

export function colorApprovalStatus(status: string): string {
  if (status === "APPROVED") return color.green(status);
  if (status === "REJECTED" || status === "EXPIRED") return color.red(status);
  return color.yellow(status); // PENDING
}
