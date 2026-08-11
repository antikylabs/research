@group(0) @binding(0) var ambientInput: texture_2d<f32>;
@group(0) @binding(1) var ambientOutput: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> blurSettings: vec4f;

@compute @workgroup_size(8, 8)
fn blurAmbient(@builtin(global_invocation_id) invocation: vec3u) {
  let size = vec2u(blurSettings.xy);
  if (invocation.x >= size.x || invocation.y >= size.y) {
    return;
  }
  let pixel = vec2i(invocation.xy);
  let maximum = vec2i(size) - vec2i(1);
  let direction = vec2i(blurSettings.zw);
  var color = textureLoad(ambientInput, pixel, 0) * 0.227027;
  color += textureLoad(
    ambientInput,
    clamp(pixel + direction, vec2i(0), maximum),
    0,
  ) * 0.1945946;
  color += textureLoad(
    ambientInput,
    clamp(pixel - direction, vec2i(0), maximum),
    0,
  ) * 0.1945946;
  color += textureLoad(
    ambientInput,
    clamp(pixel + direction * 2, vec2i(0), maximum),
    0,
  ) * 0.1216216;
  color += textureLoad(
    ambientInput,
    clamp(pixel - direction * 2, vec2i(0), maximum),
    0,
  ) * 0.1216216;
  color += textureLoad(
    ambientInput,
    clamp(pixel + direction * 3, vec2i(0), maximum),
    0,
  ) * 0.0702703;
  color += textureLoad(
    ambientInput,
    clamp(pixel - direction * 3, vec2i(0), maximum),
    0,
  ) * 0.0702703;
  textureStore(ambientOutput, pixel, color);
}
