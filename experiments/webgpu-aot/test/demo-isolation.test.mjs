import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const demos = [
  "demo-brometal",
  "demo-typegpu",
  "demo-typegpu-antiky",
  "demo-wesl",
  "demo-threejs",
];

test("the obsolete shared renderer package does not exist", async () => {
  const packages = await readdir(path.join(workspace, "packages"));
  assert.equal(
    packages.includes("sponza-workload"),
    false,
    "packages/sponza-workload still exposes a shared renderer boundary",
  );
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(entryPath);
      }
      return /\.(?:ts|wesl|wgsl)$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

for (const demo of demos) {
  test(`${demo} owns its runtime and render implementation`, async () => {
    const directory = path.join(workspace, "packages", demo);
    const packageJson = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
    assert.equal(
      packageJson.dependencies?.["@webgpu-aot/sponza-workload"],
      undefined,
      `${demo} still depends on the shared renderer package`,
    );

    const imports = [];
    for (const file of await sourceFiles(path.join(directory, "src"))) {
      const source = await readFile(file, "utf8");
      if (source.includes("@webgpu-aot/sponza-workload")) {
        imports.push(path.relative(directory, file));
      }
    }
    assert.deepEqual(
      imports,
      [],
      `${demo} imports shared renderer/runtime code from ${imports.join(", ")}`,
    );
  });

  test(`${demo} exposes renderer-owned loading progress`, async () => {
    const html = await readFile(
      path.join(workspace, "packages", demo, "index.html"),
      "utf8",
    );
    assert.match(html, /class="loading-card"/);
    assert.match(html, /<progress\s+id="load-progress"/);
    assert.match(html, /id="load-percent"/);
    assert.ok(
      (html.match(/data-load-bit/g) ?? []).length >= 8,
      `${demo} does not expose segmented loading progress`,
    );
  });
}
