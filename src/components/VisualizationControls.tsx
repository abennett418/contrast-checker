import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WCAG_TIERS } from "@/lib/wcag"
import type { VisualizationMode } from "@/lib/imageProcessing"

interface VisualizationControlsProps {
  mode: VisualizationMode
  onModeChange: (mode: VisualizationMode) => void
  radius: number
  onRadiusChange: (radius: number) => void
}

const MODES: { value: VisualizationMode; label: string; description: string }[] = [
  {
    value: "luminance",
    label: "Luminance",
    description: "Greyscale WCAG relative luminance (0=black, 1=white)",
  },
  {
    value: "contrast",
    label: "Contrast Heatmap",
    description: "Local contrast ratio colour-coded by WCAG tier",
  },
  {
    value: "passfail",
    label: "Pass / Fail",
    description: "Original image tinted by WCAG compliance tier",
  },
  {
    value: "edge",
    label: "Edge Contrast",
    description: "Per-pixel contrast against immediate neighbours",
  },
]

export function VisualizationControls({
  mode,
  onModeChange,
  radius,
  onRadiusChange,
}: VisualizationControlsProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Mode selector */}
      <div className="flex flex-col gap-2">
        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Visualization Mode
        </label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && onModeChange(v as VisualizationMode)}
          className="flex flex-wrap justify-start gap-1"
        >
          {MODES.map((m) => (
            <ToggleGroupItem
              key={m.value}
              value={m.value}
              title={m.description}
              className="text-xs"
            >
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Radius slider (only relevant for contrast / passfail modes) */}
      <div className="flex flex-col gap-2">
        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Neighbourhood Radius —{" "}
          <span className="text-foreground font-semibold">{radius}px</span>
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            (affects Contrast Heatmap &amp; Pass/Fail)
          </span>
        </label>
        <Slider
          min={1}
          max={20}
          step={1}
          value={[radius]}
          onValueChange={([v]) => onRadiusChange(v)}
          className="max-w-xs"
          aria-label="Neighbourhood radius"
        />
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          WCAG 2.1 Legend
        </span>
        <div className="flex flex-wrap gap-3">
          {WCAG_TIERS.map((tier) => (
            <div key={tier.level} className="flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-sm"
                style={{ background: tier.heatmapColor }}
              />
              <span className="text-xs">
                <span className="font-medium">{tier.label}</span>{" "}
                <span className="text-muted-foreground">{tier.ratioRange}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
