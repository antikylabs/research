/**
 * MagicaVoxel's official fallback palette, generated from the compact color-cube and ramp pattern
 * published with the MIT-licensed format specification.
 *
 * Index zero is transparent/unused. Indices 1..216 form a 6³ RGB cube; the remaining entries are
 * red, green, blue, and neutral ramps. See THIRD_PARTY_NOTICES.md.
 */
export function createDefaultPalette(): readonly (readonly [number, number, number, number])[] {
  const palette: [number, number, number, number][] = [[0, 0, 0, 0]];
  const levels = [255, 204, 153, 102, 51, 0] as const;
  for (const red of levels) {
    for (const green of levels) {
      for (const blue of levels) {
        // The published table omits opaque black from the 6³ cube: index zero already carries the
        // empty entry, leaving 215 cube colors plus four ten-step ramps.
        if (red !== 0 || green !== 0 || blue !== 0) palette.push([red, green, blue, 255]);
      }
    }
  }
  const ramps = [238, 221, 187, 170, 136, 119, 85, 68, 34, 17] as const;
  for (const value of ramps) palette.push([value, 0, 0, 255]);
  for (const value of ramps) palette.push([0, value, 0, 255]);
  for (const value of ramps) palette.push([0, 0, value, 255]);
  for (const value of ramps) palette.push([value, value, value, 255]);
  if (palette.length !== 256) throw new Error(`Default VOX palette has ${palette.length} entries`);
  return palette;
}
