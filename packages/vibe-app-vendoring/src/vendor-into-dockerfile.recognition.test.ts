import { describe, expect, it } from "vitest";

import { VENDOR_COPY_LINE, vendorIntoDockerfile } from "./vendor-into-dockerfile";
import { dockerfile, MANIFEST_COPY } from "./vendor-into-dockerfile.test-support";

describe("install commands this recognises", () => {
  // A LITERAL table, deliberately, and deliberately NOT wrapped in
  // `eachOrRefuse`. That helper guards a table DISCOVERED at run time, where a
  // broken selector empties the population and vitest reports zero tests as a
  // pass — its own docblock says "a population written out by hand cannot
  // empty". Over these eight literals it protects nothing, and reaching for it
  // would put `@nexus/types` in this package's dependency list, which is the one
  // thing it must not have: the CLI bundles what this package imports.
  const spellings = [
    "RUN npm ci",
    "RUN npm ci --omit=dev",
    "RUN npm install",
    "RUN npm i --production",
    "RUN yarn install --frozen-lockfile",
    "RUN pnpm install --frozen-lockfile",
    "RUN pnpm i",
    "RUN bun install"
  ] as const;

  it.each(spellings)("%s", (install) => {
    expect(
      vendorIntoDockerfile(dockerfile("FROM node:20", "COPY package.json ./", install))
    ).toEqual(expect.objectContaining({ insertions: 1, installsNothing: false }));
  });

  // The control: a RUN that is not an install must NOT be patched, or the
  // arms above are satisfied by a rule that matches every RUN there is.
  it("CONTROL: does not treat an arbitrary RUN as an install", () => {
    const input = dockerfile("FROM node:20", "COPY package.json ./", "RUN echo npm-ci-is-not-here");
    expect(vendorIntoDockerfile(input).insertions).toBe(0);
  });

  it("CONTROL: reports a file of arbitrary RUNs as installing nothing", () => {
    const input = dockerfile("FROM node:20", "RUN apk add --no-cache curl");
    expect(vendorIntoDockerfile(input).installsNothing).toBe(true);
  });
});

describe("a copy that reads another STAGE rather than the build context", () => {
  // 🔴 `--from` is the one flag that changes what a COPY MEANS. `COPY --from=x . /app`
  // reads stage `x`'s filesystem, so it cannot be what brings the build CONTEXT's
  // `vendor/` in — but it is spelled exactly like a whole-context copy. Reading it
  // as coverage marks the stage done, skips the insertion, and the image build
  // fails on a missing tarball: on the server, after the push, with the local
  // install having worked perfectly. Found by bugbot on #6206.
  //
  // One arm per `it`: a failing assertion aborts the rest of its block, and a
  // single mutant here moves both the count and the emitted text.
  const build = (copy: string): string =>
    dockerfile("FROM node:20 AS assets", "RUN echo build", "", "FROM node:20", copy, "RUN npm ci");

  it("does NOT count `COPY --from=… . …` as bringing vendor/ in", () => {
    expect(vendorIntoDockerfile(build("COPY --from=assets . /app")).insertions).toBe(1);
  });

  it("puts the copy before the install of the stage that only read another stage", () => {
    expect(vendorIntoDockerfile(build("COPY --from=assets . /app")).content).toBe(
      dockerfile(
        "FROM node:20 AS assets",
        "RUN echo build",
        "",
        "FROM node:20",
        "COPY --from=assets . /app",
        VENDOR_COPY_LINE,
        "RUN npm ci"
      )
    );
  });

  it("does NOT count `COPY --from=… vendor/ …` either — that stage's vendor/ is not ours to assume", () => {
    expect(vendorIntoDockerfile(build("COPY --from=assets vendor/ ./vendor/")).insertions).toBe(1);
  });

  it("reports the stage as uncovered rather than already covered", () => {
    expect(vendorIntoDockerfile(build("COPY --from=assets . /app")).alreadyCovered).toBe(0);
  });

  // The CONTROL, and it is the arm that stops the fix over-correcting: without
  // it, refusing EVERY copy that carries any flag would satisfy all four arms
  // above while re-patching Dockerfiles that are genuinely already covered.
  it("CONTROL: a flagged copy WITHOUT --from still counts as coverage", () => {
    expect(vendorIntoDockerfile(build("COPY --chown=node:node . /app")).insertions).toBe(0);
  });

  it("CONTROL: a bare whole-context copy still counts as coverage", () => {
    expect(vendorIntoDockerfile(build("COPY . /app")).insertions).toBe(0);
  });
});

describe("a Dockerfile written in lowercase", () => {
  // Dockerfile INSTRUCTIONS are case-insensitive — `run npm ci` is as valid as
  // `RUN npm ci`, and shouting them is only a convention. Matching uppercase
  // alone failed in the direction that is hardest to notice: the file reported
  // `installsNothing`, got no insertion, and its owner was handed a warning
  // about a file this could simply have patched.
  //
  // One arm per `it`: one mutant moves the count, the flag AND the text.
  const lower = dockerfile("from node:20", "copy package.json ./", "run npm ci");

  it("recognises the install", () => {
    expect(vendorIntoDockerfile(lower).installsNothing).toBe(false);
  });

  it("patches it", () => {
    expect(vendorIntoDockerfile(lower).insertions).toBe(1);
  });

  it("puts the copy in the right place, keeping the file's own casing", () => {
    expect(vendorIntoDockerfile(lower).content).toBe(
      dockerfile("from node:20", "copy package.json ./", VENDOR_COPY_LINE, "run npm ci")
    );
  });

  it("reads a lowercase whole-context copy as coverage", () => {
    expect(
      vendorIntoDockerfile(dockerfile("from node:20", "copy . /app", "run npm ci")).insertions
    ).toBe(0);
  });

  it("reads a lowercase --from copy as NOT coverage", () => {
    const input = dockerfile(
      "from node:20 as a",
      "run x",
      "",
      "from node:20",
      "copy --from=a . /app",
      "run npm ci"
    );

    expect(vendorIntoDockerfile(input).insertions).toBe(1);
  });

  // The CONTROL: casing must not become the only thing that matters. An
  // uppercase file is still handled, so a mutant that swapped the patterns to
  // lowercase-only rather than case-INSENSITIVE is caught here.
  it("CONTROL: the uppercase spelling still works", () => {
    expect(
      vendorIntoDockerfile(dockerfile("FROM node:20", MANIFEST_COPY, "RUN npm ci")).insertions
    ).toBe(1);
  });
});
