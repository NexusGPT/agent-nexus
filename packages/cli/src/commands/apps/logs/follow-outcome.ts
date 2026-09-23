/**
 * Why a follow stopped. Every one of these is reported; none of them is silent.
 *
 * `disconnected` is the one that earns its place. A stream that ends without a
 * terminal frame is a dropped connection — a proxy timing out, a laptop lid, a
 * network blip — and it looks EXACTLY like a quiet app whose tail simply
 * finished. Rendering it as a clean end would tell a user their app printed
 * nothing more when the truth is nobody was listening.
 */
export type FollowOutcome =
  | { kind: "upstream-closed" }
  | { kind: "interrupted" }
  | { kind: "stream-error"; message: string }
  | { kind: "disconnected" };
