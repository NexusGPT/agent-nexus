import { describe, expect, it } from "vitest";

import { secretFreeEnv, STRIPPED_ENV_KEYS } from "./secret-free-env";

const SHELL: NodeJS.ProcessEnv = {
  PATH: "/opt/homebrew/bin:/usr/local/bin",
  HOME: "/Users/me",
  LANG: "en_US.UTF-8",
  AWS_ACCESS_KEY_ID: "AKIA-static",
  AWS_PROFILE: "work",
  RCLONE_S3_ENDPOINT: "http://minio:9000",
  RCLONE_CONFIG: "/Users/me/.config/rclone/rclone.conf",
  NEXUS_API_KEY: "nx-secret",
  NEXUS_ADMIN_TOKEN: "nx-admin",
  NEXUS_PROFILE: "prod",
  NEXUS_ORGANIZATION_ID: "org_1",
  NEXUS_UNRELATED: "kept"
};

describe("secretFreeEnv — one strip rule for every child of a mount", () => {
  it("drops every AWS_* and RCLONE_* key, the NEXUS selectors and the admin token", () => {
    const env = secretFreeEnv(SHELL);
    for (const key of Object.keys(SHELL).filter((k) => /^(AWS|RCLONE)_/.test(k))) {
      expect(env[key]).toBeUndefined();
    }
    for (const key of STRIPPED_ENV_KEYS) expect(env[key]).toBeUndefined();
  });

  it("keeps everything a child needs to run, and any NEXUS key that is not a selector", () => {
    const env = secretFreeEnv(SHELL);
    expect(env.PATH).toBe(SHELL.PATH);
    expect(env.HOME).toBe(SHELL.HOME);
    expect(env.LANG).toBe(SHELL.LANG);
    expect(env.NEXUS_UNRELATED).toBe("kept");
  });

  it("returns a copy: the caller's environment is untouched", () => {
    const before = { ...SHELL };
    secretFreeEnv(SHELL);
    expect(SHELL).toEqual(before);
  });
});
