const PI: f32 = 3.141592653589793;
const SPECULAR_SAMPLE_COUNT: u32 = 64u;
const DIFFUSE_SAMPLE_COUNT: u32 = 64u;
const BRDF_SAMPLE_COUNT: u32 = 128u;

struct PrefilterSettings {
  values: vec4f,
}

@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceCube: texture_cube<f32>;
@group(0) @binding(2) var outputCube: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(3) var<uniform> prefilterSettings: PrefilterSettings;
@group(0) @binding(4) var outputLut: texture_storage_2d<rgba16float, write>;

fn radicalInverse(index: u32) -> f32 {
  var bits = index;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) |
    ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) |
    ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) |
    ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) |
    ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(index: u32, count: u32) -> vec2f {
  return vec2f(f32(index) / f32(count), radicalInverse(index));
}

fn tangentFrame(normal: vec3f) -> mat3x3f {
  let up = select(
    vec3f(0.0, 0.0, 1.0),
    vec3f(1.0, 0.0, 0.0),
    abs(normal.z) > 0.999,
  );
  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);
  return mat3x3f(tangent, bitangent, normal);
}

fn cubeDirection(face: u32, pixel: vec2u, dimensions: vec2u) -> vec3f {
  let uv = (vec2f(pixel) + vec2f(0.5)) / vec2f(dimensions) * 2.0 - 1.0;
  var direction = vec3f(uv.x, -uv.y, 1.0);
  switch face {
    case 0u: {
      direction = vec3f(1.0, -uv.y, -uv.x);
    }
    case 1u: {
      direction = vec3f(-1.0, -uv.y, uv.x);
    }
    case 2u: {
      direction = vec3f(uv.x, 1.0, uv.y);
    }
    case 3u: {
      direction = vec3f(uv.x, -1.0, -uv.y);
    }
    case 4u: {
      direction = vec3f(uv.x, -uv.y, 1.0);
    }
    default: {
      direction = vec3f(-uv.x, -uv.y, -1.0);
    }
  }
  return normalize(direction);
}

fn importanceSampleGgx(samplePoint: vec2f, roughness: f32) -> vec3f {
  let alpha = roughness * roughness;
  let phi = 2.0 * PI * samplePoint.x;
  let cosTheta = sqrt(
    (1.0 - samplePoint.y) /
      max(1.0 + (alpha * alpha - 1.0) * samplePoint.y, 0.000001),
  );
  let sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));
  return vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
}

fn cosineSampleHemisphere(samplePoint: vec2f) -> vec3f {
  let radius = sqrt(samplePoint.y);
  let phi = 2.0 * PI * samplePoint.x;
  return vec3f(
    radius * cos(phi),
    radius * sin(phi),
    sqrt(max(1.0 - samplePoint.y, 0.0)),
  );
}

fn geometrySchlickGgx(nDotDirection: f32, roughness: f32) -> f32 {
  let k = roughness * roughness * 0.5;
  return nDotDirection /
    max(nDotDirection * (1.0 - k) + k, 0.000001);
}

fn geometrySmith(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  return geometrySchlickGgx(nDotV, roughness) *
    geometrySchlickGgx(nDotL, roughness);
}

@compute @workgroup_size(8, 8, 1)
fn prefilterSpecular(@builtin(global_invocation_id) id: vec3u) {
  let dimensions = textureDimensions(outputCube);
  if (id.x >= dimensions.x || id.y >= dimensions.y || id.z >= 6u) {
    return;
  }
  let normal = cubeDirection(id.z, id.xy, dimensions);
  let roughness = clamp(prefilterSettings.values.x, 0.0, 1.0);
  if (roughness <= 0.0001) {
    textureStore(
      outputCube,
      vec2i(id.xy),
      i32(id.z),
      textureSampleLevel(sourceCube, sourceSampler, normal, 0.0),
    );
    return;
  }

  let frame = tangentFrame(normal);
  var color = vec3f(0.0);
  var weight = 0.0;
  for (var index = 0u; index < SPECULAR_SAMPLE_COUNT; index += 1u) {
    let halfway = normalize(
      frame * importanceSampleGgx(
        hammersley(index, SPECULAR_SAMPLE_COUNT),
        roughness,
      ),
    );
    let light = normalize(reflect(-normal, halfway));
    let nDotL = max(dot(normal, light), 0.0);
    if (nDotL > 0.0) {
      color += textureSampleLevel(
        sourceCube,
        sourceSampler,
        light,
        0.0,
      ).rgb * nDotL;
      weight += nDotL;
    }
  }
  textureStore(
    outputCube,
    vec2i(id.xy),
    i32(id.z),
    vec4f(color / max(weight, 0.000001), 1.0),
  );
}

@compute @workgroup_size(8, 8, 1)
fn convolveDiffuse(@builtin(global_invocation_id) id: vec3u) {
  let dimensions = textureDimensions(outputCube);
  if (id.x >= dimensions.x || id.y >= dimensions.y || id.z >= 6u) {
    return;
  }
  let normal = cubeDirection(id.z, id.xy, dimensions);
  let frame = tangentFrame(normal);
  var irradianceOverPi = vec3f(0.0);
  for (var index = 0u; index < DIFFUSE_SAMPLE_COUNT; index += 1u) {
    let direction = normalize(
      frame * cosineSampleHemisphere(
        hammersley(index, DIFFUSE_SAMPLE_COUNT),
      ),
    );
    irradianceOverPi += textureSampleLevel(
      sourceCube,
      sourceSampler,
      direction,
      0.0,
    ).rgb;
  }
  textureStore(
    outputCube,
    vec2i(id.xy),
    i32(id.z),
    vec4f(irradianceOverPi / f32(DIFFUSE_SAMPLE_COUNT), 1.0),
  );
}

@compute @workgroup_size(8, 8, 1)
fn integrateBrdf(@builtin(global_invocation_id) id: vec3u) {
  let dimensions = textureDimensions(outputLut);
  if (id.x >= dimensions.x || id.y >= dimensions.y) {
    return;
  }
  let coordinate = (vec2f(id.xy) + vec2f(0.5)) / vec2f(dimensions);
  let nDotV = coordinate.x;
  let roughness = coordinate.y;
  let normal = vec3f(0.0, 0.0, 1.0);
  let view = vec3f(sqrt(max(1.0 - nDotV * nDotV, 0.0)), 0.0, nDotV);
  var scale = 0.0;
  var bias = 0.0;
  for (var index = 0u; index < BRDF_SAMPLE_COUNT; index += 1u) {
    let halfway = importanceSampleGgx(
      hammersley(index, BRDF_SAMPLE_COUNT),
      roughness,
    );
    let light = normalize(2.0 * dot(view, halfway) * halfway - view);
    let nDotL = max(light.z, 0.0);
    let nDotH = max(halfway.z, 0.0);
    let vDotH = max(dot(view, halfway), 0.0);
    if (nDotL > 0.0) {
      let geometry = geometrySmith(nDotV, nDotL, roughness);
      let visibility = geometry * vDotH /
        max(nDotH * nDotV, 0.000001);
      let fresnel = pow(1.0 - vDotH, 5.0);
      scale += (1.0 - fresnel) * visibility;
      bias += fresnel * visibility;
    }
  }
  textureStore(
    outputLut,
    vec2i(id.xy),
    vec4f(
      scale / f32(BRDF_SAMPLE_COUNT),
      bias / f32(BRDF_SAMPLE_COUNT),
      0.0,
      1.0,
    ),
  );
}
