import type { CameraSnapshot } from '../camera/types.ts';
import type { VoxelScene } from '../scene/types.ts';

export type ApproachId = 'mesh' | 'instances' | 'raytrace';
export type PresentationStyle = 'physical' | 'graphic';

export type RenderStats = Readonly<{
  approach: ApproachId;
  implementation: string;
  voxels: number;
  primitives: number;
  drawCalls: number;
  oneTimeBytes: number;
  uploadBytesPerFrame: number;
  sampleCount?: number;
  resetReason?: string;
  detail: string;
}>;

export type VoxelApproach = Readonly<{
  frame(elapsedSeconds: number, camera: CameraSnapshot, style: PresentationStyle): void;
  stats(): RenderStats;
  dispose(): void;
}>;

export type ApproachOptions = Readonly<{
  canvas: HTMLCanvasElement;
  scene: VoxelScene;
  initialStyle: PresentationStyle;
  onError(error: Error): void;
}>;

export type ApproachFactory = (options: ApproachOptions) => Promise<VoxelApproach>;

