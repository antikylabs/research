import tgpu, { common, type TgpuRenderPipeline } from "typegpu";

import {
  backgroundFragment,
  forwardFragment,
  forwardVertex,
  normalLayout,
  positionLayout,
  texcoordLayout,
} from "./shaders/forward.js";

export function createTypeGpuBackgroundPipeline(
  root: ReturnType<typeof tgpu.initFromDevice>,
  sampleCount: number,
): TgpuRenderPipeline {
  return root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: backgroundFragment,
      targets: {
        color: { format: "rgba16float" },
        surface: { format: "rgba16float" },
        worldMetal: { format: "rgba16float" },
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: sampleCount },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    })
    .$name("TypeGPU native HDR environment background");
}

export function createTypeGpuForwardPipeline(
  root: ReturnType<typeof tgpu.initFromDevice>,
  cullMode: GPUCullMode,
  sampleCount: number,
): TgpuRenderPipeline {
  return root
    .createRenderPipeline({
      attribs: {
        position: positionLayout.attrib,
        normal: normalLayout.attrib,
        uv: texcoordLayout.attrib,
      },
      vertex: forwardVertex,
      fragment: forwardFragment,
      targets: {
        color: { format: "rgba16float" },
        surface: { format: "rgba16float" },
        worldMetal: { format: "rgba16float" },
      },
      primitive: { topology: "triangle-list", cullMode, frontFace: "ccw" },
      multisample: { count: sampleCount },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    })
    .$name(`TypeGPU forward ${cullMode}`);
}
