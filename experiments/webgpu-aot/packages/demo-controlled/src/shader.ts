export const CONTROLLED_WGSL = /* wgsl */ `
struct Frame {
  values: vec4f,
}

struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var hdrTexture: texture_2d<f32>;

@vertex
fn fullScreenVertex(@builtin(vertex_index) vertexIndex: u32) -> ScreenOut {
  let x = f32(i32(vertexIndex & 1u) * 4 - 1);
  let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
  var output: ScreenOut;
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn distributionGgx(normal: vec3f, halfway: vec3f, roughness: f32) -> f32 {
  let alpha = roughness * roughness;
  let alphaSquared = alpha * alpha;
  let nDotH = max(dot(normal, halfway), 0.0);
  let denominator = nDotH * nDotH * (alphaSquared - 1.0) + 1.0;
  return alphaSquared / max(3.14159265 * denominator * denominator, 0.0001);
}

fn geometrySchlickGgx(nDotDirection: f32, roughness: f32) -> f32 {
  let adjusted = roughness + 1.0;
  let k = adjusted * adjusted * 0.125;
  return nDotDirection / max(nDotDirection * (1.0 - k) + k, 0.0001);
}

fn shade(normal: vec3f, view: vec3f, light: vec3f, albedo: vec3f, roughness: f32) -> vec3f {
  let halfway = normalize(view + light);
  let nDotL = max(dot(normal, light), 0.0);
  let nDotV = max(dot(normal, view), 0.0);
  let vDotH = max(dot(view, halfway), 0.0);
  let fresnel = vec3f(0.04) + vec3f(0.96) * pow(1.0 - vDotH, 5.0);
  let distribution = distributionGgx(normal, halfway, roughness);
  let geometry = geometrySchlickGgx(nDotL, roughness) *
    geometrySchlickGgx(nDotV, roughness);
  let specular = fresnel * distribution * geometry /
    max(4.0 * nDotL * nDotV, 0.0001);
  let diffuse = (vec3f(1.0) - fresnel) * albedo / 3.14159265;
  return (diffuse + specular) * nDotL;
}

@fragment
fn controlledFragment(input: ScreenOut) -> @location(0) vec4f {
  let centered = input.uv * 2.0 - vec2f(1.0);
  let radiusSquared = dot(centered, centered);
  let height = sqrt(max(1.0 - min(radiusSquared, 1.0), 0.0));
  let normal = normalize(vec3f(centered, height + 0.2));
  let view = vec3f(0.0, 0.0, 1.0);
  let roughness = 0.28 + 0.55 * input.uv.y;
  let albedo = mix(vec3f(0.04, 0.16, 0.24), vec3f(0.82, 0.18, 0.06), input.uv.x);
  var color = albedo * 0.018;
  let time = frame.values.x * 0.002;
  for (var lightIndex = 0; lightIndex < 32; lightIndex += 1) {
    let phase = f32(lightIndex) * 0.19634954 + time;
    let light = normalize(vec3f(cos(phase), sin(phase), 0.45 + 0.5 * fract(f32(lightIndex) * 0.37)));
    let tint = 0.45 + 0.55 * vec3f(
      fract(f32(lightIndex) * 0.31),
      fract(f32(lightIndex) * 0.53),
      fract(f32(lightIndex) * 0.79),
    );
    color += shade(normal, view, light, albedo, roughness) * tint * 0.34;
  }
  color *= 1.0 - smoothstep(0.2, 1.35, radiusSquared);
  return vec4f(color, 1.0);
}

fn acesApproximation(color: vec3f) -> vec3f {
  return clamp(
    (color * (2.51 * color + vec3f(0.03))) /
      (color * (2.43 * color + vec3f(0.59)) + vec3f(0.14)),
    vec3f(0.0),
    vec3f(1.0),
  );
}

@fragment
fn compositeFragment(input: ScreenOut) -> @location(0) vec4f {
  let maximum = vec2i(textureDimensions(hdrTexture)) - vec2i(1);
  let pixel = clamp(vec2i(floor(input.position.xy)), vec2i(0), maximum);
  let hdr = textureLoad(hdrTexture, pixel, 0).rgb;
  let mapped = acesApproximation(hdr);
  let srgb = select(
    mapped * 12.92,
    pow(mapped, vec3f(1.0 / 2.4)) * 1.055 - vec3f(0.055),
    mapped > vec3f(0.0031308),
  );
  return vec4f(srgb, 1.0);
}
`;
