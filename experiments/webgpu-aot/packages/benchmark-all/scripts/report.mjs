#!/usr/bin/env node

import { launchReport } from "./commands.mjs";
import { parseReportArguments } from "./workflow.mjs";

async function main() {
  const options = parseReportArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: npm run report:all -- [--port=N]");
    return;
  }
  await launchReport(options);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
