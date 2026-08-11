struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}

struct Material {
  baseColorFactor: vec4f,
  factors: vec4f,
}

struct GeometryVertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) uv: vec2f,
  @location(2) normal: vec3f,
  @location(3) tangent: vec4f,
}

struct GBufferOut {
  @location(0) albedo: vec4f,
  @location(1) normalRoughness: vec4f,
  @location(2) worldMetal: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

@group(1) @binding(0) var materialSampler: sampler;

@group(1) @binding(1) var baseColorTexture: texture_2d<f32>;

@group(1) @binding(2) var normalTexture: texture_2d<f32>;

@group(1) @binding(3) var metallicRoughnessTexture: texture_2d<f32>;

@group(1) @binding(4) var<uniform> material: Material;

@vertex
fn geometryVertex(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f, @location(3) tangent: vec4f) -> GeometryVertexOut {
var output: GeometryVertexOut;
  let worldPosition = frame.model * vec4f(position, 1.0);
  output.position = frame.viewProjection * worldPosition;
  output.worldPosition = worldPosition.xyz;
  output.uv = uv;
  output.normal = normalize((frame.model * vec4f(normal, 0.0)).xyz);
  output.tangent = vec4f(
    normalize((frame.model * vec4f(tangent.xyz, 0.0)).xyz),
    tangent.w,
  );
  return output;
}

@fragment
fn geometryFragment(input: GeometryVertexOut, @builtin(front_facing) frontFacing: bool) -> GBufferOut {
let base = textureSample(baseColorTexture, materialSampler, input.uv) * material.baseColorFactor;
  if (material.factors.x > 0.0 && base.a < material.factors.x) {
    discard;
  }

  let faceDirection = select(-1.0, 1.0, frontFacing);
  let geometricNormal = normalize(input.normal * faceDirection);
  let tangent = normalize(input.tangent.xyz * faceDirection);
  let bitangent = normalize(cross(input.normal, input.tangent.xyz) * input.tangent.w);
  let sampledNormal = textureSample(normalTexture, materialSampler, input.uv).xyz * 2.0 - 1.0;
  let worldNormal = normalize(mat3x3f(tangent, bitangent, geometricNormal) * sampledNormal);
  let metallicRoughness = textureSample(
    metallicRoughnessTexture,
    materialSampler,
    input.uv,
  );

  var output: GBufferOut;
  output.albedo = vec4f(base.rgb, base.a);
  output.normalRoughness = vec4f(
    worldNormal * 0.5 + vec3f(0.5),
    clamp(metallicRoughness.g * material.factors.z, 0.045, 1.0),
  );
  output.worldMetal = vec4f(
    input.worldPosition,
    clamp(metallicRoughness.b * material.factors.y, 0.0, 1.0),
  );
  return output;
}
