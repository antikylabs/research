import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

describe("standard TypeGPU demo production build", () => {
  it("ships its runtime-resolved renderer and pinned scene", async () => {
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

    expect(runtime).toContain("TypeGPU runtime");
    expect(runtime).toContain(
      "Cannot create tgpu.lazy objects during shader resolution.",
    );
    expect(runtime).toContain("forwardVertex");
    expect(runtime).toContain("updateLights");
    expect(runtime).toContain("bloomFragment");
    expect(runtime).toContain("reflectionFragment");
    expect(runtime).not.toContain("startSponzaWorkload");
    expect(html).toContain('class="workload-shell"');
    expect(html).toContain('class="workload-status"');
    await expect(
      readFile(join(packageDirectory, "dist/sponza/Sponza.bin")),
    ).resolves.toHaveLength(9_528_220);
  }, 30_000);
});
