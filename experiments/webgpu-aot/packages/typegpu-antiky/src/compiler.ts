import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import typegpuPlugin from "unplugin-typegpu/esbuild";

import { generateModule } from "./generate.js";
import type {
  AnyShaderDefinition,
  CompileShaderOptions,
  CompileShaderResult,
  ShaderMetadata,
} from "./types.js";
import {
  toArtifact,
  validateDefinition,
  validateResolvedWgsl,
} from "./validate.js";

interface BundledShaderResult {
  readonly definition: AnyShaderDefinition;
  readonly metadata: ShaderMetadata;
  readonly wgsl: string;
}

function outputBaseName(input: string): string {
  const fileName = basename(input);
  const shaderSuffix = /\.shader\.[cm]?[jt]sx?$/;
  if (shaderSuffix.test(fileName)) {
    return fileName.replace(shaderSuffix, "");
  }
  return basename(fileName, extname(fileName));
}

function buildEntry(inputPath: string): string {
  return `
import tgpu from "typegpu";
import definition from ${JSON.stringify(inputPath)};

const functions = definition.kind === "compute"
  ? [definition.compute]
  : [definition.vertex, definition.fragment];
const { code } = tgpu.resolveWithContext(
  functions,
  { names: "strict" },
);
const { vertex, fragment, compute, ...metadata } = definition;

export default { definition, metadata, wgsl: code };
`;
}

async function resolveShader(inputPath: string): Promise<BundledShaderResult> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "typegpu-antiky-build-"),
  );
  const bundlePath = join(temporaryDirectory, "shader.mjs");

  try {
    await build({
      stdin: {
        contents: buildEntry(inputPath),
        loader: "ts",
        resolveDir: dirname(inputPath),
        sourcefile: "typegpu-antiky-entry.ts",
      },
      bundle: true,
      format: "esm",
      logLevel: "silent",
      outfile: bundlePath,
      platform: "node",
      plugins: [typegpuPlugin()],
      target: "node22",
    });

    const moduleUrl = pathToFileURL(bundlePath).href;
    const loaded = (await import(moduleUrl)) as {
      default?: BundledShaderResult;
    };
    if (loaded.default === undefined) {
      throw new Error("Shader build did not produce a default export");
    }
    return loaded.default;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function compileShader(
  options: CompileShaderOptions,
): Promise<CompileShaderResult> {
  const inputPath = resolve(options.input);
  const outDir = resolve(options.outDir);
  const resolved = await resolveShader(inputPath);

  validateDefinition(resolved.definition);
  validateResolvedWgsl(resolved.wgsl, resolved.metadata);

  const artifact = toArtifact(resolved.wgsl, resolved.metadata);
  const baseName = outputBaseName(inputPath);
  const wgslPath = join(outDir, `${baseName}.wgsl`);
  const modulePath = join(outDir, `${baseName}.generated.ts`);

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(wgslPath, `${artifact.wgsl.trimEnd()}\n`, "utf8"),
    writeFile(modulePath, generateModule(artifact), "utf8"),
  ]);

  return { artifact, wgslPath, modulePath };
}
