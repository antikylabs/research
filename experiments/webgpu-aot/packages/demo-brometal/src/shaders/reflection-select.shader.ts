import { compileShader, type ShaderDefinition } from "../compiler.js";

const definition = {
  declarations: [
    `struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var hdrTexture: texture_2d<f32>" },
    {
      group: 0,
      binding: 1,
      declaration: "var reflectionPyramid: texture_2d<f32>",
    },
    {
      group: 0,
      binding: 2,
      declaration: "var normalRoughnessTexture: texture_2d<f32>",
    },
    { group: 0, binding: 3, declaration: "var reflectionSampler: sampler" },
  ],
  functions: [
    {
      attributes: ["@vertex"],
      signature: "selectVertex(@builtin(vertex_index) index: u32) -> ScreenOut",
      body: `
  var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;`,
    },
    {
      attributes: ["@fragment"],
      signature: "selectFragment(input: ScreenOut) -> @location(0) vec4f",
      body: `
  let pixel = vec2i(floor(input.position.xy));
  let base = textureLoad(hdrTexture, pixel, 0).rgb;
  let roughness = textureLoad(normalRoughnessTexture, pixel, 0).w;
  let lod = clamp(roughness * roughness * 4.0, 0.0, 4.0);
  let reflection = textureSampleLevel(reflectionPyramid, reflectionSampler, input.uv, lod).rgb;
  return vec4f(base + reflection, 1.0);`,
    },
  ],
} satisfies ShaderDefinition;

export function buildReflectionSelectShader(): string {
  return compileShader(definition);
}
