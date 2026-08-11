import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assembleReport } from "../scripts/assemble.mjs";
import { resolveReportTarget, serveReport } from "../scripts/server.mjs";

test("assembles the overview and both existing report builds", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "benchmark-all-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const overview = path.join(root, "overview");
  const representative = path.join(root, "representative");
  const controlled = path.join(root, "controlled");
  const output = path.join(root, "dist");
  await Promise.all([overview, representative, controlled].map((directory) => mkdir(directory)));
  await writeFile(path.join(overview, "index.html"), "overview");
  await writeFile(path.join(representative, "index.html"), "representative");
  await writeFile(path.join(controlled, "architecture.html"), "architecture");

  await assembleReport({ controlled, output, overview, representative });

  assert.equal(await readFile(path.join(output, "index.html"), "utf8"), "overview");
  assert.equal(await readFile(path.join(output, "representative/index.html"), "utf8"), "representative");
  assert.equal(await readFile(path.join(output, "controlled/architecture.html"), "utf8"), "architecture");
});

test("the report server resolves directory indexes and rejects traversal", () => {
  const root = path.resolve("/tmp/report-root");
  assert.equal(resolveReportTarget(root, "/representative/"), path.join(root, "representative/index.html"));
  assert.equal(resolveReportTarget(root, "/controlled/architecture.html"), path.join(root, "controlled/architecture.html"));
  assert.equal(resolveReportTarget(root, "/../secret"), null);
});

test("the report command fails clearly when benchmark:all has not assembled a site", async () => {
  const root = path.resolve("/tmp/benchmark-all-missing-report");
  await assert.rejects(
    serveReport({ port: 0, root }),
    /Run npm run benchmark:all first/,
  );
});
