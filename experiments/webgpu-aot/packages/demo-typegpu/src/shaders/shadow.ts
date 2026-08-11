import tgpu, {
  d,
  std,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from "typegpu";

export const ShadowFrameSchema = d
  .struct({
    viewProjection: d.mat4x4f,
    model: d.mat4x4f,
  })
  .$name("TypeGpuShadowFrame");

export const shadowLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: ShadowFrameSchema, visibility: ["vertex"] },
  })
  .$idx(0)
  .$name("typeGpuShadowLayout");

export const shadowPositionLayout = tgpu
  .vertexLayout((count) => d.disarrayOf(d.vec3f, count))
  .$name("typeGpuShadowPositionLayout");

export const shadowVertex = tgpu
  .vertexFn({
    in: { position: d.vec3f },
    out: { position: d.builtin.position },
  })((input) => {
    "use gpu";
    const world = std.mul(
      shadowLayout.$.frame.model,
      d.vec4f(input.position, 1),
    );
    return {
      position: std.mul(shadowLayout.$.frame.viewProjection, world),
    };
  })
  .$name("shadowVertex");

export function createTypeGpuShadowPipeline(
  root: TgpuRoot,
  cullMode: GPUCullMode,
): TgpuRenderPipeline {
  return root
    .createRenderPipeline({
      attribs: { position: shadowPositionLayout.attrib },
      vertex: shadowVertex,
      primitive: { topology: "triangle-list", cullMode, frontFace: "ccw" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    })
    .$name(`TypeGPU fitted directional shadow ${cullMode}`);
}
