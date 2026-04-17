import { useEffect, useRef, useCallback, useState } from "react"
import { Expand, Download, X } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface HoverPoint {
  x: number
  y: number
}

interface CanvasViewerProps {
  imageData: ImageData | null
  label: string
  onHover?: (point: HoverPoint | null) => void
  externalHover?: HoverPoint | null
  /** Show a loading indicator. Keeps previous image visible while overlaying a spinner. */
  loading?: boolean
}

export function CanvasViewer({
  imageData,
  label,
  onHover,
  externalHover,
  loading = false,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const isPortrait = imageData ? imageData.height > imageData.width : false

  // Draw image data whenever it changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageData) return
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.putImageData(imageData, 0, 0)
  }, [imageData])

  // Draw crosshair on overlay canvas
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !imageData) return
    overlay.width = imageData.width
    overlay.height = imageData.height
    const ctx = overlay.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    if (!externalHover) return

    const { x, y } = externalHover
    ctx.save()
    ctx.strokeStyle = "rgba(255,255,255,0.85)"
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])

    // Horizontal line
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(overlay.width, y + 0.5)
    ctx.stroke()

    // Vertical line
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, overlay.height)
    ctx.stroke()

    // Small circle at intersection
    ctx.setLineDash([])
    ctx.strokeStyle = "rgba(255,255,255,0.95)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x + 0.5, y + 0.5, 5, 0, Math.PI * 2)
    ctx.stroke()

    ctx.restore()
  }, [externalHover, imageData])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onHover || !imageData) return
      // Use the canvas rect so coordinates are correct regardless of how the
      // canvas is positioned inside its container (e.g. centred portrait images).
      const canvas = canvasRef.current
      const rect = canvas ? canvas.getBoundingClientRect() : e.currentTarget.getBoundingClientRect()
      // Clamp to canvas bounds — ignore moves over the surrounding container
      const relX = e.clientX - rect.left
      const relY = e.clientY - rect.top
      if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
        onHover(null)
        return
      }
      // Scale from CSS pixel coordinates to image pixel coordinates
      const scaleX = imageData.width / rect.width
      const scaleY = imageData.height / rect.height
      const x = Math.floor(relX * scaleX)
      const y = Math.floor(relY * scaleY)
      const clampedX = Math.max(0, Math.min(imageData.width - 1, x))
      const clampedY = Math.max(0, Math.min(imageData.height - 1, y))
      onHover({ x: clampedX, y: clampedY })
    },
    [onHover, imageData],
  )

  const handleMouseLeave = useCallback(() => {
    onHover?.(null)
  }, [onHover])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.href = canvas.toDataURL("image/png")
    a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.png`
    a.click()
  }, [label])

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {/* Label row with action buttons */}
        <div className="flex items-center justify-between h-6">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {label}
          </span>
          {imageData && !loading && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDownload}
                title={`Download ${label}`}
                aria-label={`Download ${label}`}
              >
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setLightboxOpen(true)}
                title={`Expand ${label}`}
                aria-label={`Expand ${label} to full screen`}
              >
                <Expand />
              </Button>
            </div>
          )}
        </div>

        {/* Canvas area */}
        <div
          className={[
            "relative overflow-hidden rounded-md border",
            isPortrait ? "flex max-h-[60vh] w-full justify-center" : "w-full",
          ].join(" ")}
          style={{ cursor: onHover ? "crosshair" : "default" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {imageData ? (
            <div className="relative">
              <canvas
                ref={canvasRef}
                className={isPortrait ? "block h-full max-h-[60vh] w-auto" : "block w-full"}
                style={{ imageRendering: "pixelated" }}
              />
              <canvas
                ref={overlayRef}
                className={[
                  "pointer-events-none absolute inset-0 block",
                  isPortrait ? "h-full w-auto" : "w-full",
                ].join(" ")}
                style={{ imageRendering: "pixelated" }}
              />
              {loading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                  <div className="border-primary size-9 animate-spin rounded-full border-2 border-t-transparent" />
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="bg-muted flex aspect-video animate-pulse items-center justify-center rounded-md">
              <div className="border-primary size-9 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : (
            <div className="bg-muted flex aspect-video items-center justify-center rounded-md">
              <span className="text-muted-foreground text-sm">No image</span>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox dialog */}
      {imageData && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent showCloseButton={false} className="flex max-h-[90vh] max-w-[90vw] flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-sm font-medium">{label}</DialogTitle>
                <span className="text-muted-foreground text-xs">{imageData.width} × {imageData.height}px</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDownload}
                  title={`Download ${label}`}
                  aria-label={`Download ${label}`}
                >
                  <Download />
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close">
                    <X />
                  </Button>
                </DialogClose>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto flex items-center justify-center">
              <canvas
                ref={(el) => {
                  if (!el) return
                  el.width = imageData.width
                  el.height = imageData.height
                  const ctx = el.getContext("2d")
                  ctx?.putImageData(imageData, 0, 0)
                }}
                className="block max-h-full max-w-full"
                style={{
                  imageRendering: "pixelated",
                  ...(isPortrait
                    ? { height: "100%", width: "auto" }
                    : { width: "100%", height: "auto" }),
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
