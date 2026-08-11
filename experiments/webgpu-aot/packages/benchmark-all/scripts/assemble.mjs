import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  controlledBuildDirectory,
  outputDirectory,
  overviewDirectory,
  representativeBuildDirectory,
} from "./paths.mjs";

export async function assembleReport({
  controlled = controlledBuildDirectory,
  output = outputDirectory,
  overview = overviewDirectory,
  representative = representativeBuildDirectory,
} = {}) {
  await rm(output, { force: true, recursive: true });
  await cp(overview, output, { recursive: true });
  await mkdir(output, { recursive: true });
  await Promise.all([
    cp(representative, path.join(output, "representative"), { recursive: true }),
    cp(controlled, path.join(output, "controlled"), { recursive: true }),
  ]);
}
