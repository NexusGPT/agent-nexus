import { describe, expect, it } from "vitest";

import { installerEnvFor } from "./installer-env";

const SHELL: NodeJS.ProcessEnv = {
  PATH: "/opt/homebrew/bin:/usr/bin",
  HOME: "/Users/me",
  USER: "me",
  TERM: "xterm-256color",
  LANG: "en_US.UTF-8",
  LC_ALL: "en_US.UTF-8",
  HTTPS_PROXY: "http://proxy.corp:3128",
  all_proxy: "socks5://proxy.corp:1080",
  HOMEBREW_NO_ANALYTICS: "1",
  HOMEBREW_GITHUB_API_TOKEN: "ghp_secret",
  // none of these may reach an installer, and none is on any list — that is the point
  NEXUS_API_KEY: "nx-secret",
  AWS_SECRET_ACCESS_KEY: "static",
  CMUX_CUA_AUTH_TOKEN_FILE: "/tmp/token",
  SSH_AUTH_SOCK: "/tmp/agent.sock",
  SOME_KEY_INVENTED_TOMORROW: "leak?"
};

describe("installerEnvFor — an allow-list: the child gets what it needs and nothing else", () => {
  it("keeps what brew, sudo installer and unzip need to run, prompt, and download behind a proxy", () => {
    const env = installerEnvFor(SHELL);
    expect(env.PATH).toBe(SHELL.PATH);
    expect(env.HOME).toBe(SHELL.HOME);
    expect(env.USER).toBe(SHELL.USER);
    expect(env.TERM).toBe(SHELL.TERM);
    expect(env.LANG).toBe(SHELL.LANG);
    expect(env.LC_ALL).toBe(SHELL.LC_ALL);
    expect(env.HTTPS_PROXY).toBe(SHELL.HTTPS_PROXY);
    expect(env.all_proxy).toBe(SHELL.all_proxy);
    expect(env.HOMEBREW_NO_ANALYTICS).toBe("1");
  });

  it("a brew setting that is itself a credential does not ride the HOMEBREW_ prefix", () => {
    expect(installerEnvFor(SHELL).HOMEBREW_GITHUB_API_TOKEN).toBeUndefined();
  });

  it("drops every name not on the list — secrets known today and any key invented tomorrow", () => {
    const env = installerEnvFor(SHELL);
    for (const key of [
      "NEXUS_API_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "CMUX_CUA_AUTH_TOKEN_FILE",
      "SSH_AUTH_SOCK",
      "SOME_KEY_INVENTED_TOMORROW"
    ]) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("stops brew from auto-updating before the install", () => {
    expect(installerEnvFor({}).HOMEBREW_NO_AUTO_UPDATE).toBe("1");
  });
});
