struct ComposeParams {
  values: vec4f,
}

struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var hdrTexture: texture_2d<f32>;

@group(0) @binding(1) var bloomLevel0: texture_2d<f32>;

@group(0) @binding(2) var bloomLevel1: texture_2d<f32>;

@group(0) @binding(3) var bloomLevel2: texture_2d<f32>;

@group(0) @binding(4) var bloomLevel3: texture_2d<f32>;

@group(0) @binding(5) var bloomLevel4: texture_2d<f32>;

@group(0) @binding(6) var bloomSampler: sampler;

@group(0) @binding(7) var<uniform> compose: ComposeParams;

@vertex
fn screenVertex(@builtin(vertex_index) index: u32) -> ScreenOut {
var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn fxaaHdr(uv: vec2f) -> vec3f {
let texel = 1.0 / compose.values.zw;
  let rgbNorthWest = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(-texel.x, -texel.y),
    0.0,
  ).rgb;
  let rgbNorthEast = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(texel.x, -texel.y),
    0.0,
  ).rgb;
  let rgbSouthWest = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(-texel.x, texel.y),
    0.0,
  ).rgb;
  let rgbSouthEast = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(texel.x, texel.y),
    0.0,
  ).rgb;
  let rgbCenter = textureSampleLevel(hdrTexture, bloomSampler, uv, 0.0).rgb;
  let luma = vec3f(0.299, 0.587, 0.114);
  let lumaNorthWest = dot(rgbNorthWest, luma);
  let lumaNorthEast = dot(rgbNorthEast, luma);
  let lumaSouthWest = dot(rgbSouthWest, luma);
  let lumaSouthEast = dot(rgbSouthEast, luma);
  let lumaCenter = dot(rgbCenter, luma);
  let lumaMinimum = min(
    lumaCenter,
    min(
      min(lumaNorthWest, lumaNorthEast),
      min(lumaSouthWest, lumaSouthEast),
    ),
  );
  let lumaMaximum = max(
    lumaCenter,
    max(
      max(lumaNorthWest, lumaNorthEast),
      max(lumaSouthWest, lumaSouthEast),
    ),
  );
  var direction = vec2f(
    -((lumaNorthWest + lumaNorthEast) - (lumaSouthWest + lumaSouthEast)),
    (lumaNorthWest + lumaSouthWest) - (lumaNorthEast + lumaSouthEast),
  );
  let directionReduce = max(
    (lumaNorthWest + lumaNorthEast + lumaSouthWest + lumaSouthEast) * 0.0078125,
    0.0009765625,
  );
  direction = clamp(
    direction / (min(abs(direction.x), abs(direction.y)) + directionReduce),
    vec2f(-8.0),
    vec2f(8.0),
  ) * texel;
  let rgbA = 0.5 * (
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * -0.166667, 0.0).rgb +
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * 0.166667, 0.0).rgb
  );
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * -0.5, 0.0).rgb +
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * 0.5, 0.0).rgb
  );
  let lumaB = dot(rgbB, luma);
  return select(rgbB, rgbA, lumaB < lumaMinimum || lumaB > lumaMaximum);
}

fn acesFilmicToneMapping(color: vec3f, exposure: f32) -> vec3f {
let input = mat3x3f(
    0.59719, 0.076, 0.0284,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777,
  ) * ((color * exposure) / 0.6);
  let fitted = (
    input * (input + vec3f(0.0245786)) - vec3f(0.000090537)
  ) / (
    input * ((input + vec3f(0.432951)) * 0.983729) + vec3f(0.238081)
  );
  return clamp(
    mat3x3f(
      1.60475, -0.10208, -0.00327,
      -0.53108, 1.10813, -0.07276,
      -0.07367, -0.00605, 1.07602,
    ) * fitted,
    vec3f(0.0),
    vec3f(1.0),
  );
}

fn sRGBTransferOETF(color: vec3f) -> vec3f {
let nonlinear = pow(color, vec3f(0.41666)) * 1.055 - vec3f(0.055);
  let linear = color * 12.92;
  return select(nonlinear, linear, color <= vec3f(0.0031308));
}

@fragment
fn compositeFragment(input: ScreenOut) -> @location(0) vec4f {
var color = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    input.uv,
    0.0,
  ).rgb;
  let bloom = (
    textureSampleLevel(bloomLevel0, bloomSampler, input.uv, 0.0).rgb * 1.0007 +
    textureSampleLevel(bloomLevel1, bloomSampler, input.uv, 0.0).rgb * 0.7986 +
    textureSampleLevel(bloomLevel2, bloomSampler, input.uv, 0.0).rgb * 0.5965 +
    textureSampleLevel(bloomLevel3, bloomSampler, input.uv, 0.0).rgb * 0.3944 +
    textureSampleLevel(bloomLevel4, bloomSampler, input.uv, 0.0).rgb * 0.1923
  ) * 0.18;
  color += bloom;
  color = acesFilmicToneMapping(color, compose.values.y);
  color = sRGBTransferOETF(color);
  return vec4f(color, 1.0);
}
