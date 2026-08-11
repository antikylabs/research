import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

describe("BroMetal demo production build", () => {
  it("bundles its static deferred renderer without the compiler", async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: packageDirectory });

    const assetDirectory = join(packageDirectory, "dist/assets");
    const bundles = (await readdir(assetDirectory)).filter((name) =>
      name.endsWith(".js"),
    );
    const runtime = (
      await Promise.all(
        bundles.map((name) => readFile(join(assetDirectory, name), "utf8")),
      )
    ).join("\n");

    expect(runtime).toMatch(/@vertex\s+fn geometryVertex\(/);
    expect(runtime).toMatch(/@vertex\s+fn shadowVertex\(/);
    expect(runtime).toMatch(/@fragment\s+fn lightingFragment\(/);
    expect(runtime).toMatch(/@fragment\s+fn reflectionFragment\(/);
    expect(runtime).toMatch(/@fragment\s+fn particleFragment\(/);
    expect(runtime).toMatch(/@fragment\s+fn bloomFragment\(/);
    expect(runtime).toMatch(/@fragment\s+fn compositeFragment\(/);
    expect(runtime).not.toContain("startSponzaWorkload");
    expect(runtime).not.toContain("Duplicate BroMetal binding");
    expect(runtime).not.toContain("buildArtifact");
    await expect(
      readFile(join(packageDirectory, "dist/sponza/Sponza.bin")),
    ).resolves.toHaveLength(9_528_220);
  }, 30_000);
});
