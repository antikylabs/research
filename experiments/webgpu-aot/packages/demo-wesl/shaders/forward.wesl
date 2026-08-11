import package::environment::{EnvironmentSettings, environmentLighting};
import package::pbr::evaluatePbr;
import package::scene_types::{clipPosition, Frame, Light, Material, worldPosition};
import package::sun::{SunLighting, sunShadowVisibility};

struct ForwardVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) tangent: vec3f,
  @location(4) bitangent: vec3f,
}

struct ForwardFragmentOutput {
  @location(0) color: vec4f,
  @location(1) surface: vec4f,
  @location(2) worldMetal: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> lights: array<Light, 32>;
@group(0) @binding(2) var nearShadow: texture_depth_2d;
@group(0) @binding(3) var farShadow: texture_depth_2d;
@group(0) @binding(4) var shadowSampler: sampler_comparison;
@group(0) @binding(5) var<uniform> sunLighting: SunLighting;

@group(1) @binding(0) var materialSampler: sampler;
@group(1) @binding(1) var baseColorTexture: texture_2d<f32>;
@group(1) @binding(2) var normalTexture: texture_2d<f32>;
@group(1) @binding(3) var metallicRoughnessTexture: texture_2d<f32>;
@group(1) @binding(4) var<uniform> material: Material;

@group(2) @binding(0) var iblSampler: sampler;
@group(2) @binding(1) var environmentSource: texture_cube<f32>;
@group(2) @binding(2) var environmentDiffuse: texture_cube<f32>;
@group(2) @binding(3) var environmentSpecular: texture_cube<f32>;
@group(2) @binding(4) var environmentBrdfLut: texture_2d<f32>;
@group(2) @binding(5) var<uniform> environmentSettings: EnvironmentSettings;

@vertex
fn forwardVertex(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) tangent: vec4f,
) -> ForwardVertexOutput {
  var output: ForwardVertexOutput;
  let world = worldPosition(frame, position);
  output.position = clipPosition(frame, position);
  output.worldPosition = world.xyz;
  let worldNormal = normalize((frame.model * vec4f(normal, 0.0)).xyz);
  let worldTangent = normalize((frame.model * vec4f(tangent.xyz, 0.0)).xyz);
  output.normal = worldNormal;
  output.tangent = worldTangent;
  output.bitangent = cross(worldNormal, worldTangent) * tangent.w;
  output.uv = uv;
  return output;
}

fn mappedNormal(input: ForwardVertexOutput, frontFacing: bool) -> vec3f {
  let faceDirection = select(-1.0, 1.0, frontFacing);
  let faceNormal = normalize(input.normal * faceDirection);
  let tangent = normalize(input.tangent * faceDirection);
  let bitangent = normalize(input.bitangent);
  let sampled = textureSample(normalTexture, materialSampler, input.uv).xyz *
    2.0 - 1.0;
  return normalize(
    tangent * sampled.x + bitangent * sampled.y + faceNormal * sampled.z,
  );
}

fn geometryNormalInView(normal: vec3f, cameraPosition: vec3f) -> vec3f {
  let viewZ = normalize(cameraPosition - vec3f(0.0, 2.0, 0.0));
  let viewX = normalize(cross(vec3f(0.0, 1.0, 0.0), viewZ));
  let viewY = cross(viewZ, viewX);
  return vec3f(
    dot(viewX, normal),
    dot(viewY, normal),
    dot(viewZ, normal),
  );
}

@fragment
fn forwardFragment(
  input: ForwardVertexOutput,
  @builtin(front_facing) frontFacing: bool,
) -> ForwardFragmentOutput {
  let base = textureSample(baseColorTexture, materialSampler, input.uv) *
    material.baseColorFactor;
  if (material.factors.x > 0.0 && base.a < material.factors.x) {
    discard;
  }
  let normal = mappedNormal(input, frontFacing);
  let packedMaterial = textureSample(
    metallicRoughnessTexture,
    materialSampler,
    input.uv,
  );
  let metallic = clamp(packedMaterial.b * material.factors.y, 0.0, 1.0);
  let materialRoughness = packedMaterial.g * material.factors.z;
  let geometryNormalView = geometryNormalInView(
    normalize(input.normal),
    frame.cameraPosition.xyz,
  );
  let geometryDerivative = max(
    abs(dpdx(geometryNormalView)),
    abs(-dpdy(geometryNormalView)),
  );
  let geometryRoughness = max(
    max(geometryDerivative.x, geometryDerivative.y),
    geometryDerivative.z,
  );
  let roughness = min(
    max(materialRoughness, 0.0525) + geometryRoughness,
    1.0,
  );
  let view = normalize(frame.cameraPosition.xyz - input.worldPosition);
  let sunDirection = normalize(sunLighting.directionIntensity.xyz);
  let sunVisibility = sunShadowVisibility(
    nearShadow,
    farShadow,
    shadowSampler,
    sunLighting,
    frame.cameraPosition.xyz,
    input.worldPosition,
    normal,
  );
  var color = evaluatePbr(
    normal,
    view,
    sunDirection,
    base.rgb,
    metallic,
    roughness,
  ) * sunLighting.color.rgb * sunLighting.directionIntensity.w *
    sunVisibility;

  let lightCount = u32(frame.settings.x);
  for (var index = 0u; index < lightCount; index += 1u) {
    let light = lights[index];
    let toLight = light.positionRadius.xyz - input.worldPosition;
    let distanceSquared = dot(toLight, toLight);
    let distanceToLight = length(toLight);
    if (distanceToLight < light.positionRadius.w) {
      let direction = toLight / max(distanceToLight, 0.001);
      let distanceRatio = distanceToLight / light.positionRadius.w;
      let cutoff = clamp(1.0 - pow(distanceRatio, 4.0), 0.0, 1.0);
      let attenuation =
        1.0 / max(distanceSquared, 0.01) * cutoff * cutoff;
      color += evaluatePbr(
        normal,
        view,
        direction,
        base.rgb,
        metallic,
        roughness,
      ) * light.colorIntensity.rgb * light.colorIntensity.w * attenuation;
    }
  }

  color += environmentLighting(
    iblSampler,
    environmentDiffuse,
    environmentSpecular,
    environmentBrdfLut,
    environmentSettings,
    normal,
    view,
    base.rgb,
    metallic,
    roughness,
    1.0,
  );
  var output: ForwardFragmentOutput;
  output.color = vec4f(color, base.a);
  output.surface = vec4f(normal * 0.5 + 0.5, roughness);
  output.worldMetal = vec4f(input.worldPosition, metallic);
  return output;
}
