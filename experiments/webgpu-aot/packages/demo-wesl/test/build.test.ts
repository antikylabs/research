import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

describe("WESL static Sponza production build", () => {
  it("ships its complete linked render graph without the WESL linker", async () => {
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
    const html = await readFile(
      join(packageDirectory, "dist/index.html"),
      "utf8",
    );

    expect(runtime).toContain("WESL static");
    expect(runtime).toMatch(/@fragment\s+fn depthFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn ambientFragment\b/);
    expect(runtime).not.toMatch(/fn buildAmbient\b|fn blurAmbient\b/);
    expect(runtime).toMatch(/@fragment\s+fn forwardFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn environmentFragment\b/);
    expect(runtime).toMatch(/@compute[\s\S]*fn prefilterSpecular\b/);
    expect(runtime).toMatch(/@compute[\s\S]*fn convolveDiffuse\b/);
    expect(runtime).toMatch(/@compute[\s\S]*fn integrateBrdf\b/);
    expect(runtime).toContain("environmentLighting");
    expect(runtime).toMatch(/@fragment\s+fn particleFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn bloomFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn postFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn reflectionFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn reflectionReconstructFragment\b/);
    expect(runtime).toMatch(/@fragment\s+fn reflectionSelectFragment\b/);
    expect(runtime).toContain("distributionGGX");
    expect(runtime).not.toContain("import package::");
    expect(runtime).not.toContain("WeslParseError");
    expect(runtime).not.toContain("startSponzaWorkload");
    expect(html).toContain('class="workload-shell"');
    expect(html).toContain('class="workload-status"');
    await expect(
      readFile(join(packageDirectory, "dist/sponza/Sponza.bin")),
    ).resolves.toHaveLength(9_528_220);
  }, 30_000);
});
