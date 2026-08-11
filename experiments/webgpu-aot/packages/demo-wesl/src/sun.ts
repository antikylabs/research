import { mat4 } from "wgpu-matrix";

export type WeslVector3 = readonly [number, number, number];

const normalize = (value: WeslVector3): WeslVector3 => {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
};

const subtract = (left: WeslVector3, right: WeslVector3): WeslVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const SUN_POSITION = [0.1, 100, 0.1] as const;
const SUN_TARGET = [0, 2, 0] as const;

export const WESL_CAMERA = {
  far: 100,
  fieldOfViewRadians: (70 * Math.PI) / 180,
  near: 0.1,
  position: [9.3, 3.4, -0.35] as const,
  target: [0, 2, 0] as const,
  up: [0, 1, 0] as const,
} as const;

export const WESL_SUN = {
  color: [0.2156, 0.2627, 0.3333] as const,
  direction: normalize(subtract(SUN_POSITION, SUN_TARGET)),
  intensity: 2,
  position: SUN_POSITION,
  shadow: {
    biases: [-0.00015, -0.0003] as const,
    cascadeCount: 2,
    lightMargin: 20,
    normalBias: 0.015,
    resolution: 4096,
  },
  target: SUN_TARGET,
} as const;

export interface WeslSunCascadePlan {
  readonly bias: number;
  readonly farDistance: number;
  readonly frustumCorners: readonly WeslVector3[];
  readonly nearDistance: number;
  readonly orthographicSize: number;
  readonly viewProjection: Float32Array;
}

export interface WeslSunPlan {
  readonly cameraForward: WeslVector3;
  readonly cascades: readonly [WeslSunCascadePlan, WeslSunCascadePlan];
  readonly direction: WeslVector3;
  readonly fadeEndDistance: number;
  readonly fadeStartDistance: number;
  readonly splitDistance: number;
  readonly splitNormalized: number;
}

const addScaled = (
  origin: WeslVector3,
  direction: WeslVector3,
  scale: number,
): WeslVector3 => [
  origin[0] + direction[0] * scale,
  origin[1] + direction[1] * scale,
  origin[2] + direction[2] * scale,
];

