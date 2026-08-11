import { mat4 } from "wgpu-matrix";

export type AntikyVector3 = readonly [number, number, number];

const normalize = (value: AntikyVector3): AntikyVector3 => {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
};

const subtract = (
  left: AntikyVector3,
  right: AntikyVector3,
): AntikyVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const SUN_POSITION = [0.1, 100, 0.1] as const;
const SUN_TARGET = [0, 2, 0] as const;

export const ANTIKY_CAMERA = {
  far: 100,
  fieldOfViewRadians: (70 * Math.PI) / 180,
  near: 0.1,
  position: [9.3, 3.4, -0.35] as const,
  target: [0, 2, 0] as const,
  up: [0, 1, 0] as const,
} as const;

export const ANTIKY_SUN = {
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

export const ANTIKY_SHADOW_CASCADE_COUNT = ANTIKY_SUN.shadow.cascadeCount;
export const ANTIKY_SHADOW_RESOLUTION = ANTIKY_SUN.shadow.resolution;

export interface AntikySunCascadePlan {
  readonly bias: number;
  readonly farDistance: number;
  readonly frustumCorners: readonly AntikyVector3[];
  readonly nearDistance: number;
  readonly orthographicSize: number;
  readonly viewProjection: Float32Array;
}

export interface AntikySunPlan {
  readonly cameraForward: AntikyVector3;
  readonly cascades: readonly [AntikySunCascadePlan, AntikySunCascadePlan];
  readonly direction: AntikyVector3;
  readonly fadeEndDistance: number;
  readonly fadeStartDistance: number;
  readonly resolution: number;
  readonly splitDistance: number;
  readonly splitNormalized: number;
}

const addScaled = (
  origin: AntikyVector3,
  direction: AntikyVector3,
  scale: number,
): AntikyVector3 => [
  origin[0] + direction[0] * scale,
  origin[1] + direction[1] * scale,
  origin[2] + direction[2] * scale,
];

const cross = (
  left: AntikyVector3,
  right: AntikyVector3,
): AntikyVector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const dot = (left: AntikyVector3, right: AntikyVector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const distance = (left: AntikyVector3, right: AntikyVector3): number =>
  Math.hypot(...subtract(left, right));

function frustumSliceCorners(
  aspect: number,
  nearDistance: number,
  farDistance: number,
  cameraForward: AntikyVector3,
): readonly AntikyVector3[] {
  const cameraRight = normalize(cross(cameraForward, ANTIKY_CAMERA.up));
  const cameraUp = normalize(cross(cameraRight, cameraForward));
  const tangent = Math.tan(ANTIKY_CAMERA.fieldOfViewRadians / 2);
  const planeCorners = (
    distanceFromCamera: number,
  ): readonly AntikyVector3[] => {
    const center = addScaled(
      ANTIKY_CAMERA.position,
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
  cameraForward: AntikyVector3,
  resolution: number,
): AntikySunCascadePlan {
  const frustumCorners = frustumSliceCorners(
    aspect,
    nearDistance,
    farDistance,
    cameraForward,
  );
  const lightZ = ANTIKY_SUN.direction;
  const lightX = normalize(cross(ANTIKY_CAMERA.up, lightZ));
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
  const cameraRange = ANTIKY_CAMERA.far - ANTIKY_CAMERA.near;
  const linearFar = farDistance / cameraRange;
  const fadeMargin = 0.25 * linearFar * linearFar * cameraRange;
  let orthographicSize =
    Math.max(
      farDiagonal,
      sliceDiagonal,
      maxX - minX,
      maxY - minY,
    ) + fadeMargin;
  const texelSize = orthographicSize / resolution;
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

  const eyeZ = maxZ + ANTIKY_SUN.shadow.lightMargin;
  const eye: AntikyVector3 = [
    lightX[0] * centerX + lightY[0] * centerY + lightZ[0] * eyeZ,
    lightX[1] * centerX + lightY[1] * centerY + lightZ[1] * eyeZ,
    lightX[2] * centerX + lightY[2] * centerY + lightZ[2] * eyeZ,
  ];
  const target = addScaled(eye, lightZ, -1);
  const view = mat4.lookAt(eye, target, ANTIKY_CAMERA.up);
  const projection = mat4.ortho(
    -orthographicSize / 2,
    orthographicSize / 2,
    -orthographicSize / 2,
    orthographicSize / 2,
    0.1,
    maxZ - minZ + ANTIKY_SUN.shadow.lightMargin * 2,
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

export function createAntikySunPlan(
  aspect: number,
  resolution: number = ANTIKY_SHADOW_RESOLUTION,
): AntikySunPlan {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Antiky sun plan requires a positive finite aspect");
  }
  if (!Number.isInteger(resolution) || resolution <= 0) {
    throw new Error("Antiky sun plan requires a positive integer resolution");
  }

  const { far, near, position, target } = ANTIKY_CAMERA;
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
        ANTIKY_SUN.shadow.biases[0],
        cameraForward,
        resolution,
      ),
      fitCascade(
        aspect,
        splitDistance,
        far,
        ANTIKY_SUN.shadow.biases[1],
        cameraForward,
        resolution,
      ),
    ],
    direction: ANTIKY_SUN.direction,
    fadeEndDistance,
    fadeStartDistance,
    resolution,
    splitDistance,
    splitNormalized,
  };
}
