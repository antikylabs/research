import { spawn } from "node:child_process";

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseRunAllArguments(arguments_) {
  const options = { headed: false, help: false };
  for (const argument of arguments_) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--headed") options.headed = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function parseReportArguments(arguments_) {
  const options = { help: false, port: 4173 };
  for (const argument of arguments_) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument.startsWith("--port=")) {
      options.port = positiveInteger(argument.slice(7), "--port");
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function browserArguments(headed) {
  return headed ? ["--", "--headed"] : [];
}

export function createBenchmarkWorkflow({ headed }) {
  const browser = browserArguments(headed);
  return [
    {
      arguments: ["run", "benchmark", "--workspace", "benchmark", ...browser],
      command: "npm",
      label: "representative renderer campaign",
    },
    {
      arguments: ["run", "benchmark", "--workspace", "benchmark-controlled", ...browser],
      command: "npm",
      label: "byte-identical null campaign",
    },
    {
      arguments: ["run", "benchmark:architecture", "--workspace", "benchmark-controlled", ...browser],
      command: "npm",
      label: "raw WebGPU versus Three.js architecture campaign",
    },
  ];
}

export function createReportBuildWorkflow() {
  return [
    {
      arguments: ["run", "build", "--workspace", "benchmark", "--", "--base=/representative/"],
      command: "npm",
      label: "representative report",
    },
    {
      arguments: ["run", "build", "--workspace", "benchmark-controlled", "--", "--base=/controlled/"],
      command: "npm",
      label: "controlled reports",
    },
  ];
}

function runCommand({ arguments: arguments_, command, label }, cwd, index, total) {
  return new Promise((resolve, reject) => {
    console.log(`\n[${index}/${total}] Starting ${label}...`);
    const child = spawn(command, arguments_, { cwd, stdio: "inherit" });
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

export async function runWorkflow(workflow, { cwd }) {
  for (const [index, entry] of workflow.entries()) {
    await runCommand(entry, cwd, index + 1, workflow.length);
  }
}
