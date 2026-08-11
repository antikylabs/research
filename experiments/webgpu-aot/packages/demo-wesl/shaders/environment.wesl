struct EnvironmentSettings {
  inverseViewProjection: mat4x4f,
  cameraPositionMaxSpecularMip: vec4f,
  gains: vec4f,
}

struct EnvironmentVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct EnvironmentFragmentOutput {
  @location(0) color: vec4f,
  @location(1) surface: vec4f,
  @location(2) worldMetal: vec4f,
}

@group(0) @binding(0) var environmentSampler: sampler;
@group(0) @binding(1) var sourceCube: texture_cube<f32>;
@group(0) @binding(2) var diffuseCube: texture_cube<f32>;
@group(0) @binding(3) var specularCube: texture_cube<f32>;
@group(0) @binding(4) var brdfLut: texture_2d<f32>;
@group(0) @binding(5) var<uniform> environmentSettings: EnvironmentSettings;

fn environmentSampleDirection(direction: vec3f) -> vec3f {
  return vec3f(-direction.x, direction.yz);
}

fn environmentScattering(
  f0: vec3f,
  dfg: vec2f,
) -> mat2x3f {
  let single = f0 * dfg.x + vec3f(dfg.y);
  let energyMissing = 1.0 - dfg.x - dfg.y;
  let averageFresnel = f0 + (vec3f(1.0) - f0) / 21.0;
  let multi = single * averageFresnel * energyMissing /
    max(
      vec3f(1.0) - averageFresnel * energyMissing,
      vec3f(0.000001),
    );
  return mat2x3f(single, multi);
}

fn environmentLighting(
  iblSampler: sampler,
  irradianceMap: texture_cube<f32>,
  prefilteredMap: texture_cube<f32>,
  integrationLut: texture_2d<f32>,
  settings: EnvironmentSettings,
  normal: vec3f,
  view: vec3f,
  albedo: vec3f,
  metallic: f32,
  roughness: f32,
  ambientOcclusion: f32,
) -> vec3f {
  let n = normalize(normal);
  let v = normalize(view);
  let nDotV = clamp(dot(n, v), 0.0, 1.0);
  let clampedRoughness = clamp(roughness, 0.0, 1.0);
  let dfg = textureSampleLevel(
    integrationLut,
    iblSampler,
    vec2f(nDotV, clampedRoughness),
    0.0,
  ).rg;
  let irradiance = textureSampleLevel(
    irradianceMap,
    iblSampler,
    environmentSampleDirection(n),
    0.0,
  ).rgb;
  let roughnessSquared = clampedRoughness * clampedRoughness;
  let reflected = reflect(-v, n);
  let reflectedDirection = normalize(mix(
    reflected,
    n,
    roughnessSquared * roughnessSquared,
  ));
  let prefiltered = textureSampleLevel(
    prefilteredMap,
    iblSampler,
    environmentSampleDirection(reflectedDirection),
    clampedRoughness * settings.cameraPositionMaxSpecularMip.w,
  ).rgb;

  let dielectric = environmentScattering(vec3f(0.04), dfg);
  let metal = environmentScattering(albedo, dfg);
  let singleScattering = mix(dielectric[0], metal[0], metallic);
  let multiScattering = mix(dielectric[1], metal[1], metallic);
  let diffuseEnergy = vec3f(1.0) - dielectric[0] - dielectric[1];
  let diffuse = irradiance * albedo * (1.0 - metallic) * diffuseEnergy *
    clamp(ambientOcclusion, 0.0, 1.0) * settings.gains.x;
  let specularOcclusion = clamp(
    ambientOcclusion + pow(
      nDotV + ambientOcclusion,
      exp2(-(1.0 + 16.0 * clampedRoughness)),
    ) - 1.0,
    0.0,
    1.0,
  );
  let specular = (
    prefiltered * singleScattering + irradiance * multiScattering
  ) * specularOcclusion * settings.gains.y;
  return diffuse + specular;
}

@vertex
fn environmentVertex(
  @builtin(vertex_index) vertexIndex: u32,
) -> EnvironmentVertexOutput {
  let x = f32(i32(vertexIndex & 1u) * 4 - 1);
  let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
  var output: EnvironmentVertexOutput;
  output.position = vec4f(x, y, 1.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

@fragment
fn environmentFragment(
  input: EnvironmentVertexOutput,
) -> EnvironmentFragmentOutput {
  let clip = vec4f(
    input.uv.x * 2.0 - 1.0,
    1.0 - input.uv.y * 2.0,
    1.0,
    1.0,
  );
  let projected = environmentSettings.inverseViewProjection * clip;
  let farPosition = projected.xyz / projected.w;
  let direction = normalize(
    farPosition - environmentSettings.cameraPositionMaxSpecularMip.xyz,
  );
  let background = textureSampleLevel(
    sourceCube,
    environmentSampler,
    environmentSampleDirection(direction),
    0.0,
  ).rgb * environmentSettings.gains.z;

  var output: EnvironmentFragmentOutput;
  output.color = vec4f(background, 1.0);
  output.surface = vec4f(0.0);
  output.worldMetal = vec4f(0.0);
  return output;
}
