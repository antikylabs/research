struct AntikyParticle {
  positionSize: vec4f,
  colorIntensity: vec4f,
}

@group(0) @binding(1) var<storage, read> particles: array<AntikyParticle, 406>;

struct AntikyParticleFrame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  nearShadowViewProjection: mat4x4f,
  farShadowViewProjection: mat4x4f,
  cameraPosition: vec4f,
  settings: vec4f,
}

@group(0) @binding(0) var<uniform> frame: AntikyParticleFrame;

struct particleVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> particleVertex_Output {
  var corner = vec2f(-1);
  if (((vertexIndex == 1u) || (vertexIndex == 4u))) {
    corner = vec2f(1, -1);
  }
  if (((vertexIndex == 2u) || (vertexIndex == 3u))) {
    corner = vec2f(-1, 1);
  }
  if ((vertexIndex == 5u)) {
    corner = vec2f(1);
  }
  let particle = (&particles[instanceIndex]);
  var clip = (frame.viewProjection * vec4f((*particle).positionSize.xyz, 1f));
  let aspectCorrection = (frame.settings.z / frame.settings.y);
  const projectionScale = 1.4281480312347412f;
  clip.x += (((corner.x * (*particle).positionSize.w) * aspectCorrection) * projectionScale);
  clip.y += ((corner.y * (*particle).positionSize.w) * projectionScale);
  return particleVertex_Output(clip, (*particle).colorIntensity.rgb);
}

struct particleFragment_Input {
  @location(0) color: vec3f,
}

@fragment fn particleFragment(_arg_0: particleFragment_Input) -> @location(0) vec4f {
  return vec4f(_arg_0.color, 1f);
}
