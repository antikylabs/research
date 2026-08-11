#!/usr/bin/env node

import { runAll } from "./commands.mjs";
import { parseRunAllArguments } from "./workflow.mjs";

function usage() {
  return `Usage: npm run benchmark:all -- [options]

Runs the representative, byte-identical null, and real Three.js architecture
campaigns sequentially and assembles one multipage report site.

  --headed      show Chrome during captures
`;
}

async function main() {
  const options = parseRunAllArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  await runAll(options);
  console.log("\nBenchmark site ready. Launch it with: npm run report:all");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
