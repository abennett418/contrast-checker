import { useEffect, useRef, useCallback } from "react"

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
  // Separate canvas for the crosshair overlay so we don't redraw the image
  const overlayRef = useRef<HTMLCanvasElement>(null)

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
      const div = e.currentTarget
      const rect = div.getBoundingClientRect()
      // Scale from CSS pixel coordinates to image pixel coordinates
      const scaleX = imageData.width / rect.width
      const scaleY = imageData.height / rect.height
      const x = Math.floor((e.clientX - rect.left) * scaleX)
      const y = Math.floor((e.clientY - rect.top) * scaleY)
      const clampedX = Math.max(0, Math.min(imageData.width - 1, x))
      const clampedY = Math.max(0, Math.min(imageData.height - 1, y))
      onHover({ x: clampedX, y: clampedY })
    },
    [onHover, imageData],
  )

  const handleMouseLeave = useCallback(() => {
    onHover?.(null)
  }, [onHover])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <div
        className="relative w-full overflow-hidden rounded-md border"
        style={{ cursor: onHover ? "crosshair" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {imageData ? (
          <>
            <canvas
              ref={canvasRef}
              className="block w-full"
              style={{ imageRendering: "pixelated" }}
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 block w-full"
              style={{ imageRendering: "pixelated" }}
            />
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                <div className="border-primary size-9 animate-spin rounded-full border-2 border-t-transparent" />
              </div>
            )}
          </>
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
  )
}
