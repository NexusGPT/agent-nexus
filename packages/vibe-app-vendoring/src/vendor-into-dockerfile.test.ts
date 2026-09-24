import { describe, expect, it } from "vitest";

import { VENDOR_COPY_LINE, vendorIntoDockerfile } from "./vendor-into-dockerfile";

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

function dockerfile(...lines: readonly string[]): string {
  return lines.join("\n");
}

const MANIFEST_COPY = "COPY package.json package-lock.json ./";

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
