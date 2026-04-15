import {
  relativeLuminance,
  contrastRatio,
  wcagLevel,
  type WcagLevel,
} from "./wcag"

export interface AnalysisStats {
  totalPixels: number
  counts: Record<WcagLevel, number>
  percentages: Record<WcagLevel, number>
}

// ---------------------------------------------------------------------------
// Luminance
// ---------------------------------------------------------------------------

/**
 * Build a Float32Array of per-pixel WCAG relative luminance values (0–1).
 * Input is raw RGBA bytes from ImageData (4 bytes per pixel).
 */
export function buildLuminanceArray(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const n = width * height
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const off = i * 4
    out[i] = relativeLuminance(data[off], data[off + 1], data[off + 2])
  }
  return out
}

// ---------------------------------------------------------------------------
// Contrast maps
// ---------------------------------------------------------------------------

/**
 * Sliding-window min/max over a 1-D array.
 * Uses a deque-based O(n) algorithm for each row/col pass.
 */
function slidingMinMax(
  src: Float32Array,
  n: number,
  radius: number,
): { mins: Float32Array; maxs: Float32Array } {
  const mins = new Float32Array(n)
  const maxs = new Float32Array(n)

  // Monotone deque: stores indices
  const deqMin = new Int32Array(n + 2 * radius)
  const deqMax = new Int32Array(n + 2 * radius)
  let mHead = 0,
    mTail = 0,
    xHead = 0,
    xTail = 0

  for (let i = 0; i < n + radius; i++) {
    // Add clamp(i, 0, n-1) to deque
    const idx = Math.min(i, n - 1)
    const val = src[idx]

    while (mHead < mTail && src[deqMin[mTail - 1]] >= val) mTail--
    deqMin[mTail++] = idx

    while (xHead < xTail && src[deqMax[xTail - 1]] <= val) xTail--
    deqMax[xTail++] = idx

    const writePos = i - radius
    if (writePos >= 0 && writePos < n) {
      mins[writePos] = src[deqMin[mHead]]
      maxs[writePos] = src[deqMax[xHead]]
    }

    const removeIdx = i - 2 * radius
    if (removeIdx >= 0) {
      if (deqMin[mHead] === removeIdx) mHead++
      if (deqMax[xHead] === removeIdx) xHead++
    }
  }

  return { mins, maxs }
}

/**
 * Build a per-pixel local contrast ratio map.
 * For each pixel, computes the contrast ratio between the brightest and
 * darkest pixels within a (2*radius+1) × (2*radius+1) neighbourhood.
 *
 * Uses two separable passes (rows then columns) → O(width × height).
 */
export function buildContrastMap(
  luminance: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  // --- Pass 1: horizontal sliding window per row ---
  const rowMins = new Float32Array(width * height)
  const rowMaxs = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    const rowOff = y * width
    const row = luminance.subarray(rowOff, rowOff + width)
    const { mins, maxs } = slidingMinMax(row, width, radius)
    rowMins.set(mins, rowOff)
    rowMaxs.set(maxs, rowOff)
  }

  // --- Pass 2: vertical sliding window per column ---
  const out = new Float32Array(width * height)
  const colBuf = new Float32Array(height)

  for (let x = 0; x < width; x++) {
    // Extract column from rowMins / rowMaxs
    for (let y = 0; y < height; y++) colBuf[y] = rowMins[y * width + x]
    const { mins: colMins } = slidingMinMax(colBuf, height, radius)

    for (let y = 0; y < height; y++) colBuf[y] = rowMaxs[y * width + x]
    const { maxs: colMaxs } = slidingMinMax(colBuf, height, radius)

    for (let y = 0; y < height; y++) {
      out[y * width + x] = contrastRatio(colMaxs[y], colMins[y])
    }
  }

  return out
}

/**
 * Build an edge-contrast map.
 * For each pixel, computes the maximum contrast ratio against its 8 immediate
 * neighbours. Highlights exact contrast boundaries.
 */
