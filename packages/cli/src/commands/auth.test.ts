import { describe, expect, it } from "vitest";

import { classifyUseOrgRefusal } from "./auth";

const ORG_SCOPED = "nxs_u_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const PERSONAL = "nxs_p_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const PLATFORM_OPERATOR = "nxs_o_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

/**
 * `use-org` has two refusals and the ORDER between them is the behaviour, so it
 * is what these assert. An org-scoped key that hears "use the
 * NEXUS_ORGANIZATION_ID env var instead" is being pointed at a path the server
 * now refuses outright (`ORG_SCOPED_KEY_ORG_MISMATCH`) instead of quietly
 * answering from the key's own org — see NEX-3175.
 */
describe("classifyUseOrgRefusal", () => {
  it("allows a personal token on a saved profile", () => {
    expect(classifyUseOrgRefusal({ apiKey: PERSONAL, source: "profile" })).toBeNull();
  });

  it("allows a platform-operator token — org-unbound in the same way", () => {
    expect(classifyUseOrgRefusal({ apiKey: PLATFORM_OPERATOR, source: "profile" })).toBeNull();
  });

  it("refuses an org-scoped key", () => {
    expect(classifyUseOrgRefusal({ apiKey: ORG_SCOPED, source: "profile" })).toBe("org-scoped-key");
  });

  it("refuses a personal token under an env override, pointing at the env var", () => {
    expect(classifyUseOrgRefusal({ apiKey: PERSONAL, source: "override" })).toBe("env-override");
  });

  it("reports org-scoped BEFORE env-override when both apply", () => {
    // The precedence case. `env-override` here would advise a workaround that
    // this key cannot use.
    expect(classifyUseOrgRefusal({ apiKey: ORG_SCOPED, source: "override" })).toBe(
      "org-scoped-key"
    );
  });

  it("trusts an explicit personalToken flag over the prefix", () => {
    // A manually-added profile may carry the flag with a non-obvious key string.
    expect(
      classifyUseOrgRefusal({ apiKey: "nxs_custom_key", personalToken: true, source: "profile" })
    ).toBeNull();
  });

  it("falls back to the prefix when the flag is absent", () => {
    // The flag is missing on older configs, so the prefix has to carry it.
    expect(classifyUseOrgRefusal({ apiKey: PERSONAL, source: "profile" })).toBeNull();
    expect(classifyUseOrgRefusal({ apiKey: ORG_SCOPED, source: "profile" })).toBe("org-scoped-key");
  });

  it("does not let personalToken:false override a cross-org prefix", () => {
    // `false` is not "definitely org-scoped" — it is commonly just unset-as-false
    // on a profile written before the flag existed, and the prefix is the
    // authoritative signal.
    expect(
      classifyUseOrgRefusal({ apiKey: PERSONAL, personalToken: false, source: "profile" })
    ).toBeNull();
  });
});
