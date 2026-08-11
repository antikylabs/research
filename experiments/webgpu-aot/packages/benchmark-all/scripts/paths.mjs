import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const repositoryDirectory = path.resolve(packageDirectory, "../..");
export const outputDirectory = path.join(packageDirectory, "dist");
export const overviewDirectory = path.join(packageDirectory, "public");
export const representativeBuildDirectory = path.join(
  repositoryDirectory,
  "packages/benchmark/dist",
);
export const controlledBuildDirectory = path.join(
  repositoryDirectory,
  "packages/benchmark-controlled/dist",
);
