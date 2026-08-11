#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = path.resolve(packageDirectory, "../..");
const require = createRequire(import.meta.url);

export const LIBRARY_PAYLOAD_DEFINITIONS = Object.freeze([
  {
    entryLabel: "brometal",
    id: "brometal",
    name: "BroMetal",
    packageJson: "brometal/package.json",
    runtime: true,
    specifier: "brometal",
  },
  {
    entryLabel: "typegpu",
    id: "typegpu",
    name: "TypeGPU",
    packageJson: "typegpu/package.json",
    runtime: true,
    specifier: "typegpu",
  },
  {
    entryLabel: null,
    id: "typegpu-antiky",
    name: "TypeGPU-Antiky",
    packageJson: path.join(repositoryDirectory, "packages/typegpu-antiky/package.json"),
    runtime: false,
    specifier: null,
  },
  {
    entryLabel: null,
    id: "wesl",
    name: "WESL",
    packageJson: "wesl/package.json",
    runtime: false,
    specifier: null,
  },
  {
    entryLabel: "three/webgpu",
    id: "threejs",
    name: "Three.js WebGPU",
    packageJson: "three/package.json",
    runtime: true,
    specifier: "three/webgpu",
  },
]);

export async function measureLibraryEntry({ build: buildEntry = build, entryPoint }) {
  const result = await buildEntry({
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    legalComments: "none",
    minify: true,
    platform: "browser",
    treeShaking: true,
    write: false,
  });
  if (result.outputFiles?.length !== 1) {
    throw new Error(`Expected one bundled output for ${entryPoint}`);
  }
  const contents = result.outputFiles[0].contents;
  return {
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
    minifiedBytes: contents.byteLength,
  };
}

export function resolvePackageEntry(specifier) {
  return fileURLToPath(import.meta.resolve(specifier));
}

export function resolvePackageJson(packageJson) {
  if (path.isAbsolute(packageJson)) return packageJson;
  try {
    return require.resolve(packageJson);
  } catch {
    const packageName = packageJson.startsWith("@")
      ? packageJson.split("/").slice(0, 2).join("/")
      : packageJson.split("/")[0];
    const entry = fileURLToPath(import.meta.resolve(packageName));
    let directory = path.dirname(entry);
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, "package.json");
      try {
        if (JSON.parse(readFileSync(candidate, "utf8")).name === packageName) return candidate;
      } catch {}
      directory = path.dirname(directory);
    }
    throw new Error(`Could not resolve ${packageJson}`);
  }
}

async function readPackageVersion(packageJson) {
  const manifest = JSON.parse(await readFile(resolvePackageJson(packageJson), "utf8"));
  return manifest.version;
}

async function measurePackageDirectory(directory) {
  let bytes = 0;
  let fileCount = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await measurePackageDirectory(entryPath);
      bytes += nested.bytes;
      fileCount += nested.fileCount;
    } else if (entry.isFile()) {
      bytes += (await stat(entryPath)).size;
      fileCount += 1;
    }
  }
  return { bytes, fileCount };
}

async function resolveInstalledDependencyPackageJson(name, parentPackageJson) {
  let directory = path.dirname(parentPackageJson);
  while (true) {
    const candidate = path.join(directory, "node_modules", ...name.split("/"), "package.json");
    try {
      return await realpath(candidate);
    } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

export async function measureInstalledPackageFootprint(packageJson) {
  const rootPackageJson = await realpath(resolvePackageJson(packageJson));
  const rootDirectory = path.dirname(rootPackageJson);
  const own = await measurePackageDirectory(rootDirectory);
  const visited = new Set();
  let installedBytes = 0;
  let installedFileCount = 0;

  async function visit(manifestPath, optional = false) {
    const resolvedManifest = await realpath(manifestPath);
    if (visited.has(resolvedManifest)) return;
    visited.add(resolvedManifest);
    const manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
    const measured = await measurePackageDirectory(path.dirname(resolvedManifest));
    installedBytes += measured.bytes;
    installedFileCount += measured.fileCount;
    const requiredDependencies = Object.keys(manifest.dependencies ?? {});
    const optionalDependencies = Object.keys(manifest.optionalDependencies ?? {});
    for (const dependency of [...requiredDependencies, ...optionalDependencies]) {
      const resolvedDependency = await resolveInstalledDependencyPackageJson(dependency, resolvedManifest);
      if (resolvedDependency === null) {
        if (optional || optionalDependencies.includes(dependency)) continue;
        throw new Error(`Could not resolve installed dependency ${dependency} from ${resolvedManifest}`);
      }
      await visit(resolvedDependency, optionalDependencies.includes(dependency));
    }
  }

  await visit(rootPackageJson);
  return {
    dependencyCount: visited.size - 1,
    installedBytes,
    installedFileCount,
    packageBytes: own.bytes,
    packageFileCount: own.fileCount,
  };
}

export async function buildLibraryPayloadManifest() {
  return Promise.all(LIBRARY_PAYLOAD_DEFINITIONS.map(async (definition) => {
    const footprint = await measureInstalledPackageFootprint(definition.packageJson);
    const version = await readPackageVersion(definition.packageJson);
    if (!definition.runtime) {
      return { ...definition, entry: null, gzipBytes: 0, minifiedBytes: 0, ...footprint, version };
    }
    const entryPoint = resolvePackageEntry(definition.specifier);
    const measured = await measureLibraryEntry({ entryPoint });
    return { ...definition, entry: definition.entryLabel, ...measured, ...footprint, version };
  })).then((entries) => entries.map(({ entryLabel: _entryLabel, packageJson: _packageJson, specifier: _specifier, ...entry }) => entry));
}

export function generatedModule(payloads) {
  return `// Generated by scripts/library-payloads.mjs. Do not edit by hand.\nexport const LIBRARY_PAYLOADS = ${JSON.stringify(payloads, null, 2)} as const;\n`;
}

async function main() {
  const output = path.join(packageDirectory, "src/generated/library-payloads.ts");
  await mkdir(path.dirname(output), { recursive: true });
  const payloads = await buildLibraryPayloadManifest();
  await writeFile(output, generatedModule(payloads), "utf8");
  for (const payload of payloads) {
    const value = payload.runtime ? `${payload.gzipBytes} gzip bytes` : "no browser runtime";
    console.log(`${payload.name} ${payload.version}: ${value}; ${payload.packageBytes} package bytes; ${payload.installedBytes} installed bytes`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
