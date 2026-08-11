import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

describe("Three.js native Sponza production build", () => {
  it("ships the framework renderer and full scene without the shared raw runtime", async () => {
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

    expect(runtime).toContain("Three.js native");
    expect(runtime).toContain("WebGPURenderer");
    expect(runtime).toContain("Two-cascade native CSM sun");
    expect(runtime).not.toContain("Update Lights Compute PSO");
    expect(runtime).not.toContain("startSponzaWorkload");
    await expect(
      readFile(join(packageDirectory, "dist/sponza/Sponza.bin")),
    ).resolves.toHaveLength(9_528_220);
  }, 30_000);
});
