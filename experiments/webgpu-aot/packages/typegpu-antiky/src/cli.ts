#!/usr/bin/env node

import { compileShader } from "./compiler.js";

const usage =
  "Usage: typegpu-antiky build <shader-file> --out-dir <directory>";

interface BuildArguments {
  readonly input: string;
  readonly outDir: string;
}

function parseBuildArguments(args: readonly string[]): BuildArguments {
  if (args[0] !== "build" || args[1] === undefined) {
    throw new Error(usage);
  }

  const outDirIndex = args.indexOf("--out-dir");
  const outDir = args[outDirIndex + 1];
  if (outDirIndex < 0 || outDir === undefined) {
    throw new Error(usage);
  }

  return { input: args[1], outDir };
}

async function main(): Promise<void> {
  const options = parseBuildArguments(process.argv.slice(2));
  const result = await compileShader(options);

  console.log(`Generated ${result.wgslPath}`);
  console.log(`Generated ${result.modulePath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`typegpu-antiky: ${message}`);
  process.exitCode = 1;
});
