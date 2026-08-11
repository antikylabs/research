import { buildReport } from "./build.mjs";
import { repositoryDirectory } from "./paths.mjs";
import { serveReport } from "./server.mjs";
import { createBenchmarkWorkflow, runWorkflow } from "./workflow.mjs";

export async function runAll(options, {
  buildReport: build = buildReport,
  cwd = repositoryDirectory,
  runWorkflow: run = runWorkflow,
} = {}) {
  await run(createBenchmarkWorkflow(options), { cwd });
  await build();
}

export async function launchReport(options, {
  serveReport: serve = serveReport,
} = {}) {
  await serve({ port: options.port });
}
