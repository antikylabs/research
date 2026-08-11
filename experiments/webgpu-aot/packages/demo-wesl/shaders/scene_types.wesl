struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  settings: vec4f,
}

struct Material {
  baseColorFactor: vec4f,
  factors: vec4f,
}

struct Light {
  positionRadius: vec4f,
  colorIntensity: vec4f,
}

fn worldPosition(frameData: Frame, position: vec3f) -> vec4f {
  return frameData.model * vec4f(position, 1.0);
}

fn clipPosition(frameData: Frame, position: vec3f) -> vec4f {
  return frameData.viewProjection * worldPosition(frameData, position);
}
