/**
 * The setup-step table, named once because TWO paths print it now.
 *
 * The refusal arm and the ready arm render the same columns; a second copy of
 * this array is a second thing to drift, and the two would then disagree about
 * what a reader sees depending on whether the channel is ready.
 */
export const SETUP_STEP_COLUMNS = [
  { key: "step" as const, label: "#", width: 3 },
  { key: "label" as const, label: "STEP", width: 25 },
  { key: "status" as const, label: "STATUS", width: 16 },
  { key: "description" as const, label: "DESCRIPTION", width: 45 }
];
