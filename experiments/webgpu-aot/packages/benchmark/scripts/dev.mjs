#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createDevWorkflow(arguments_, {
  nodePath,
  npmCliPath,
  scriptDirectory: directory,
}) {
  return [
    {
      arguments: [path.join(directory, "run.mjs"), ...arguments_],
      command: nodePath,
      label: "benchmarks",
    },
    {
      arguments: [npmCliPath, "run", "report"],
      command: nodePath,
      label: "dashboard",
    },
  ];
}

function run({ arguments: arguments_, command, label }) {
  return new Promise((resolve, reject) => {
    console.log(`\nStarting ${label}...`);
    const child = spawn(command, arguments_, { stdio: "inherit" });
    const forwardSignal = (signal) => child.kill(signal);
    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${code ?? signal}`));
    });
  });
}

async function main() {
  const npmCliPath = process.env.npm_execpath;
  if (npmCliPath === undefined) {
    throw new Error("Run this workflow through npm run dev --workspace benchmark");
  }
  const workflow = createDevWorkflow(process.argv.slice(2), {
    nodePath: process.execPath,
    npmCliPath,
    scriptDirectory,
  });
  for (const command of workflow) await run(command);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
