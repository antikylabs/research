import { mat4 } from "wgpu-matrix";

import type { BroMetalPrimitive } from "./scene.js";
import {
  BROMETAL_CAMERA,
  BROMETAL_SUN,
  type BroMetalVector3,
} from "./sun.js";

export const BROMETAL_SHADOW_CASCADE_COUNT =
  BROMETAL_SUN.shadow.cascadeCount;
export const BROMETAL_SHADOW_RESOLUTION = BROMETAL_SUN.shadow.resolution;

export interface BroMetalShadowCascadePlan {
  readonly bias: number;
  readonly farDistance: number;
  readonly frustumCorners: readonly BroMetalVector3[];
  readonly nearDistance: number;
  readonly orthographicSize: number;
  readonly viewProjection: Float32Array;
}

export interface BroMetalShadowPlan {
  readonly cameraForward: BroMetalVector3;
  readonly cascades: readonly [
    BroMetalShadowCascadePlan,
    BroMetalShadowCascadePlan,
  ];
  readonly direction: BroMetalVector3;
  readonly fadeEndDistance: number;
  readonly fadeStartDistance: number;
  readonly splitDistance: number;
  readonly splitNormalized: number;
}

export interface BroMetalShadowCascadeResources {
  readonly bindGroup: GPUBindGroup;
  readonly buffer: GPUBuffer;
  readonly map: GPUTexture;
  readonly view: GPUTextureView;
}

export interface BroMetalShadowResources {
  readonly backPipeline: GPURenderPipeline;
  readonly cascades: readonly [
    BroMetalShadowCascadeResources,
    BroMetalShadowCascadeResources,
  ];
  readonly doublePipeline: GPURenderPipeline;
  readonly estimatedBytes: number;
  readonly lightingBuffer: GPUBuffer;
  readonly sampler: GPUSampler;
  destroy(): void;
}

const addScaled = (
  origin: BroMetalVector3,
  direction: BroMetalVector3,
  scale: number,
): BroMetalVector3 => [
  origin[0] + direction[0] * scale,
  origin[1] + direction[1] * scale,
  origin[2] + direction[2] * scale,
];

