import { d } from "typegpu";

export const FrameSchema = d
  .struct({
    viewProjection: d.mat4x4f,
    model: d.mat4x4f,
    nearShadowViewProjection: d.mat4x4f,
    farShadowViewProjection: d.mat4x4f,
    inverseViewProjection: d.mat4x4f,
    cameraPosition: d.vec4f,
    settings: d.vec4f,
    environment: d.vec4f,
  })
  .$name("TypeGpuFrame");
