import package::scene_types::{clipPosition, Frame, Material};

struct DepthVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var materialSampler: sampler;
@group(1) @binding(1) var baseColorTexture: texture_2d<f32>;
@group(1) @binding(2) var<uniform> material: Material;

@vertex
fn depthVertex(
  @location(0) position: vec3f,
  @location(1) uv: vec2f,
) -> DepthVertexOutput {
  var output: DepthVertexOutput;
  output.position = clipPosition(frame, position);
  output.uv = uv;
  return output;
}

@fragment
fn depthFragment(input: DepthVertexOutput) {
  if (material.factors.x > 0.0) {
    let alpha = textureSample(baseColorTexture, materialSampler, input.uv).a *
      material.baseColorFactor.a;
    if (alpha < material.factors.x) {
      discard;
    }
  }
}
