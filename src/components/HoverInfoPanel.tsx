import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { contrastRatio, wcagLevel, WCAG_TIERS, type WcagLevel } from "@/lib/wcag"
import type { HoverPoint } from "@/components/CanvasViewer"

interface HoverInfoPanelProps {
  hoverPoint: HoverPoint | null
  originalData: Uint8ClampedArray | null
  contrastData: Float32Array | null
  luminanceData: Float32Array | null
  width: number
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  )
}

const BADGE_VARIANT: Record<WcagLevel, "default" | "secondary" | "outline" | "destructive"> = {
  AAA: "default",
  AA: "secondary",
  "AA-large": "outline",
  fail: "destructive",
}

export function HoverInfoPanel({
  hoverPoint,
  originalData,
  contrastData,
  luminanceData,
  width,
}: HoverInfoPanelProps) {
  if (!hoverPoint || !originalData || !contrastData || !luminanceData) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <span className="bg-muted inline-block size-4 rounded-sm border" />
        Hover over either image to inspect a pixel
      </div>
    )
  }

  const { x, y } = hoverPoint
  const idx = y * width + x
  const off = idx * 4

  const r = originalData[off]
  const g = originalData[off + 1]
  const b = originalData[off + 2]
  const hex = toHex(r, g, b)
  const lum = luminanceData[idx]
  const localContrast = contrastData[idx]
  const level = wcagLevel(localContrast)
  const tierMeta = WCAG_TIERS.find((t) => t.level === level)!

  // Which WCAG levels does this contrast ratio satisfy?
  const satisfied: WcagLevel[] = []
  if (localContrast >= 7) satisfied.push("AAA")
  if (localContrast >= 4.5) satisfied.push("AA")
  if (localContrast >= 3) satisfied.push("AA-large")

  // Max contrast: against black (L=0) and white (L=1)
  const ratioVsBlack = contrastRatio(lum, 0)
  const ratioVsWhite = contrastRatio(lum, 1)
  const bestIsBlack = ratioVsBlack >= ratioVsWhite
  const bestHex = bestIsBlack ? "#000000" : "#FFFFFF"
  const bestRatio = bestIsBlack ? ratioVsBlack : ratioVsWhite

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {/* Colour swatch */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-6 rounded border shadow-sm"
          style={{ background: hex }}
          title={hex}
        />
        <span className="font-mono text-xs">{hex}</span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Position */}
      <span className="text-muted-foreground font-mono text-xs">
        {x},{y}
      </span>

      <Separator orientation="vertical" className="h-5" />

      {/* Luminance */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Luminance</span>
        <span className="font-mono text-xs font-medium">{lum.toFixed(3)}</span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Local contrast ratio */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Local contrast</span>
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: tierMeta.heatmapColor }}
        >
          {localContrast.toFixed(2)}:1
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* WCAG badges */}
      <div className="flex items-center gap-1">
        {satisfied.length > 0 ? (
          satisfied.map((lvl) => (
            <Badge key={lvl} variant={BADGE_VARIANT[lvl]} className="text-xs">
              {lvl === "AA-large" ? "AA large" : lvl}
            </Badge>
          ))
        ) : (
          <Badge variant="destructive" className="text-xs">
            Fail
          </Badge>
        )}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Max contrast recommendation */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Max contrast</span>
        {/* Both options, winner highlighted */}
        {([{ hex: "#000000", ratio: ratioVsBlack }, { hex: "#FFFFFF", ratio: ratioVsWhite }] as const).map(
          ({ hex: optHex, ratio: optRatio }) => {
            const isBest = optHex === bestHex
            return (
              <span
                key={optHex}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${isBest ? "ring-primary ring-1" : "opacity-40"
                  }`}
                title={isBest ? "Best option" : undefined}
              >
                <span
                  className="inline-block size-3 flex-shrink-0 rounded-sm border"
                  style={{ background: optHex }}
                />
                <span className="font-mono text-xs font-medium">
                  {optRatio.toFixed(2)}:1
                </span>
                {isBest && (
                  <Badge variant={BADGE_VARIANT[wcagLevel(bestRatio)]} className="ml-0.5 text-xs">
                    {wcagLevel(bestRatio) === "AA-large" ? "AA large" : wcagLevel(bestRatio)}
                  </Badge>
                )}
              </span>
            )
          },
        )}
      </div>
    </div>
  )
}