const cross = (left: WeslVector3, right: WeslVector3): WeslVector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const dot = (left: WeslVector3, right: WeslVector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const distance = (left: WeslVector3, right: WeslVector3): number =>
  Math.hypot(...subtract(left, right));

function frustumSliceCorners(
  aspect: number,
  nearDistance: number,
  farDistance: number,
  cameraForward: WeslVector3,
): readonly WeslVector3[] {
  const cameraRight = normalize(cross(cameraForward, WESL_CAMERA.up));
  const cameraUp = normalize(cross(cameraRight, cameraForward));
  const tangent = Math.tan(WESL_CAMERA.fieldOfViewRadians / 2);
  const planeCorners = (distanceFromCamera: number): readonly WeslVector3[] => {
    const center = addScaled(
      WESL_CAMERA.position,
      cameraForward,
      distanceFromCamera,
    );
    const halfHeight = tangent * distanceFromCamera;
    const halfWidth = halfHeight * aspect;
    return [
      addScaled(addScaled(center, cameraRight, halfWidth), cameraUp, halfHeight),
      addScaled(addScaled(center, cameraRight, halfWidth), cameraUp, -halfHeight),
      addScaled(addScaled(center, cameraRight, -halfWidth), cameraUp, -halfHeight),
      addScaled(addScaled(center, cameraRight, -halfWidth), cameraUp, halfHeight),
    ];
  };
  return [...planeCorners(nearDistance), ...planeCorners(farDistance)];
}

function fitCascade(
  aspect: number,
  nearDistance: number,
  farDistance: number,
  bias: number,
  cameraForward: WeslVector3,
): WeslSunCascadePlan {
  const frustumCorners = frustumSliceCorners(
    aspect,
    nearDistance,
    farDistance,
    cameraForward,
  );
  const lightZ = WESL_SUN.direction;
  const lightX = normalize(cross(WESL_CAMERA.up, lightZ));
  const lightY = normalize(cross(lightZ, lightX));
  const lightCorners = frustumCorners.map(
    (corner) =>
      [dot(lightX, corner), dot(lightY, corner), dot(lightZ, corner)] as const,
  );
  const minX = Math.min(...lightCorners.map(([x]) => x));
  const maxX = Math.max(...lightCorners.map(([x]) => x));
  const minY = Math.min(...lightCorners.map(([, y]) => y));
  const maxY = Math.max(...lightCorners.map(([, y]) => y));
  const minZ = Math.min(...lightCorners.map(([, , z]) => z));
  const maxZ = Math.max(...lightCorners.map(([, , z]) => z));

  const farDiagonal = distance(frustumCorners[4]!, frustumCorners[6]!);
  const sliceDiagonal = distance(frustumCorners[4]!, frustumCorners[2]!);
  const cameraRange = WESL_CAMERA.far - WESL_CAMERA.near;
  const linearFar = farDistance / cameraRange;
  const fadeMargin = 0.25 * linearFar * linearFar * cameraRange;
  let orthographicSize =
    Math.max(
      farDiagonal,
      sliceDiagonal,
      maxX - minX,
      maxY - minY,
    ) + fadeMargin;
  const texelSize = orthographicSize / WESL_SUN.shadow.resolution;
  const centerX =
    Math.floor(((minX + maxX) * 0.5) / texelSize) * texelSize;
  const centerY =
    Math.floor(((minY + maxY) * 0.5) / texelSize) * texelSize;
  const requiredHalfExtent = Math.max(
    ...lightCorners.flatMap(([x, y]) => [
      Math.abs(x - centerX),
      Math.abs(y - centerY),
    ]),
  );
  orthographicSize = Math.max(
    orthographicSize,
    requiredHalfExtent * 2 + texelSize * 2,
  );

  const eyeZ = maxZ + WESL_SUN.shadow.lightMargin;
  const eye: WeslVector3 = [
    lightX[0] * centerX + lightY[0] * centerY + lightZ[0] * eyeZ,
    lightX[1] * centerX + lightY[1] * centerY + lightZ[1] * eyeZ,
    lightX[2] * centerX + lightY[2] * centerY + lightZ[2] * eyeZ,
  ];
  const target = addScaled(eye, lightZ, -1);
  const view = mat4.lookAt(eye, target, WESL_CAMERA.up);
  const projection = mat4.ortho(
    -orthographicSize / 2,
    orthographicSize / 2,
    -orthographicSize / 2,
    orthographicSize / 2,
    0.1,
    maxZ - minZ + WESL_SUN.shadow.lightMargin * 2,
  );

  return {
    bias,
    farDistance,
    frustumCorners,
    nearDistance,
    orthographicSize,
    viewProjection: mat4.multiply(projection, view),
  };
}

export function createWeslSunPlan(aspect: number): WeslSunPlan {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("WESL sun plan requires a positive finite aspect");
  }
  const { far, near, position, target } = WESL_CAMERA;
  const logarithmicSplit = (near * Math.sqrt(far / near)) / far;
  const uniformSplit = (near + (far - near) / 2) / far;
  const splitNormalized = (logarithmicSplit + uniformSplit) / 2;
  const splitDistance = splitNormalized * far;
  const fadeMarginNormalized = 0.25 * splitNormalized * splitNormalized;
  const fadeStartDistance =
    (splitNormalized - fadeMarginNormalized / 2) * far;
  const fadeEndDistance =
    (splitNormalized + fadeMarginNormalized / 2) * far;
  const cameraForward = normalize(subtract(target, position));
  return {
    cameraForward,
    cascades: [
      fitCascade(
        aspect,
        near,
        splitDistance,
        WESL_SUN.shadow.biases[0],
        cameraForward,
      ),
      fitCascade(
        aspect,
        splitDistance,
        far,
        WESL_SUN.shadow.biases[1],
        cameraForward,
      ),
    ],
    direction: WESL_SUN.direction,
    fadeEndDistance,
    fadeStartDistance,
    splitDistance,
    splitNormalized,
  };
}

export function createWeslSunLightingValues(
  plan: WeslSunPlan,
): Float32Array<ArrayBuffer> {
  const values = new Float32Array(52);
  values.set(plan.cascades[0].viewProjection, 0);
  values.set(plan.cascades[1].viewProjection, 16);
  values.set(
    [
      plan.splitDistance,
      plan.fadeStartDistance,
      plan.fadeEndDistance,
      WESL_CAMERA.far,
    ],
    32,
  );
  values.set(
    [
      plan.cascades[0].bias,
      plan.cascades[1].bias,
      1 / WESL_SUN.shadow.resolution,
      WESL_SUN.shadow.resolution,
    ],
    36,
  );
  values.set([...plan.cameraForward, WESL_SUN.shadow.normalBias], 40);
  values.set([...plan.direction, WESL_SUN.intensity], 44);
  values.set([...WESL_SUN.color, 0], 48);
  return values;
}
