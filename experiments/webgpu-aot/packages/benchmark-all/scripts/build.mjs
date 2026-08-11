#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { assembleReport } from "./assemble.mjs";
import { repositoryDirectory } from "./paths.mjs";
import { createReportBuildWorkflow, runWorkflow } from "./workflow.mjs";

export async function buildReport() {
  await runWorkflow(createReportBuildWorkflow(), { cwd: repositoryDirectory });
  await assembleReport();
  console.log("\nAssembled representative and controlled reports into packages/benchmark-all/dist.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildReport().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
