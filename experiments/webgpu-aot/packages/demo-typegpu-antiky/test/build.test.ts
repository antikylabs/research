import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

describe("TypeGPU-Antiky Sponza production build", () => {
  it("ships its complete static render graph without TypeGPU", async () => {
    const shaderNames = [
      "shadow",
      "forward",
      "particles",
      "bloom",
      "ambient",
      "reflection",
      "reflection-reconstruct",
      "reflection-select",
      "temporal",
      "composite",
    ];
    const trackedArtifactPaths = shaderNames.flatMap((name) => [
      join(packageDirectory, `src/generated/${name}.wgsl`),
      join(packageDirectory, `src/generated/${name}.generated.ts`),
    ]);
    const checkedInArtifacts = await Promise.all(
      trackedArtifactPaths.map((path) => readFile(path, "utf8")),
    );

    await execFileAsync("npm", ["run", "build"], { cwd: packageDirectory });

    const rebuiltArtifacts = await Promise.all(
      trackedArtifactPaths.map((path) => readFile(path, "utf8")),
    );
    expect(rebuiltArtifacts).toEqual(checkedInArtifacts);

    const generated = await Promise.all(
      shaderNames.map((name) =>
        readFile(join(packageDirectory, `src/generated/${name}.wgsl`), "utf8"),
      ),
    );
    expect(generated[0]).toMatch(/@vertex\s+fn shadowVertex\b/);
    expect(generated[1]).toMatch(/@fragment\s+fn forwardFragment\b/);
    expect(generated[2]).toMatch(/@vertex\s+fn particleVertex\b/);
    expect(generated[2]).toMatch(/@fragment\s+fn particleFragment\b/);
    expect(generated[3]).toMatch(/@fragment\s+fn bloomFragment\b/);
    expect(generated[4]).toMatch(/@fragment\s+fn ambientFragment\b/);
    expect(generated[5]).toMatch(/@fragment\s+fn reflectionFragment\b/);
    expect(generated[6]).toMatch(/@fragment\s+fn reflectionReconstructFragment\b/);
    expect(generated[7]).toMatch(/@fragment\s+fn reflectionSelectFragment\b/);
    expect(generated[8]).toMatch(/@fragment\s+fn temporalFragment\b/);
    expect(generated[9]).toMatch(/@fragment\s+fn compositeFragment\b/);
    expect(new Set(generated).size).toBe(10);

    const assetsDirectory = join(packageDirectory, "dist/assets");
    const assetNames = await readdir(assetsDirectory);
    const javascriptBundles = await Promise.all(
      assetNames
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(join(assetsDirectory, name), "utf8")),
    );
    const runtime = javascriptBundles.join("\n");
    const html = await readFile(
      join(packageDirectory, "dist/index.html"),
      "utf8",
    );

    expect(runtime).toContain("TypeGPU-Antiky AOT");
    expect(runtime).toContain("forwardFragment");
    expect(runtime).toContain("particleFragment");
    expect(runtime).toContain("bloomFragment");
    expect(runtime).toContain("ambientFragment");
    expect(runtime).toContain("reflectionFragment");
    expect(runtime).toContain("reflectionReconstructFragment");
    expect(runtime).toContain("reflectionSelectFragment");
    expect(runtime).toContain("temporalFragment");
    expect(runtime).toContain("compositeFragment");
    expect(runtime).not.toContain("startSponzaWorkload");
    expect(runtime).not.toContain("resolveWithContext");
    expect(runtime).not.toContain("Cannot create tgpu.lazy objects");
    expect(runtime).not.toContain('"use gpu"');
    expect(html).toContain('class="workload-shell"');
    expect(html).toContain('class="workload-status"');
    await expect(
      readFile(join(packageDirectory, "dist/sponza/Sponza.bin")),
    ).resolves.toHaveLength(9_528_220);
  }, 30_000);
});
