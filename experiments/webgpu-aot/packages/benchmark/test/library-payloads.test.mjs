import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";

import {
  LIBRARY_PAYLOAD_DEFINITIONS,
  measureLibraryEntry,
  measureInstalledPackageFootprint,
  resolvePackageEntry,
  resolvePackageJson,
} from "../scripts/library-payloads.mjs";

test("measures a complete minified browser entry and its gzip payload", async () => {
  const contents = new TextEncoder().encode("export const measured = 42;");
  let receivedOptions;

  const result = await measureLibraryEntry({
    build: async (options) => {
      receivedOptions = options;
      return { outputFiles: [{ contents }] };
    },
    entryPoint: "/packages/example/index.js",
  });

  assert.equal(receivedOptions.bundle, true);
  assert.deepEqual(receivedOptions.entryPoints, ["/packages/example/index.js"]);
  assert.equal(receivedOptions.format, "esm");
  assert.equal(receivedOptions.minify, true);
  assert.equal(receivedOptions.platform, "browser");
  assert.equal(receivedOptions.write, false);
  assert.deepEqual(result, {
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
    minifiedBytes: contents.byteLength,
  });
});

test("distinguishes browser runtime entries from build-time-only authoring systems", () => {
  assert.deepEqual(
    LIBRARY_PAYLOAD_DEFINITIONS.map(({ id, runtime }) => [id, runtime]),
    [
      ["brometal", true],
      ["typegpu", true],
      ["typegpu-antiky", false],
      ["wesl", false],
      ["threejs", true],
    ],
  );
});

test("finds metadata for packages that do not export package.json", () => {
  assert.match(resolvePackageJson("wesl/package.json"), /node_modules\/wesl\/package\.json$/);
});

test("resolves import-only public package entries", () => {
  assert.match(resolvePackageEntry("brometal"), /node_modules\/brometal\/dist\/index\.js$/);
});

test("separates the authoring package from its installed production dependency closure", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "library-footprint-"));
  const packageDirectory = path.join(temporaryDirectory, "node_modules/compiler");
  const dependencyDirectory = path.join(packageDirectory, "node_modules/helper");
  const manifestPath = path.join(packageDirectory, "package.json");
  const dependencyManifestPath = path.join(dependencyDirectory, "package.json");

  try {
    await mkdir(path.join(packageDirectory, "dist"), { recursive: true });
    await mkdir(dependencyDirectory, { recursive: true });
    const manifest = JSON.stringify({ name: "compiler", dependencies: { helper: "1.0.0" }, optionalDependencies: { absent: "1.0.0" } });
    const dependencyManifest = JSON.stringify({ name: "helper", version: "1.0.0" });
    await writeFile(manifestPath, manifest);
    await writeFile(path.join(packageDirectory, "dist/index.js"), "1234567");
    await writeFile(dependencyManifestPath, dependencyManifest);
    await writeFile(path.join(dependencyDirectory, "index.js"), "12345");

    const result = await measureInstalledPackageFootprint(manifestPath);

    assert.deepEqual(result, {
      dependencyCount: 1,
      installedBytes: Buffer.byteLength(manifest) + 7 + Buffer.byteLength(dependencyManifest) + 5,
      installedFileCount: 4,
      packageBytes: Buffer.byteLength(manifest) + 7,
      packageFileCount: 2,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
