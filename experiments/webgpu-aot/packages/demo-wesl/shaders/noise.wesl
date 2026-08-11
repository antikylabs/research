fn random(coordinate: vec2f) -> f32 {
  return fract(sin(dot(coordinate, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn transition(
  point: vec2f,
  progress: f32,
  fromColor: vec3f,
  toColor: vec3f,
) -> vec3f {
  let size = vec2f(10.0);
  let smoothness = 0.5;
  let threshold = random(floor(size * point));
  let mask = smoothstep(
    0.0,
    -smoothness,
    threshold - (progress * (1.0 + smoothness)),
  );
  return mix(fromColor, toColor, mask);
}
