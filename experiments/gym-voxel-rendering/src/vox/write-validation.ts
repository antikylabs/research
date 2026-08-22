type EncodableCell = Readonly<{
  x: number;
  y: number;
  z: number;
  paletteIndex: number;
}>;

export type VoxEncodableScene = Readonly<{
  dimensions: readonly [number, number, number];
  cells: readonly EncodableCell[];
}>;

const AXES = ['x', 'y', 'z'] as const;

/**
 * Reject values that MagicaVoxel's SIZE and XYZI chunks cannot represent before
 * Buffer byte assignment has a chance to truncate them.
 */
export function assertVoxEncodableScene(scene: VoxEncodableScene): void {
  for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
    const axis = AXES[axisIndex]!;
    const dimension = scene.dimensions[axisIndex]!;
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 256) {
      throw new RangeError(`VOX ${axis} dimension ${dimension} must be an integer in 1..256.`);
    }
  }

  for (let cellIndex = 0; cellIndex < scene.cells.length; cellIndex += 1) {
    const cell = scene.cells[cellIndex]!;
    for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
      const axis = AXES[axisIndex]!;
      const coordinate = cell[axis];
      const dimension = scene.dimensions[axisIndex]!;
      if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate >= dimension || coordinate > 255) {
        throw new RangeError(
          `VOX cell ${cellIndex} ${axis} coordinate ${coordinate} must be an integer in 0..${dimension - 1} (byte range 0..255).`,
        );
      }
    }
    if (!Number.isInteger(cell.paletteIndex) || cell.paletteIndex < 1 || cell.paletteIndex > 255) {
      throw new RangeError(
        `VOX cell ${cellIndex} palette index ${cell.paletteIndex} must be an integer in 1..255.`,
      );
    }
  }
}
