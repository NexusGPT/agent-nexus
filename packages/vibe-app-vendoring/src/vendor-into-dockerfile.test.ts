import { describe, expect, it } from "vitest";

import { VENDOR_COPY_LINE, vendorIntoDockerfile } from "./vendor-into-dockerfile";
import { dockerfile, MANIFEST_COPY } from "./vendor-into-dockerfile.test-support";

/**
 * This is the half that does NOT fail on the developer's machine: `npm install`
 * in the app directory resolves `file:vendor/…` whatever the Dockerfile says,
 * so a missing `COPY` surfaces on the first server-side build, after the change
 * has been pushed.
 *
 * Where the property is "the file now reads exactly like this" the assertion is
 * the whole output string, not a `toContain`. A substring arm over a document
 * is satisfied by any line that happens to carry the words — and a Dockerfile
 * patcher's whole job is WHERE a line goes, which a `toContain` cannot see.
 */

describe("a single-stage build that copies its manifests then installs", () => {
  const input = dockerfile(
    "FROM node:20-alpine",
    "WORKDIR /app",
    MANIFEST_COPY,
    "RUN npm ci",
    "COPY . .",
    'CMD ["node", "server.js"]'
  );

  it("inserts the copy immediately before the install, and changes nothing else", () => {
    expect(vendorIntoDockerfile(input).content).toBe(
      dockerfile(
        "FROM node:20-alpine",
        "WORKDIR /app",
        MANIFEST_COPY,
        "COPY vendor/ ./vendor/",
        "RUN npm ci",
        "COPY . .",
        'CMD ["node", "server.js"]'
      )
    );
  });

  it("counts the insertion", () => {
    expect(vendorIntoDockerfile(input).insertions).toBe(1);
  });

  it("does not report the stage as already covered", () => {
    expect(vendorIntoDockerfile(input).alreadyCovered).toBe(0);
  });

  it("does not report the file as installing nothing", () => {
    expect(vendorIntoDockerfile(input).installsNothing).toBe(false);
  });
});

describe("running it a second time over its own output", () => {
  const once = vendorIntoDockerfile(
    dockerfile("FROM node:20", MANIFEST_COPY, "RUN npm ci")
  ).content;
  const twice = vendorIntoDockerfile(once);

  it("changes nothing", () => {
    expect(twice.content).toBe(once);
  });

  it("inserts nothing", () => {
    expect(twice.insertions).toBe(0);
  });

  it("reports the stage as already covered", () => {
    expect(twice.alreadyCovered).toBe(1);
  });
});

describe("the other spellings of copying the manifests", () => {
  // `COPY package*.json ./` is the spelling the shipped predecessor's regex
  // missed: it anchored on the literal manifest names.
  it("handles a glob", () => {
    expect(
      vendorIntoDockerfile(dockerfile("FROM node:20", "COPY package*.json ./", "RUN npm ci"))
        .content
    ).toBe(dockerfile("FROM node:20", "COPY package*.json ./", VENDOR_COPY_LINE, "RUN npm ci"));
  });

  it("handles two separate COPY lines", () => {
    expect(
      vendorIntoDockerfile(
        dockerfile(
          "FROM node:20",
          "COPY package.json ./",
          "COPY package-lock.json ./",
          "RUN npm ci"
        )
      ).content
    ).toBe(
      dockerfile(
        "FROM node:20",
        "COPY package.json ./",
        "COPY package-lock.json ./",
        VENDOR_COPY_LINE,
        "RUN npm ci"
      )
    );
  });
});

describe("a stage that already has vendor/ in the image", () => {
  const wholeContext = dockerfile("FROM node:20", "COPY . .", "RUN npm ci");
  const namesVendor = dockerfile(
    "FROM node:20",
    "COPY package.json ./",
    "COPY vendor/ ./vendor/",
    "RUN npm ci"
  );

  it("is left alone when it copies the whole build context", () => {
    expect(vendorIntoDockerfile(wholeContext).content).toBe(wholeContext);
  });

  it("inserts nothing when it copies the whole build context", () => {
    expect(vendorIntoDockerfile(wholeContext).insertions).toBe(0);
  });

  it("is left alone when a copy names vendor itself", () => {
    expect(vendorIntoDockerfile(namesVendor).content).toBe(namesVendor);
  });

  it("inserts nothing when a copy names vendor itself", () => {
    expect(vendorIntoDockerfile(namesVendor).insertions).toBe(0);
  });
});
