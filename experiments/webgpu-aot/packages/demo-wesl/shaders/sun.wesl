struct SunLighting {
  nearViewProjection: mat4x4f,
  farViewProjection: mat4x4f,
  splitFadeFar: vec4f,
  biasesTexelSize: vec4f,
  cameraForwardNormalBias: vec4f,
  directionIntensity: vec4f,
  color: vec4f,
}

fn sampleSunCascade(
  shadowMap: texture_depth_2d,
  shadowSampler: sampler_comparison,
  viewProjection: mat4x4f,
  position: vec3f,
  bias: f32,
  texelSize: f32,
) -> f32 {
  let clip = viewProjection * vec4f(position, 1.0);
  if (clip.w <= 0.0) {
    return 1.0;
  }
  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let edgeGuard = texelSize * 1.5;
  if (
    uv.x <= edgeGuard || uv.x >= 1.0 - edgeGuard ||
    uv.y <= edgeGuard || uv.y >= 1.0 - edgeGuard ||
    ndc.z <= 0.0 || ndc.z >= 1.0
  ) {
    return 1.0;
  }

  var visibility = 0.0;
  for (var offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (var offsetX = -1; offsetX <= 1; offsetX += 1) {
      let offset = vec2f(f32(offsetX), f32(offsetY)) * texelSize;
      visibility += textureSampleCompareLevel(
        shadowMap,
        shadowSampler,
        uv + offset,
        ndc.z + bias,
      );
    }
  }
  return visibility / 9.0;
}

fn sunShadowVisibility(
  nearShadow: texture_depth_2d,
  farShadow: texture_depth_2d,
  shadowSampler: sampler_comparison,
  sun: SunLighting,
  cameraPosition: vec3f,
  position: vec3f,
  normal: vec3f,
) -> f32 {
  let receiverPosition =
    position + normal * sun.cameraForwardNormalBias.w;
  let viewDepth = dot(
    position - cameraPosition,
    sun.cameraForwardNormalBias.xyz,
  );
  if (viewDepth <= sun.splitFadeFar.y) {
    return sampleSunCascade(
      nearShadow,
      shadowSampler,
      sun.nearViewProjection,
      receiverPosition,
      sun.biasesTexelSize.x,
      sun.biasesTexelSize.z,
    );
  }
  if (viewDepth >= sun.splitFadeFar.z) {
    return sampleSunCascade(
      farShadow,
      shadowSampler,
      sun.farViewProjection,
      receiverPosition,
      sun.biasesTexelSize.y,
      sun.biasesTexelSize.z,
    );
  }

  let nearVisibility = sampleSunCascade(
    nearShadow,
    shadowSampler,
    sun.nearViewProjection,
    receiverPosition,
    sun.biasesTexelSize.x,
    sun.biasesTexelSize.z,
  );
  let farVisibility = sampleSunCascade(
    farShadow,
    shadowSampler,
    sun.farViewProjection,
    receiverPosition,
    sun.biasesTexelSize.y,
    sun.biasesTexelSize.z,
  );
  let fade = smoothstep(
    sun.splitFadeFar.y,
    sun.splitFadeFar.z,
    viewDepth,
  );
  return mix(nearVisibility, farVisibility, fade);
}