const cross = (
  left: BroMetalVector3,
  right: BroMetalVector3,
): BroMetalVector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const dot = (left: BroMetalVector3, right: BroMetalVector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const normalize = (value: BroMetalVector3): BroMetalVector3 => {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
};

const subtract = (
  left: BroMetalVector3,
  right: BroMetalVector3,
): BroMetalVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const distance = (
  left: BroMetalVector3,
  right: BroMetalVector3,
): number => Math.hypot(...subtract(left, right));

function frustumSliceCorners(
  aspect: number,
  nearDistance: number,
  farDistance: number,
  cameraForward: BroMetalVector3,
): readonly BroMetalVector3[] {
  const cameraRight = normalize(cross(cameraForward, BROMETAL_CAMERA.up));
  const cameraUp = normalize(cross(cameraRight, cameraForward));
  const tangent = Math.tan(BROMETAL_CAMERA.fieldOfViewRadians / 2);
  const planeCorners = (distanceFromCamera: number) => {
    const center = addScaled(
      BROMETAL_CAMERA.position,
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
  cameraForward: BroMetalVector3,
): BroMetalShadowCascadePlan {
  const corners = frustumSliceCorners(
    aspect,
    nearDistance,
    farDistance,
    cameraForward,
  );
  const lightZ = BROMETAL_SUN.direction;
  const lightX = normalize(cross(BROMETAL_CAMERA.up, lightZ));
  const lightY = normalize(cross(lightZ, lightX));
  const lightCorners = corners.map((corner) => [
    dot(lightX, corner),
    dot(lightY, corner),
    dot(lightZ, corner),
  ] as const);
  const minX = Math.min(...lightCorners.map(([x]) => x));
  const maxX = Math.max(...lightCorners.map(([x]) => x));
  const minY = Math.min(...lightCorners.map(([, y]) => y));
  const maxY = Math.max(...lightCorners.map(([, y]) => y));
  const minZ = Math.min(...lightCorners.map(([, , z]) => z));
  const maxZ = Math.max(...lightCorners.map(([, , z]) => z));

  const farDiagonal = distance(corners[4], corners[6]);
  const sliceDiagonal = distance(corners[4], corners[2]);
  const cameraRange = BROMETAL_CAMERA.far - BROMETAL_CAMERA.near;
  const linearFar = farDistance / cameraRange;
  const fadeMargin = 0.25 * linearFar * linearFar * cameraRange;
  let orthographicSize = Math.max(
    farDiagonal,
    sliceDiagonal,
    maxX - minX,
    maxY - minY,
  ) + fadeMargin;
  const texelSize = orthographicSize / BROMETAL_SHADOW_RESOLUTION;
  const centerX = Math.floor(((minX + maxX) * 0.5) / texelSize) * texelSize;
  const centerY = Math.floor(((minY + maxY) * 0.5) / texelSize) * texelSize;
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

  const eyeZ = maxZ + BROMETAL_SUN.shadow.lightMargin;
  const eye: BroMetalVector3 = [
    lightX[0] * centerX + lightY[0] * centerY + lightZ[0] * eyeZ,
    lightX[1] * centerX + lightY[1] * centerY + lightZ[1] * eyeZ,
    lightX[2] * centerX + lightY[2] * centerY + lightZ[2] * eyeZ,
  ];
  const target = addScaled(eye, lightZ, -1);
  const view = mat4.lookAt(eye, target, BROMETAL_CAMERA.up);
  const projection = mat4.ortho(
    -orthographicSize / 2,
    orthographicSize / 2,
    -orthographicSize / 2,
    orthographicSize / 2,
    0.1,
    maxZ - minZ + BROMETAL_SUN.shadow.lightMargin * 2,
  );

  return {
    bias,
    farDistance,
    frustumCorners: corners,
    nearDistance,
    orthographicSize,
    viewProjection: mat4.multiply(projection, view),
  };
}

export function createBroMetalShadowPlan(aspect: number): BroMetalShadowPlan {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("BroMetal shadow plan requires a positive finite aspect");
  }
  const { far, near, position, target } = BROMETAL_CAMERA;
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
  const cascades = [
    fitCascade(
      aspect,
      near,
      splitDistance,
      BROMETAL_SUN.shadow.biases[0],
      cameraForward,
    ),
    fitCascade(
      aspect,
      splitDistance,
      far,
      BROMETAL_SUN.shadow.biases[1],
      cameraForward,
    ),
  ] as const;
  return {
    cameraForward,
    cascades,
    direction: BROMETAL_SUN.direction,
    fadeEndDistance,
    fadeStartDistance,
    splitDistance,
    splitNormalized,
  };
}

function encodeCascade(
  encoder: GPUCommandEncoder,
  primitives: readonly BroMetalPrimitive[],
  resources: BroMetalShadowResources,
  cascade: BroMetalShadowCascadeResources,
  index: number,
): void {
  const name = index === 0 ? "near" : "far";
  const pass = encoder.beginRenderPass({
    label: `BroMetal 103-primitive ${name} directional shadow cascade`,
    colorAttachments: [],
    depthStencilAttachment: {
      view: cascade.view,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });
  pass.setBindGroup(0, cascade.bindGroup);
  let activePipeline: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? resources.doublePipeline
      : resources.backPipeline;
    if (pipeline !== activePipeline) {
      pass.setPipeline(pipeline);
      activePipeline = pipeline;
    }
    pass.setVertexBuffer(
      0,
      primitive.positions.buffer,
      primitive.positions.offset,
    );
    pass.setIndexBuffer(
      primitive.indexBuffer,
      "uint16",
      primitive.indexOffset,
    );
    pass.drawIndexed(primitive.indexCount);
  }
  pass.end();
}

export function encodeBroMetalShadowPass(
  encoder: GPUCommandEncoder,
  primitives: readonly BroMetalPrimitive[],
  resources: BroMetalShadowResources,
): void {
  resources.cascades.forEach((cascade, index) => {
    encodeCascade(encoder, primitives, resources, cascade, index);
  });
}

export async function createBroMetalShadowResources(
  device: GPUDevice,
  module: GPUShaderModule,
  frameLayout: GPUBindGroupLayout,
  model: Float32Array,
  aspect: number,
): Promise<BroMetalShadowResources> {
  const plan = createBroMetalShadowPlan(aspect);
  const createCascade = (
    cascade: BroMetalShadowCascadePlan,
    index: number,
  ): BroMetalShadowCascadeResources => {
    const values = new Float32Array(40);
    values.set(cascade.viewProjection, 0);
    values.set(model, 16);
    const buffer = device.createBuffer({
      label: `BroMetal ${index === 0 ? "near" : "far"} shadow frame uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(buffer, 0, values);
    const bindGroup = device.createBindGroup({
      label: `BroMetal ${index === 0 ? "near" : "far"} shadow frame bind group`,
      layout: frameLayout,
      entries: [{ binding: 0, resource: { buffer } }],
    });
    const map = device.createTexture({
      label: `BroMetal ${index === 0 ? "near" : "far"} directional shadow map`,
      size: [BROMETAL_SHADOW_RESOLUTION, BROMETAL_SHADOW_RESOLUTION],
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { bindGroup, buffer, map, view: map.createView() };
  };
  const cascades = [
    createCascade(plan.cascades[0], 0),
    createCascade(plan.cascades[1], 1),
  ] as const;

  const lightingValues = new Float32Array(44);
  lightingValues.set(plan.cascades[0].viewProjection, 0);
  lightingValues.set(plan.cascades[1].viewProjection, 16);
  lightingValues.set([
    plan.splitDistance,
    plan.fadeStartDistance,
    plan.fadeEndDistance,
    BROMETAL_CAMERA.far,
  ], 32);
  lightingValues.set([
    plan.cascades[0].bias,
    plan.cascades[1].bias,
    1 / BROMETAL_SHADOW_RESOLUTION,
    BROMETAL_SHADOW_RESOLUTION,
  ], 36);
  lightingValues.set(
    [...plan.cameraForward, BROMETAL_SUN.shadow.normalBias],
    40,
  );
  const lightingBuffer = device.createBuffer({
    label: "BroMetal cascaded sun lighting uniform",
    size: lightingValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(lightingBuffer, 0, lightingValues);

  const sampler = device.createSampler({
    label: "BroMetal cascaded shadow comparison sampler",
    compare: "less-equal",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const descriptor = (
    cullMode: GPUCullMode,
  ): GPURenderPipelineDescriptor => ({
    label: `BroMetal AOT directional shadow ${cullMode}`,
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout] }),
    vertex: {
      module,
      entryPoint: "shadowVertex",
      buffers: [
        {
          arrayStride: 12,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
          ],
        },
      ],
    },
    primitive: { topology: "triangle-list", frontFace: "ccw", cullMode },
    depthStencil: {
      format: "depth32float",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });
  const [backPipeline, doublePipeline] = await Promise.all([
    device.createRenderPipelineAsync(descriptor("back")),
    device.createRenderPipelineAsync(descriptor("none")),
  ]);
  let destroyed = false;
  return {
    backPipeline,
    cascades,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const cascade of cascades) {
        cascade.buffer.destroy();
        cascade.map.destroy();
      }
      lightingBuffer.destroy();
    },
    doublePipeline,
    estimatedBytes:
      BROMETAL_SHADOW_CASCADE_COUNT *
        BROMETAL_SHADOW_RESOLUTION *
        BROMETAL_SHADOW_RESOLUTION *
        4 +
      cascades.length * 40 * Float32Array.BYTES_PER_ELEMENT +
      lightingValues.byteLength,
    lightingBuffer,
    sampler,
  };
}
