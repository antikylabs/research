struct AntikyShadowFrame {
  lightViewProjection: mat4x4f,
  model: mat4x4f,
}

@group(0) @binding(0) var<uniform> frame: AntikyShadowFrame;

struct shadowVertex_Output {
  @builtin(position) position: vec4f,
}

@vertex fn shadowVertex(@location(0) position: vec3f) -> shadowVertex_Output {
  let world = (frame.model * vec4f(position, 1f));
  return shadowVertex_Output((frame.lightViewProjection * world));
}

@fragment fn shadowFragment() -> @location(0) vec4f {
  return vec4f(1);
}
