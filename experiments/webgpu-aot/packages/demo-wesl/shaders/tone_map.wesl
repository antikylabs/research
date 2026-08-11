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
