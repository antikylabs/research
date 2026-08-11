fn fresnelSchlick(cosTheta: f32, reflectance: vec3f) -> vec3f {
  return reflectance +
    (vec3f(1.0) - reflectance) * pow(1.0 - cosTheta, 5.0);
}

fn distributionGGX(normal: vec3f, halfway: vec3f, roughness: f32) -> f32 {
  let alpha = roughness * roughness;
  let alphaSquared = alpha * alpha;
  let nDotH = max(dot(normal, halfway), 0.0);
  let denominator = nDotH * nDotH * (alphaSquared - 1.0) + 1.0;
  return alphaSquared /
    max(3.14159265 * denominator * denominator, 0.0001);
}

fn geometrySchlickGGX(nDotDirection: f32, roughness: f32) -> f32 {
  let radius = roughness + 1.0;
  let k = radius * radius * 0.125;
  return nDotDirection /
    max(nDotDirection * (1.0 - k) + k, 0.0001);
}

fn evaluatePbr(
  normal: vec3f,
  view: vec3f,
  light: vec3f,
  albedo: vec3f,
  metallic: f32,
  roughness: f32,
) -> vec3f {
  let halfway = normalize(view + light);
  let nDotL = max(dot(normal, light), 0.0);
  let nDotV = max(dot(normal, view), 0.0);
  let reflectance = mix(vec3f(0.04), albedo, metallic);
  let fresnel = fresnelSchlick(max(dot(halfway, view), 0.0), reflectance);
  let distribution = distributionGGX(normal, halfway, roughness);
  let geometry = geometrySchlickGGX(nDotV, roughness) *
    geometrySchlickGGX(nDotL, roughness);
  let specular = distribution * geometry * fresnel /
    max(4.0 * nDotV * nDotL, 0.001);
  let diffuse = (vec3f(1.0) - fresnel) *
    (1.0 - metallic) * albedo / 3.14159265;
  return (diffuse + specular) * nDotL;
}
