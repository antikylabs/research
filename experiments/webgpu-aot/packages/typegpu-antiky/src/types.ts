import type { TgpuComputeFn, TgpuFragmentFn, TgpuVertexFn } from "typegpu";

export type ArtifactKind = "render" | "compute";
export type ShaderStage = "vertex" | "fragment" | "compute";

export interface StaticBufferBinding {
  readonly type: "uniform" | "storage" | "read-only-storage";
  readonly minBindingSize?: number;
}

export interface StaticTextureBinding {
  readonly sampleType: GPUTextureSampleType;
  readonly viewDimension?: GPUTextureViewDimension;
  readonly multisampled?: boolean;
}

export interface StaticSamplerBinding {
  readonly type: "filtering" | "non-filtering" | "comparison";
}

export interface StaticStorageTextureBinding {
  readonly access: GPUStorageTextureAccess;
  readonly format: GPUTextureFormat;
  readonly viewDimension?: GPUTextureViewDimension;
}

interface StaticBindGroupEntryBase {
  readonly name: string;
  readonly binding: number;
  readonly visibility: readonly ShaderStage[];
}

export interface StaticBufferBindGroupEntry extends StaticBindGroupEntryBase {
  readonly buffer: StaticBufferBinding;
  readonly sampler?: never;
  readonly storageTexture?: never;
  readonly texture?: never;
}

export interface StaticTextureBindGroupEntry extends StaticBindGroupEntryBase {
  readonly buffer?: never;
  readonly sampler?: never;
  readonly storageTexture?: never;
  readonly texture: StaticTextureBinding;
}

export interface StaticSamplerBindGroupEntry extends StaticBindGroupEntryBase {
  readonly buffer?: never;
  readonly sampler: StaticSamplerBinding;
  readonly storageTexture?: never;
  readonly texture?: never;
}

export interface StaticStorageTextureBindGroupEntry
  extends StaticBindGroupEntryBase {
  readonly buffer?: never;
  readonly sampler?: never;
  readonly storageTexture: StaticStorageTextureBinding;
  readonly texture?: never;
}

export type StaticBindGroupEntry =
  | StaticBufferBindGroupEntry
  | StaticTextureBindGroupEntry
  | StaticSamplerBindGroupEntry
  | StaticStorageTextureBindGroupEntry;

export interface StaticBindGroup {
  readonly group: number;
  readonly entries: readonly StaticBindGroupEntry[];
}

export interface StaticPipelineConfiguration {
  readonly vertexBuffers: readonly GPUVertexBufferLayout[];
  readonly primitive: GPUPrimitiveState;
  readonly targets: readonly GPUColorTargetState[];
  readonly depthStencil?: GPUDepthStencilState;
  readonly multisample?: GPUMultisampleState;
}

interface ShaderMetadataBase {
  readonly kind: ArtifactKind;
  readonly bindGroups: readonly StaticBindGroup[];
}

export interface RenderShaderMetadata extends ShaderMetadataBase {
  readonly kind: "render";
  readonly entryPoints: {
    readonly vertex: string;
    readonly fragment: string;
  };
  readonly pipeline: StaticPipelineConfiguration;
}

export interface ComputeShaderMetadata extends ShaderMetadataBase {
  readonly kind: "compute";
  readonly entryPoints: {
    readonly compute: string;
  };
}

export type ShaderMetadata = RenderShaderMetadata | ComputeShaderMetadata;

export interface AotRenderShaderArtifact extends RenderShaderMetadata {
  readonly wgsl: string;
}

export interface AotComputeShaderArtifact extends ComputeShaderMetadata {
  readonly wgsl: string;
}

export type AotShaderArtifact =
  | AotRenderShaderArtifact
  | AotComputeShaderArtifact;

export interface ShaderDefinitionInput
  extends Omit<RenderShaderMetadata, "kind"> {
  readonly vertex: TgpuVertexFn<any, any>;
  readonly fragment: TgpuFragmentFn<any, any>;
}

export interface ShaderDefinition extends ShaderDefinitionInput {
  readonly kind: "render";
}

export interface ComputeShaderDefinitionInput
  extends Omit<ComputeShaderMetadata, "kind"> {
  readonly compute: TgpuComputeFn<any>;
}

export interface ComputeShaderDefinition extends ComputeShaderDefinitionInput {
  readonly kind: "compute";
}

export type AnyShaderDefinition = ShaderDefinition | ComputeShaderDefinition;

export interface CompileShaderOptions {
  readonly input: string;
  readonly outDir: string;
}

export interface CompileShaderResult {
  readonly artifact: AotShaderArtifact;
  readonly wgslPath: string;
  readonly modulePath: string;
}
