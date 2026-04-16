import { useState, useMemo, useCallback } from "react"
import { ImageUploader } from "@/components/ImageUploader"
import { CanvasViewer, type HoverPoint } from "@/components/CanvasViewer"
import { VisualizationControls } from "@/components/VisualizationControls"
import { HoverInfoPanel } from "@/components/HoverInfoPanel"
import { StatsPanel } from "@/components/StatsPanel"
import { Separator } from "@/components/ui/separator"
import { useImageAnalysis } from "@/hooks/useImageAnalysis"
import { renderVisualization, type VisualizationMode } from "@/lib/imageProcessing"

export function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [mode, setMode] = useState<VisualizationMode>("contrast")
  const [radius, setRadius] = useState(5)
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null)

  const analysis = useImageAnalysis(image, radius)

  // Build the original-image ImageData once from raw data
  const originalImageData = useMemo<ImageData | null>(() => {
    if (!analysis.originalData || analysis.width === 0) return null
    return new ImageData(
      new Uint8ClampedArray(analysis.originalData),
      analysis.width,
      analysis.height,
    )
  }, [analysis.originalData, analysis.width, analysis.height])

  // Build the visualization ImageData whenever mode or analysis results change
  const vizImageData = useMemo<ImageData | null>(() => {
    if (
      analysis.status !== "done" ||
      !analysis.luminance ||
      !analysis.contrast ||
      !analysis.edge ||
      !analysis.originalData
    )
      return null

    return renderVisualization(
      mode,
      analysis.luminance,
      analysis.contrast,
      analysis.edge,
      analysis.originalData,
      analysis.width,
      analysis.height,
    )
  }, [
    mode,
    analysis.status,
    analysis.luminance,
    analysis.contrast,
    analysis.edge,
    analysis.originalData,
    analysis.width,
    analysis.height,
  ])

  const handleHover = useCallback((point: HoverPoint | null) => {
    setHoverPoint(point)
  }, [])

  const hasImage = image !== null

  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Contrast Checker logo" className="h-6 w-6" />
            <h1 className="text-lg font-semibold tracking-tight">
              Contrast Checker
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            WCAG 2.1 visual contrast analysis — upload an image to begin
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-6">
        <div className="flex flex-col gap-6">
          {/* Uploader — always visible so user can swap images */}
          <ImageUploader onImageLoaded={setImage} />

          {hasImage && (
            <>
              <Separator />

              {/* Controls */}
              <VisualizationControls
                mode={mode}
                onModeChange={setMode}
                radius={radius}
                onRadiusChange={setRadius}
              />

              <Separator />

              {/* Processing indicator */}
              {analysis.status === "processing" && (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground animate-pulse text-sm">
                    {analysis.step ?? "Preparing…"}
                  </p>
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{
                        width: analysis.stepTotal > 0
                          ? `${(analysis.stepDone / analysis.stepTotal) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Step {analysis.stepDone} of {analysis.stepTotal}
                  </p>
                </div>
              )}

              {analysis.status === "error" && (
                <p className="text-destructive text-sm">
                  Error: {analysis.error}
                </p>
              )}

              {/* Side-by-side viewers */}
              {analysis.wasDownscaled && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <span className="mt-px">⚠</span>
                  <span>
                    Image downscaled from{" "}
                    <strong>{analysis.originalWidth}×{analysis.originalHeight}</strong> to{" "}
                    <strong>{analysis.width}×{analysis.height}</strong>{" "}
                    to stay within the 4 MP processing limit. Analysis reflects the scaled version.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CanvasViewer
                  imageData={originalImageData}
                  label="Original"
                  onHover={handleHover}
                  externalHover={hoverPoint}
                  loading={analysis.status === "processing" && !analysis.originalData}
                />
                <CanvasViewer
                  imageData={vizImageData}
                  label={
                    mode === "luminance"
                      ? "Luminance Map"
                      : mode === "contrast"
                        ? "Contrast Heatmap"
                        : mode === "passfail"
                          ? "Pass / Fail Overlay"
                          : "Edge Contrast Map"
                  }
                  onHover={handleHover}
                  externalHover={hoverPoint}
                  loading={analysis.status === "processing"}
                />
              </div>

              {/* Hover info */}
              <div className="rounded-md border px-4 py-3">
                <HoverInfoPanel
                  hoverPoint={hoverPoint}
                  originalData={analysis.originalData}
                  contrastData={analysis.contrast}
                  luminanceData={analysis.luminance}
                  width={analysis.width}
                />
              </div>

              {/* Stats */}
              {analysis.status === "done" && analysis.stats && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">
                      Pixel Distribution by WCAG Tier
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      Based on local neighbourhood contrast (radius {radius}px).
                      Each pixel's contrast is computed as the ratio between the
                      brightest and darkest pixel in its surrounding window.
                    </p>
                    <StatsPanel stats={analysis.stats} />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t px-6 py-3 text-center">
        <p className="text-muted-foreground text-xs">
          Processing is fully client-side · WCAG 2.1 contrast algorithm ·{" "}
          <kbd className="bg-muted rounded px-1">d</kbd> toggles dark mode
        </p>
      </footer>
    </div>
  )
}

export default App