export function buildEdgeMap(
  luminance: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height)
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1]
  const DY = [-1, -1, -1, 0, 0, 1, 1, 1]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = luminance[y * width + x]
      let maxRatio = 1
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d]
        const ny = y + DY[d]
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const ratio = contrastRatio(l, luminance[ny * width + nx])
        if (ratio > maxRatio) maxRatio = ratio
      }
      out[y * width + x] = maxRatio
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function buildStats(contrastMap: Float32Array): AnalysisStats {
  const totalPixels = contrastMap.length
  const counts: Record<WcagLevel, number> = {
    AAA: 0,
    AA: 0,
    "AA-large": 0,
    fail: 0,
  }

  for (let i = 0; i < totalPixels; i++) {
    counts[wcagLevel(contrastMap[i])]++
  }

  const percentages = {
    AAA: totalPixels > 0 ? (counts.AAA / totalPixels) * 100 : 0,
    AA: totalPixels > 0 ? (counts.AA / totalPixels) * 100 : 0,
    "AA-large": totalPixels > 0 ? (counts["AA-large"] / totalPixels) * 100 : 0,
    fail: totalPixels > 0 ? (counts.fail / totalPixels) * 100 : 0,
  }

  return { totalPixels, counts, percentages }
}

// ---------------------------------------------------------------------------
// Colour-mapping helpers — return RGBA [0-255, 0-255, 0-255, 0-255]
// ---------------------------------------------------------------------------

/** Hex colour string like "#ef4444" → [r, g, b] 0–255 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const TIER_COLORS: Record<WcagLevel, [number, number, number]> = {
  AAA: hexToRgb("#22c55e"),
  AA: hexToRgb("#84cc16"),
  "AA-large": hexToRgb("#f97316"),
  fail: hexToRgb("#ef4444"),
}

const TIER_PASSFAIL_ALPHA: Record<WcagLevel, number> = {
  AAA: 0.5,
  AA: 0.35,
  "AA-large": 0.35,
  fail: 0.5,
}

export function ratioToHeatmapRGBA(ratio: number): [number, number, number, number] {
  const level = wcagLevel(ratio)
  const [r, g, b] = TIER_COLORS[level]
  return [r, g, b, 255]
}

export function ratioToPassFailRGBA(
  ratio: number,
  origR: number,
  origG: number,
  origB: number,
): [number, number, number, number] {
  const level = wcagLevel(ratio)
  const [cr, cg, cb] = TIER_COLORS[level]
  const a = TIER_PASSFAIL_ALPHA[level]
  // Blend tint colour over original colour
  return [
    Math.round(origR * (1 - a) + cr * a),
    Math.round(origG * (1 - a) + cg * a),
    Math.round(origB * (1 - a) + cb * a),
    255,
  ]
}

export function luminanceToGrey(l: number): [number, number, number, number] {
  const v = Math.round(l * 255)
  return [v, v, v, 255]
}

// ---------------------------------------------------------------------------
// Render ImageData for a given mode
// ---------------------------------------------------------------------------

export type VisualizationMode =
  | "luminance"
  | "contrast"
  | "passfail"
  | "edge"

export function renderVisualization(
  mode: VisualizationMode,
  luminance: Float32Array,
  contrast: Float32Array,
  edge: Float32Array,
  originalData: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const n = width * height
  const buf = new Uint8ClampedArray(n * 4)

  for (let i = 0; i < n; i++) {
    const off = i * 4
    let r: number, g: number, b: number, a: number

    switch (mode) {
      case "luminance": {
        ;[r, g, b, a] = luminanceToGrey(luminance[i])
        break
      }
      case "contrast": {
        ;[r, g, b, a] = ratioToHeatmapRGBA(contrast[i])
        break
      }
      case "passfail": {
        ;[r, g, b, a] = ratioToPassFailRGBA(
          contrast[i],
          originalData[off],
          originalData[off + 1],
          originalData[off + 2],
        )
        break
      }
      case "edge": {
        ;[r, g, b, a] = ratioToHeatmapRGBA(edge[i])
        break
      }
    }

    buf[off] = r
    buf[off + 1] = g
    buf[off + 2] = b
    buf[off + 3] = a
  }

  return new ImageData(buf, width, height)
}
