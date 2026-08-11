struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}

struct Particle {
  positionSize: vec4f,
  colorIntensity: vec4f,
}

struct ParticleOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

@group(0) @binding(1) var<storage, read> particles: array<Particle>;

@vertex
fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> ParticleOut {
var corner = vec2f(-1.0, -1.0);
  if (vertexIndex == 1u || vertexIndex == 4u) {
    corner = vec2f(1.0, -1.0);
  }
  if (vertexIndex == 2u || vertexIndex == 3u) {
    corner = vec2f(-1.0, 1.0);
  }
  if (vertexIndex == 5u) {
    corner = vec2f(1.0, 1.0);
  }

  let particle = particles[instanceIndex];
  var clip = frame.viewProjection * vec4f(particle.positionSize.xyz, 1.0);
  let projectionScale = 1.428148;
  let aspectCorrection = frame.params.w / frame.params.z;
  clip.x += corner.x * particle.positionSize.w * aspectCorrection * projectionScale;
  clip.y += corner.y * particle.positionSize.w * projectionScale;

  var output: ParticleOut;
  output.position = clip;
  output.color = particle.colorIntensity.rgb * particle.colorIntensity.w;
  return output;
}

@fragment
fn particleFragment(input: ParticleOut) -> @location(0) vec4f {
return vec4f(input.color, 1.0);
}
