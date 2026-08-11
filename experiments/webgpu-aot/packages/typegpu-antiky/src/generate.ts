import type { AotShaderArtifact } from "./types.js";

export function generateModule(artifact: AotShaderArtifact): string {
  const serializedArtifact = JSON.stringify(artifact, null, 2);

  return [
    'import type { AotShaderArtifact } from "typegpu-antiky";',
    "",
    `export const shader = ${serializedArtifact} as const satisfies AotShaderArtifact;`,
    "",
  ].join("\n");
}
