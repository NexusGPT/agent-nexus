import { describe, expect, it } from "vitest";

import { VENDOR_COPY_LINE, vendorIntoDockerfile } from "./vendor-into-dockerfile";
import { dockerfile, MANIFEST_COPY } from "./vendor-into-dockerfile.test-support";

describe("a multi-stage build", () => {
  const twoInstalls = dockerfile(
    "FROM node:20 AS deps",
    "WORKDIR /app",
    MANIFEST_COPY,
    "RUN npm ci",
    "",
    "FROM node:20 AS runner",
    "WORKDIR /app",
    MANIFEST_COPY,
    "RUN npm ci --omit=dev"
  );

  it("patches every stage that installs", () => {
    expect(vendorIntoDockerfile(twoInstalls).insertions).toBe(2);
  });

  // A COPY in an earlier stage puts files in a DIFFERENT filesystem, so
  // coverage cannot carry across a FROM.
  describe("where the first stage copies the whole context and the second does not", () => {
    const carried = dockerfile(
      "FROM node:20 AS builder",
      "COPY . .",
      "RUN npm ci",
      "RUN npm run build",
      "",
      "FROM node:20 AS runner",
      "WORKDIR /app",
      MANIFEST_COPY,
      "RUN npm ci --omit=dev"
    );
    const outcome = vendorIntoDockerfile(carried);
    const stages = outcome.content.split("FROM node:20 AS runner");

    it("still patches the second stage", () => {
      expect(outcome.insertions).toBe(1);
    });

    it("counts the first stage as already covered", () => {
      expect(outcome.alreadyCovered).toBe(1);
    });

    it("puts the copy in the second stage", () => {
      expect(stages[1]).toContain(VENDOR_COPY_LINE);
    });

    it("leaves the first stage untouched", () => {
      expect(stages[0]).not.toContain(VENDOR_COPY_LINE);
    });
  });
});

describe("an install reached through a line continuation", () => {
  // `RUN apk add curl \` + `  && npm ci` is ONE instruction whose install
  // command is on the second physical line. Reading physical lines both misses
  // the install and — worse — would splice a COPY into the middle of the RUN.
  const input = dockerfile(
    "FROM node:20-alpine",
    MANIFEST_COPY,
    "RUN apk add --no-cache curl \\",
    "  && npm ci",
    'CMD ["node", "server.js"]'
  );
  const outcome = vendorIntoDockerfile(input);

  it("is detected", () => {
    expect(outcome.installsNothing).toBe(false);
  });

  it("is counted", () => {
    expect(outcome.insertions).toBe(1);
  });

  it("gets the copy before the WHOLE RUN, not inside it", () => {
    // Spelled literally rather than through VENDOR_COPY_LINE: an arm written
    // against the constant it is testing moves with it and pins no text.
    expect(outcome.content).toBe(
      dockerfile(
        "FROM node:20-alpine",
        MANIFEST_COPY,
        "COPY vendor/ ./vendor/",
        "RUN apk add --no-cache curl \\",
        "  && npm ci",
        'CMD ["node", "server.js"]'
      )
    );
  });

  it("leaves the RUN a single unbroken instruction", () => {
    // The continuation must still join the two physical lines with nothing
    // between them, or Docker sees a RUN and then a stray `&& npm ci`.
    expect(/RUN apk add --no-cache curl \\\n {2}&& npm ci/.test(outcome.content)).toBe(true);
  });

  it("puts nothing after a continued line", () => {
    const lines = outcome.content.split("\n");
    const inserted = lines.indexOf(VENDOR_COPY_LINE);
    expect(lines[inserted - 1]?.endsWith("\\")).toBe(false);
  });
});

describe("a Dockerfile that installs nothing", () => {
  const input = dockerfile("FROM node:20", "COPY . .", 'CMD ["node", "server.js"]');
  const outcome = vendorIntoDockerfile(input);

  it("says so", () => {
    expect(outcome.installsNothing).toBe(true);
  });

  it("is left byte-for-byte alone", () => {
    expect(outcome.content).toBe(input);
  });
});

describe("indentation", () => {
  it("is copied from the install line onto the inserted copy", () => {
    const outcome = vendorIntoDockerfile(
      dockerfile("FROM node:20", "  COPY package.json ./", "  RUN npm ci")
    );
    expect(outcome.content).toBe(
      dockerfile(
        "FROM node:20",
        "  COPY package.json ./",
        "  COPY vendor/ ./vendor/",
        "  RUN npm ci"
      )
    );
  });
});

describe("two installs in the same stage", () => {
  const input = dockerfile(
    "FROM node:20",
    MANIFEST_COPY,
    "RUN npm ci",
    "RUN npm install --no-save some-tool"
  );

  // One COPY puts vendor/ in that stage's filesystem for every later step.
  it("gets one copy, not one per install", () => {
    expect(vendorIntoDockerfile(input).insertions).toBe(1);
  });

  it("counts the second install as already covered", () => {
    expect(vendorIntoDockerfile(input).alreadyCovered).toBe(1);
  });

  it("puts the copy before the FIRST install", () => {
    expect(vendorIntoDockerfile(input).content).toBe(
      dockerfile(
        "FROM node:20",
        MANIFEST_COPY,
        "COPY vendor/ ./vendor/",
        "RUN npm ci",
        "RUN npm install --no-save some-tool"
      )
    );
  });
});
