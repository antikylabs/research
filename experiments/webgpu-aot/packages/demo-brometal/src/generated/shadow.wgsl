struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

@vertex
fn shadowVertex(@location(0) position: vec3f) -> @builtin(position) vec4f {
return frame.viewProjection * frame.model * vec4f(position, 1.0);
}
