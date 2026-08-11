export function estimateTextureBytes(descriptor) {
  const bytesPerPixel = {
    r8sint: 1, r8snorm: 1, r8uint: 1, r8unorm: 1,
    r16float: 2, r16sint: 2, r16uint: 2,
    rg8sint: 2, rg8snorm: 2, rg8uint: 2, rg8unorm: 2,
    depth16unorm: 2,
    bgra8unorm: 4, "bgra8unorm-srgb": 4,
    depth24plus: 4, "depth24plus-stencil8": 4, depth32float: 4,
    r32float: 4, r32sint: 4, r32uint: 4,
    rg16float: 4, rg16sint: 4, rg16uint: 4,
    rgb10a2uint: 4, rgb10a2unorm: 4, rg11b10ufloat: 4, rgb9e5ufloat: 4,
    rgba8sint: 4, rgba8snorm: 4, rgba8uint: 4, rgba8unorm: 4,
    "rgba8unorm-srgb": 4,
    "depth32float-stencil8": 8,
    rg32float: 8, rg32sint: 8, rg32uint: 8,
    rgba16float: 8, rgba16sint: 8, rgba16uint: 8,
    rgba32float: 16, rgba32sint: 16, rgba32uint: 16,
  }[descriptor.format];
  if (bytesPerPixel === undefined) {
    return null;
  }
  const size = descriptor.size ?? [1, 1, 1];
  const width = Number(size.width ?? size[0] ?? 1);
  const height = Number(size.height ?? size[1] ?? 1);
  const depthOrArrayLayers = Number(
    size.depthOrArrayLayers ?? size[2] ?? 1,
  );
  const mipLevelCount = Number(descriptor.mipLevelCount ?? 1);
  const sampleCount = Number(descriptor.sampleCount ?? 1);
  let total = 0;
  for (let mip = 0; mip < mipLevelCount; mip += 1) {
    const mipDepth =
      descriptor.dimension === "3d"
        ? Math.max(1, Math.floor(depthOrArrayLayers / 2 ** mip))
        : depthOrArrayLayers;
    total +=
      Math.max(1, Math.floor(width / 2 ** mip)) *
      Math.max(1, Math.floor(height / 2 ** mip)) *
      mipDepth *
      bytesPerPixel *
      sampleCount;
  }
  return total;
}

export function diffGpuCounters(before, after, frameCount) {
  const totals = {};
  const perFrame = {};
  const frames = Math.max(1, frameCount);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const difference = Number(after[key] ?? 0) - Number(before[key] ?? 0);
    totals[key] = difference;
    perFrame[key] = Number((difference / frames).toFixed(6));
  }
  return { frames, perFrame, totals };
}

export function calculatePixelMetrics(pixels, width, height) {
  const spatialColumns = 8;
  const spatialRows = 5;
  const regions = {
    center: [0.2, 0.15, 0.8, 0.85],
    floor: [0.2, 0.56, 0.8, 0.96],
    full: [0, 0, 1, 1],
    leftFire: [0.34, 0.28, 0.47, 0.58],
    rightFire: [0.55, 0.28, 0.68, 0.58],
    upperGallery: [0.34, 0.02, 0.68, 0.38],
  };
  const round = (value) => Number(value.toFixed(6));
  const luminanceAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return (
      (0.2126 * pixels[offset] +
        0.7152 * pixels[offset + 1] +
        0.0722 * pixels[offset + 2]) /
      255
    );
  };
  const analyze = ([left, top, right, bottom]) => {
    const startX = Math.min(width - 1, Math.floor(left * width));
    const startY = Math.min(height - 1, Math.floor(top * height));
    const endX = Math.max(startX + 1, Math.min(width, Math.ceil(right * width)));
    const endY = Math.max(startY + 1, Math.min(height, Math.ceil(bottom * height)));
    const histogram = new Array(16).fill(0);
    const luminances = [];
    const rgbTotal = [0, 0, 0];
    let blackPixels = 0;
    let edgeEnergy = 0;
    let edgeCount = 0;
    let highlightPixels = 0;
    let saturationTotal = 0;
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset] / 255;
        const green = pixels[offset + 1] / 255;
        const blue = pixels[offset + 2] / 255;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const luminance = luminanceAt(x, y);
        luminances.push(luminance);
        histogram[Math.min(15, Math.floor(luminance * 16))] += 1;
        rgbTotal[0] += red;
        rgbTotal[1] += green;
        rgbTotal[2] += blue;
        saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum;
        blackPixels += luminance < 0.02 ? 1 : 0;
        highlightPixels += maximum > 0.98 ? 1 : 0;
        if (x > startX) {
          edgeEnergy += Math.abs(luminance - luminanceAt(x - 1, y));
          edgeCount += 1;
        }
        if (y > startY) {
          edgeEnergy += Math.abs(luminance - luminanceAt(x, y - 1));
          edgeCount += 1;
        }
      }
    }
    luminances.sort((first, second) => first - second);
    const pixelCount = luminances.length;
    const mean = luminances.reduce((sum, value) => sum + value, 0) / pixelCount;
    const variance =
      luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      pixelCount;
    const percentile = (fraction) =>
      luminances[Math.floor((pixelCount - 1) * fraction)];
    const p10 = percentile(0.1);
    const p90 = percentile(0.9);
    return {
      blackFraction: round(blackPixels / pixelCount),
      contrast: round(Math.sqrt(variance)),
      dynamicRange: round(p90 - p10),
      edgeEnergy: round(edgeCount === 0 ? 0 : edgeEnergy / edgeCount),
      highlightFraction: round(highlightPixels / pixelCount),
      histogram,
      luminanceMean: round(mean),
      luminanceMedian: round(percentile(0.5)),
      luminanceP10: round(p10),
      luminanceP90: round(p90),
      meanRgb: rgbTotal.map((value) => round(value / pixelCount)),
      meanSaturation: round(saturationTotal / pixelCount),
      pixelCount,
    };
  };
  const regionMetrics = Object.fromEntries(
    Object.entries(regions).map(([name, bounds]) => [name, analyze(bounds)]),
  );
  const spatialCells = [];
  for (let row = 0; row < spatialRows; row += 1) {
    for (let column = 0; column < spatialColumns; column += 1) {
      const cell = analyze([
        column / spatialColumns,
        row / spatialRows,
        (column + 1) / spatialColumns,
        (row + 1) / spatialRows,
      ]);
      spatialCells.push({
        blackFraction: cell.blackFraction,
        column,
        contrast: cell.contrast,
        dynamicRange: cell.dynamicRange,
        edgeEnergy: cell.edgeEnergy,
        highlightFraction: cell.highlightFraction,
        histogram: cell.histogram,
        luminanceMean: cell.luminanceMean,
        meanRgb: cell.meanRgb,
        meanSaturation: cell.meanSaturation,
        row,
      });
    }
  }
  return {
    ...regionMetrics,
    spatial: {
      cells: spatialCells,
      columns: spatialColumns,
      rows: spatialRows,
    },
  };
}

export function sanitizeArtifactName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
