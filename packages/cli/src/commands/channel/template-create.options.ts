/**
 * The flags `whatsapp-template create` reads, named once.
 *
 * Commander hands an action an index-signature bag, so every field below is a
 * claim rather than a guarantee — naming the shape is what puts the reads under
 * the compiler instead of under a `.` that always typechecks.
 */
export interface TemplateCreateOptions {
  readonly connectionId?: string;
  readonly friendlyName?: string;
  readonly language?: string;
  readonly body?: string;
  readonly bodyFile?: string;
  readonly type?: string;
  readonly variables?: string;
  readonly submit?: boolean;
  readonly category?: string;
}
