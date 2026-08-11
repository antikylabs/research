import type {
  AotShaderArtifact,
  AnyShaderDefinition,
  ArtifactKind,
  ShaderStage,
  ShaderMetadata,
} from "./types.js";

const wgslIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertRecord(value: unknown, label: string): asserts value is object {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function assertEntryPoint(value: unknown, stage: ShaderStage): void {
  if (typeof value !== "string" || !wgslIdentifierPattern.test(value)) {
    throw new Error(`${stage} entry point must be a valid WGSL identifier`);
  }
}

function assertBindingResource(entry: object, label: string): void {
  const hasBuffer = "buffer" in entry;
  const hasSampler = "sampler" in entry;
  const hasStorageTexture = "storageTexture" in entry;
  const hasTexture = "texture" in entry;
  if (
    Number(hasBuffer) +
      Number(hasSampler) +
      Number(hasStorageTexture) +
      Number(hasTexture) !==
    1
  ) {
    throw new Error(
      `${label} must declare exactly one buffer, sampler, texture, or storageTexture`,
    );
  }

  const resource = hasBuffer
    ? (entry as { buffer: unknown }).buffer
    : hasSampler
      ? (entry as { sampler: unknown }).sampler
      : hasStorageTexture
        ? (entry as { storageTexture: unknown }).storageTexture
        : (entry as { texture: unknown }).texture;
  const resourceName = hasBuffer
    ? "buffer"
    : hasSampler
      ? "sampler"
      : hasStorageTexture
        ? "storageTexture"
        : "texture";
  assertRecord(resource, `${label}.${resourceName}`);
}

function assertBindingVisibility(
  entry: object,
  kind: ArtifactKind,
  label: string,
): void {
  const visibility = "visibility" in entry ? entry.visibility : undefined;
  const name =
    "name" in entry && typeof entry.name === "string" ? entry.name : label;
  const allowedStages: readonly ShaderStage[] =
    kind === "compute" ? ["compute"] : ["vertex", "fragment"];
  if (
    !Array.isArray(visibility) ||
    visibility.length === 0 ||
    visibility.some((stage) => !allowedStages.includes(stage as ShaderStage))
  ) {
    const allowedLabel =
      kind === "compute" ? "the compute stage" : "vertex and fragment stages";
    const artifactLabel = kind === "compute" ? "Compute" : "Render";
    throw new Error(
      `${artifactLabel} binding ${name} visibility must contain only ${allowedLabel}`,
    );
  }
}

export function validateDefinition(
  value: unknown,
): asserts value is AnyShaderDefinition {
  assertRecord(value, "Shader definition");

  if (!("kind" in value) || (value.kind !== "render" && value.kind !== "compute")) {
    throw new Error(
      "Shader source must default-export defineShader(...) or defineComputeShader(...) result",
    );
  }

  if (value.kind === "render") {
    if (!("vertex" in value) || !("fragment" in value)) {
      throw new Error(
        "Render shader definition must include vertex and fragment functions",
      );
    }
  } else if (!("compute" in value)) {
    throw new Error("Compute shader definition must include a compute function");
  }

  if (!("entryPoints" in value)) {
    throw new Error("Shader definition must include entryPoints");
  }
  assertRecord(value.entryPoints, "entryPoints");
  if (value.kind === "render") {
    assertEntryPoint(
      "vertex" in value.entryPoints ? value.entryPoints.vertex : undefined,
      "vertex",
    );
    assertEntryPoint(
      "fragment" in value.entryPoints ? value.entryPoints.fragment : undefined,
      "fragment",
    );
  } else {
    assertEntryPoint(
      "compute" in value.entryPoints ? value.entryPoints.compute : undefined,
      "compute",
    );
  }

  if (!("bindGroups" in value) || !Array.isArray(value.bindGroups)) {
    throw new Error("Shader definition bindGroups must be an array");
  }

  const groups = new Set<number>();
  for (const [groupIndex, bindGroup] of value.bindGroups.entries()) {
    assertRecord(bindGroup, `bindGroups[${groupIndex}]`);
    const group = "group" in bindGroup ? bindGroup.group : undefined;
    assertNonNegativeInteger(group, `bindGroups[${groupIndex}].group`);
    if (groups.has(group as number)) {
      throw new Error(`Duplicate bind group ${String(group)}`);
    }
    groups.add(group as number);

    if (!("entries" in bindGroup) || !Array.isArray(bindGroup.entries)) {
      throw new Error(`bindGroups[${groupIndex}].entries must be an array`);
    }

    const bindings = new Set<number>();
    for (const [entryIndex, entry] of bindGroup.entries.entries()) {
      assertRecord(entry, `bindGroups[${groupIndex}].entries[${entryIndex}]`);
      const binding = "binding" in entry ? entry.binding : undefined;
      assertNonNegativeInteger(
        binding,
        `bindGroups[${groupIndex}].entries[${entryIndex}].binding`,
      );
      if (bindings.has(binding as number)) {
        throw new Error(
          `Duplicate binding ${String(binding)} in bind group ${String(group)}`,
        );
      }
      bindings.add(binding as number);
      assertBindingResource(
        entry,
        `bindGroups[${groupIndex}].entries[${entryIndex}]`,
      );
      assertBindingVisibility(
        entry,
        value.kind,
        `bindGroups[${groupIndex}].entries[${entryIndex}]`,
      );
    }
  }

  if (value.kind === "render") {
    if (!("pipeline" in value)) {
      throw new Error("Render shader definition must include a static pipeline");
    }
    assertRecord(value.pipeline, "pipeline");
    if (
      !("targets" in value.pipeline) ||
      !Array.isArray(value.pipeline.targets)
    ) {
      throw new Error("pipeline.targets must be an array");
    }
    if (value.pipeline.targets.length === 0) {
      throw new Error("pipeline.targets must contain at least one color target");
    }
  } else if ("pipeline" in value) {
    throw new Error("Compute shader definition must not include a render pipeline");
  }
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bindingKey(group: number, binding: number): string {
  return `${group}:${binding}`;
}

export function validateResolvedWgsl(
  wgsl: string,
  metadata: ShaderMetadata,
): void {
  for (const [stage, entryPoint] of Object.entries(metadata.entryPoints)) {
    const declaration = new RegExp(
      `@${stage}\\b(?:\\s+@[A-Za-z_][A-Za-z0-9_]*(?:\\([^)]*\\))?)*\\s+fn\\s+${escapeRegularExpression(entryPoint)}\\b`,
    );
    if (!declaration.test(wgsl)) {
      throw new Error(
        `Resolved WGSL does not contain ${stage} entry point ${entryPoint}`,
      );
    }
  }

  const declaredBindings = new Set<string>();
  const declarationPattern = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  for (const match of wgsl.matchAll(declarationPattern)) {
    declaredBindings.add(bindingKey(Number(match[1]), Number(match[2])));
  }

  const metadataBindings = new Set<string>();
  for (const bindGroup of metadata.bindGroups) {
    for (const entry of bindGroup.entries) {
      metadataBindings.add(bindingKey(bindGroup.group, entry.binding));
    }
  }

  for (const binding of metadataBindings) {
    if (!declaredBindings.has(binding)) {
      throw new Error(`Static metadata declares unused binding ${binding}`);
    }
  }

  for (const binding of declaredBindings) {
    if (!metadataBindings.has(binding)) {
      throw new Error(`Resolved WGSL contains undeclared binding ${binding}`);
    }
  }
}

export function toArtifact(
  wgsl: string,
  metadata: ShaderMetadata,
): AotShaderArtifact {
  return { wgsl, ...metadata };
}
