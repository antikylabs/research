import type {
  AotComputeShaderArtifact,
  AotRenderShaderArtifact,
  AotShaderArtifact,
  ShaderStage,
  StaticBindGroup,
  StaticBindGroupEntry,
} from "typegpu-antiky";

export interface CompiledArtifact<
  TArtifact extends AotShaderArtifact = AotShaderArtifact,
> {
  readonly artifact: TArtifact;
  readonly layouts: readonly GPUBindGroupLayout[];
  readonly module: GPUShaderModule;
}

function visibility(stages: readonly ShaderStage[]): GPUShaderStageFlags {
  return stages.reduce(
    (flags, stage) => {
      if (stage === "vertex") return flags | GPUShaderStage.VERTEX;
      if (stage === "fragment") return flags | GPUShaderStage.FRAGMENT;
      return flags | GPUShaderStage.COMPUTE;
    },
    0,
  );
}

function layoutEntry(entry: StaticBindGroupEntry): GPUBindGroupLayoutEntry {
  const shared = {
    binding: entry.binding,
    visibility: visibility(entry.visibility),
  };
  if (entry.buffer !== undefined) return { ...shared, buffer: entry.buffer };
  if (entry.texture !== undefined) return { ...shared, texture: entry.texture };
  if (entry.storageTexture !== undefined) {
    return { ...shared, storageTexture: entry.storageTexture };
  }
  return { ...shared, sampler: entry.sampler };
}

function bindGroupAt(artifact: AotShaderArtifact, group: number): StaticBindGroup {
  const definition = artifact.bindGroups.find((candidate) => candidate.group === group);
  if (definition === undefined) {
    throw new Error(`AOT artifact does not define bind group ${group}`);
  }
  return definition;
}

export async function compileArtifact<TArtifact extends AotShaderArtifact>(
  device: GPUDevice,
  label: string,
  artifact: TArtifact,
): Promise<CompiledArtifact<TArtifact>> {
  const module = device.createShaderModule({
    label: `${label} shader module`,
    code: artifact.wgsl,
  });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label} failed static WGSL validation: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
  const highestGroup = Math.max(-1, ...artifact.bindGroups.map(({ group }) => group));
  const layouts = Array.from({ length: highestGroup + 1 }, (_, group) => {
    const definition = bindGroupAt(artifact, group);
    return device.createBindGroupLayout({
      label: `${label} group ${group} AOT layout`,
      entries: definition.entries.map(layoutEntry),
    });
  });
  return { artifact, layouts, module };
}

export function createArtifactBindGroup(
  device: GPUDevice,
  compiled: CompiledArtifact,
  group: number,
  label: string,
  resources: Readonly<Record<string, GPUBindingResource>>,
): GPUBindGroup {
  const definition = bindGroupAt(compiled.artifact, group);
  return device.createBindGroup({
    label,
    layout: compiled.layouts[group],
    entries: definition.entries.map((entry) => {
      const resource = resources[entry.name];
      if (resource === undefined) {
        throw new Error(`${label} is missing the static resource '${entry.name}'`);
      }
      return { binding: entry.binding, resource };
    }),
  });
}

export function createArtifactPipeline(
  device: GPUDevice,
  compiled: CompiledArtifact<AotRenderShaderArtifact>,
  label: string,
  primitive: GPUPrimitiveState = compiled.artifact.pipeline.primitive,
): Promise<GPURenderPipeline> {
  const { artifact, layouts, module } = compiled;
  return device.createRenderPipelineAsync({
    label,
    layout: device.createPipelineLayout({
      label: `${label} pipeline layout`,
      bindGroupLayouts: layouts,
    }),
    vertex: {
      module,
      entryPoint: artifact.entryPoints.vertex,
      buffers: artifact.pipeline.vertexBuffers,
    },
    fragment: {
      module,
      entryPoint: artifact.entryPoints.fragment,
      targets: artifact.pipeline.targets,
    },
    primitive,
    depthStencil: artifact.pipeline.depthStencil,
    multisample: artifact.pipeline.multisample,
  });
}

export function createArtifactComputePipeline(
  device: GPUDevice,
  compiled: CompiledArtifact<AotComputeShaderArtifact>,
  label: string,
): Promise<GPUComputePipeline> {
  const { artifact, layouts, module } = compiled;
  return device.createComputePipelineAsync({
    label,
    layout: device.createPipelineLayout({
      label: `${label} pipeline layout`,
      bindGroupLayouts: layouts,
    }),
    compute: {
      module,
      entryPoint: artifact.entryPoints.compute,
    },
  });
}
