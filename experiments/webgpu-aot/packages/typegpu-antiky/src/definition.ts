import type {
  ComputeShaderDefinition,
  ComputeShaderDefinitionInput,
  ShaderDefinition,
  ShaderDefinitionInput,
} from "./types.js";

export function defineShader<const TDefinition extends ShaderDefinitionInput>(
  definition: TDefinition,
): TDefinition & ShaderDefinition {
  return Object.assign(definition, {
    kind: "render" as const,
  });
}

export function defineComputeShader<
  const TDefinition extends ComputeShaderDefinitionInput,
>(definition: TDefinition): TDefinition & ComputeShaderDefinition {
  return Object.assign(definition, {
    kind: "compute" as const,
  });
}
