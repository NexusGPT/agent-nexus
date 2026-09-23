import { VENDOR_DIRECTORY, vendorIntoDockerfile } from "@nexus/vibe-app-vendoring";

import type { Leg } from "./vendor-plan";

/**
 * Makes the app's image build see `vendor/`, or says why it may not.
 *
 * This is the half that does NOT fail on the developer's machine: `npm install`
 * in the app directory works whatever the Dockerfile says, so a missing `COPY`
 * surfaces on the first server-side build — after the change has been pushed.
 */
export function planDockerfile(dockerfile: string | null): Leg {
  if (dockerfile === null) {
    // A repo with no Dockerfile is built from one the platform GENERATES, and
    // that one copies the manifests it knows about and nothing else.
    return {
      writes: [],
      warnings: [
        "This app has no Dockerfile, so the platform generates one at build time — and a generated " +
          `build copies only the manifests before installing, not \`${VENDOR_DIRECTORY}/\`. ` +
          "Add a Dockerfile that copies it before the install step, or the server-side build will " +
          "fail on a missing file even though the install here succeeds."
      ]
    };
  }
  const outcome = vendorIntoDockerfile(dockerfile);
  return {
    writes:
      outcome.content === dockerfile ? [] : [{ path: "Dockerfile", content: outcome.content }],
    warnings: outcome.installsNothing
      ? [
          "Dockerfile has no recognised dependency-install step, so nothing was added to it. " +
            `If the image installs dependencies some other way, it must copy \`${VENDOR_DIRECTORY}/\` ` +
            "into the build context before that step, or the build will fail on a missing file."
        ]
      : []
  };
}
