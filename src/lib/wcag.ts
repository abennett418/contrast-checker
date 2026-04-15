/** Convert a single sRGB channel value (0–255) to linear light. */
export function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/**
 * WCAG 2.1 relative luminance.
 * @param r Red channel 0–255
 * @param g Green channel 0–255
 * @param b Blue channel 0–255
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  )
}

/**
 * WCAG 2.1 contrast ratio between two relative luminance values.
 * Result is in range [1, 21].
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export type WcagLevel = "AAA" | "AA" | "AA-large" | "fail"

/**
 * Map a contrast ratio to the highest WCAG 2.1 level it satisfies.
 * - AAA:      ratio ≥ 7:1   (normal text)
 * - AA:       ratio ≥ 4.5:1 (normal text) / ≥ 3:1 (large text)
 * - AA-large: ratio ≥ 3:1   (large text only)
 * - fail:     ratio < 3:1
 */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA"
  if (ratio >= 4.5) return "AA"
  if (ratio >= 3) return "AA-large"
  return "fail"
}

export interface WcagTierInfo {
  level: WcagLevel
  label: string
  ratioRange: string
  heatmapColor: string // CSS hex
  passFailColor: string // CSS hex
  passFailAlpha: number // 0–1
}

export const WCAG_TIERS: WcagTierInfo[] = [
  {
    level: "AAA",
    label: "AAA",
    ratioRange: "≥ 7:1",
    heatmapColor: "#22c55e",
    passFailColor: "#22c55e",
    passFailAlpha: 0.5,
  },
  {
    level: "AA",
    label: "AA",
    ratioRange: "4.5–7:1",
    heatmapColor: "#84cc16",
    passFailColor: "#84cc16",
    passFailAlpha: 0.35,
  },
  {
    level: "AA-large",
    label: "AA large",
    ratioRange: "3–4.5:1",
    heatmapColor: "#f97316",
    passFailColor: "#f97316",
    passFailAlpha: 0.35,
  },
  {
    level: "fail",
    label: "Fail",
    ratioRange: "< 3:1",
    heatmapColor: "#ef4444",
    passFailColor: "#ef4444",
    passFailAlpha: 0.5,
  },
]

export function tierInfo(level: WcagLevel): WcagTierInfo {
  return WCAG_TIERS.find((t) => t.level === level)!
}
