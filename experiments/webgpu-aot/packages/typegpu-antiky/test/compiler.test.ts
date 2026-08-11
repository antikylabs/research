import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compileShader } from "../src/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = fileURLToPath(
  new URL("./fixtures/triangle.shader.ts", import.meta.url),
);
const mismatchedBindingFixturePath = fileURLToPath(
  new URL("./fixtures/mismatched-binding.shader.ts", import.meta.url),
);
const textureFixturePath = fileURLToPath(
  new URL("./fixtures/texture.shader.ts", import.meta.url),
);
const computeFixturePath = fileURLToPath(
  new URL("./fixtures/compute.shader.ts", import.meta.url),
);
const invalidComputeVisibilityFixturePath = fileURLToPath(
  new URL("./fixtures/invalid-compute-visibility.shader.ts", import.meta.url),
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeOutputDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "typegpu-antiky-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("compileShader", () => {
  it("resolves a TypeGPU shader into deterministic runtime-only artifacts", async () => {
    const firstOutput = await makeOutputDirectory();
    const secondOutput = await makeOutputDirectory();

    const first = await compileShader({ input: fixturePath, outDir: firstOutput });
    const second = await compileShader({ input: fixturePath, outDir: secondOutput });

    const firstWgsl = await readFile(first.wgslPath, "utf8");
    const secondWgsl = await readFile(second.wgslPath, "utf8");
    const firstGeneratedModule = await readFile(first.modulePath, "utf8");
    const secondGeneratedModule = await readFile(second.modulePath, "utf8");

    expect(firstWgsl).toBe(secondWgsl);
    expect(firstWgsl).toMatch(/@vertex\s+fn vertexMain\b/);
    expect(firstWgsl).toMatch(/@fragment\s+fn fragmentMain\b/);
    expect(firstWgsl).toMatch(/@group\(0\)\s+@binding\(0\)/);
    expect(first.artifact.bindGroups).toEqual([
      {
        group: 0,
        entries: [
          {
            name: "tint",
            binding: 0,
            visibility: ["fragment"],
            buffer: { type: "uniform", minBindingSize: 16 },
          },
        ],
      },
    ]);
    expect(first.artifact.kind).toBe("render");
    if (first.artifact.kind !== "render") {
      throw new Error("Triangle fixture did not produce a render artifact");
    }
    expect(first.artifact.pipeline).toEqual({
      vertexBuffers: [],
      primitive: { topology: "triangle-list" },
      targets: [{ format: "rgba8unorm" }],
    });
    expect(firstGeneratedModule).toBe(secondGeneratedModule);
    expect(firstGeneratedModule).toContain("export const shader =");
    expect(firstGeneratedModule).not.toMatch(/from ["']typegpu["']/);
    expect(second.artifact).toEqual(first.artifact);
  });

  it("rejects static binding metadata that differs from resolved WGSL", async () => {
    const output = await makeOutputDirectory();

    await expect(
      compileShader({ input: mismatchedBindingFixturePath, outDir: output }),
    ).rejects.toThrow("Static metadata declares unused binding 0:1");
  });

  it("preserves sampled-texture metadata for thin WebGPU runtimes", async () => {
    const output = await makeOutputDirectory();
    const result = await compileShader({
      input: textureFixturePath,
      outDir: output,
    });

    expect(result.artifact.wgsl).toMatch(
      /@group\(0\)\s+@binding\(0\)\s+var sampler_\d*: sampler/,
    );
    expect(result.artifact.wgsl).toMatch(
      /@group\(0\)\s+@binding\(1\)\s+var source: texture_2d<f32>/,
    );
    expect(result.artifact.bindGroups[0]?.entries[0]).toEqual({
      name: "sampler",
      binding: 0,
      visibility: ["fragment"],
      sampler: { type: "filtering" },
    });
    expect(result.artifact.bindGroups[0]?.entries[1]).toEqual({
      name: "source",
      binding: 1,
      visibility: ["fragment"],
      texture: { sampleType: "float", viewDimension: "2d" },
    });
  });

  it("resolves one compute entry point with static storage-texture metadata", async () => {
    const firstOutput = await makeOutputDirectory();
    const secondOutput = await makeOutputDirectory();

    const first = await compileShader({
      input: computeFixturePath,
      outDir: firstOutput,
    });
    const second = await compileShader({
      input: computeFixturePath,
      outDir: secondOutput,
    });

    expect(first.artifact).toEqual(second.artifact);
    expect(first.artifact.kind).toBe("compute");
    expect(first.artifact.entryPoints).toEqual({ compute: "computeMain" });
    expect(first.artifact).not.toHaveProperty("pipeline");
    expect(first.artifact.wgsl).toMatch(
      /@compute\s+@workgroup_size\(8, 8, 1\)\s+fn computeMain\b/,
    );
    expect(first.artifact.bindGroups).toEqual([
      {
        group: 0,
        entries: [
          {
            name: "source",
            binding: 0,
            visibility: ["compute"],
            texture: { sampleType: "float", viewDimension: "cube" },
          },
          {
            name: "sampler",
            binding: 1,
            visibility: ["compute"],
            sampler: { type: "filtering" },
          },
          {
            name: "output",
            binding: 2,
            visibility: ["compute"],
            storageTexture: {
              access: "write-only",
              format: "rgba16float",
              viewDimension: "2d-array",
            },
          },
        ],
      },
    ]);
    expect(await readFile(first.modulePath, "utf8")).not.toMatch(
      /from ["']typegpu["']/,
    );
  });

  it("rejects compute bindings that are invisible to the compute stage", async () => {
    const output = await makeOutputDirectory();

    await expect(
      compileShader({
        input: invalidComputeVisibilityFixturePath,
        outDir: output,
      }),
    ).rejects.toThrow(
      "Compute binding output visibility must contain only the compute stage",
    );
  });
});
