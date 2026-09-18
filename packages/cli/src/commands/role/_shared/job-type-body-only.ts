// `create-job-type` and `update-job-type` take the WHOLE job type as one JSON
// document and expose no field flags at all — 15 required fields including a
// `parts[]` array and three expression strings. Both enums are body-only by
// that design rather than by omission.
const JOB_TYPE_IS_ONE_DOCUMENT =
  "the whole job type is supplied as one JSON document through --body; this command has no field flags";

export const JOB_TYPE_BODY_ONLY = {
  "Body.basis": JOB_TYPE_IS_ONE_DOCUMENT,
  "Body.group": JOB_TYPE_IS_ONE_DOCUMENT
};
