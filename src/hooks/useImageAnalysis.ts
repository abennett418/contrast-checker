import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { AnalysisStats } from "@/lib/imageProcessing"
import type {
  AnalyzeRequest,
  AnalyzeFromBitmapRequest,
  WorkerOutMessage,
} from "@/workers/imageAnalysis.worker"
import AnalysisWorker from "@/workers/imageAnalysis.worker?worker"

export type AnalysisStatus = "idle" | "processing" | "done" | "error"

export interface AnalysisState {
  status: AnalysisStatus
  step: string | null
  stepDone: number
  stepTotal: number
  luminance: Float32Array | null
  contrast: Float32Array | null
  edge: Float32Array | null
  stats: AnalysisStats | null
  originalData: Uint8ClampedArray | null
  width: number
  height: number
  /** Original image dimensions before any downscaling. */
  originalWidth: number
  originalHeight: number
  wasDownscaled: boolean
  error: string | null
}

/** If image exceeds this many pixels it will be downscaled before processing. */
const MAX_PIXELS = 4_000_000 // 4 MP

/** Debounce only applies when radius changes on an already-loaded image. */
const RADIUS_DEBOUNCE_MS = 300

const IDLE_STATE: AnalysisState = {
  status: "idle",
  step: null,
  stepDone: 0,
  stepTotal: 5,
  luminance: null,
  contrast: null,
  edge: null,
  stats: null,
  originalData: null,
  width: 0,
  height: 0,
  originalWidth: 0,
  originalHeight: 0,
  wasDownscaled: false,
  error: null,
}

export function useImageAnalysis(
  image: HTMLImageElement | null,
  radius: number,
): AnalysisState {
  const [state, setState] = useState<AnalysisState>(IDLE_STATE)

  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  // Tracks which image the layout effect last processed — prevents double-run
  // in React StrictMode from clearing state that was just set.
  const prevImageRef = useRef<HTMLImageElement | null>(null)

  // Cached pixel data for radius-only reanalysis (avoids re-extracting from image).
  const cachedPixelDataRef = useRef<Uint8ClampedArray | null>(null)
  const cachedWidthRef = useRef(0)
  const cachedHeightRef = useRef(0)

  // Always up-to-date radius, read inside async closures.
  const radiusRef = useRef(radius)
  radiusRef.current = radius

  // ── Worker lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new AnalysisWorker()
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data
      if (msg.requestId !== requestIdRef.current) return

      switch (msg.type) {
        case "progress":
          setState((prev) => ({
            ...prev,
            step: msg.step,
            stepDone: msg.done,
            stepTotal: msg.total,
          }))
          break

        case "result": {
          if (msg.originalBuffer) {
            const pd = new Uint8ClampedArray(msg.originalBuffer)
            cachedPixelDataRef.current = pd
            cachedWidthRef.current = msg.width
            cachedHeightRef.current = msg.height

            setState((prev) => ({
              ...prev,
              status: "done",
              step: null,
              stepDone: prev.stepTotal,
              luminance: new Float32Array(msg.luminanceBuffer),
              contrast: new Float32Array(msg.contrastBuffer),
              edge: new Float32Array(msg.edgeBuffer),
              stats: msg.stats,
              originalData: pd,
              width: msg.width,
              height: msg.height,
              originalWidth: msg.origWidth,
              originalHeight: msg.origHeight,
              wasDownscaled: msg.wasDownscaled,
            }))
          } else {
            setState((prev) => ({
              ...prev,
              status: "done",
              step: null,
              stepDone: prev.stepTotal,
              luminance: new Float32Array(msg.luminanceBuffer),
              contrast: new Float32Array(msg.contrastBuffer),
              edge: new Float32Array(msg.edgeBuffer),
              stats: msg.stats,
            }))
          }
          break
        }

        case "error":
          setState((prev) => ({
            ...prev,
            status: "error",
            step: null,
            error: msg.message,
          }))
          break
      }
    }

    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault()
      setState((prev) => ({
        ...prev,
        status: "error",
        step: null,
        error: e.message || "Worker encountered an unknown error",
      }))
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // ── Synchronous clear before paint (useLayoutEffect) ─────────────────────
  // Runs before the browser paints whenever `image` changes.
  // Immediately wipes all previous result data and shows the processing
  // state so the user never sees stale output during a new image load.
  useLayoutEffect(() => {
    if (prevImageRef.current === image) return

    // Cancel any queued radius-reanalysis debounce.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    cachedPixelDataRef.current = null
    ++requestIdRef.current // make any in-flight worker response stale
    prevImageRef.current = image

    if (!image) {
      setState(IDLE_STATE)
      return
    }

    const origW = image.naturalWidth
    const origH = image.naturalHeight
    const pixels = origW * origH
    let targetW = origW
    let targetH = origH
    if (pixels > MAX_PIXELS) {
      const scale = Math.sqrt(MAX_PIXELS / pixels)
      targetW = Math.max(1, Math.round(origW * scale))
      targetH = Math.max(1, Math.round(origH * scale))
    }

    // Full reset — clears originalData so CanvasViewer shows skeleton, not old image.
    setState({
      ...IDLE_STATE,
      status: "processing",
      step: "Preparing…",
      stepDone: 0,
      stepTotal: 5,
      originalWidth: origW,
      originalHeight: origH,
      wasDownscaled: targetW !== origW || targetH !== origH,
    })
  }, [image])

  // ── Async work (useEffect) ────────────────────────────────────────────────
  // Runs after paint. Two paths:
  //   • cachedPixelDataRef is null  → new image, decode bitmap + dispatch to worker
  //   • cachedPixelDataRef has data → radius changed, debounced re-dispatch
  useEffect(() => {
    if (!image) return

    if (!cachedPixelDataRef.current) {
      // ── New image path ──────────────────────────────────────────────────
      const origW = image.naturalWidth
      const origH = image.naturalHeight
      const pixels = origW * origH
      let targetW = origW
      let targetH = origH
      if (pixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / pixels)
        targetW = Math.max(1, Math.round(origW * scale))
        targetH = Math.max(1, Math.round(origH * scale))
      }

      // Capture the requestId that the layout effect already incremented.
      const requestId = requestIdRef.current
      let cancelled = false

      void (async () => {
        try {
          const bitmap = await createImageBitmap(image, {
            resizeWidth: targetW,
            resizeHeight: targetH,
            resizeQuality: "medium",
          })

          if (cancelled || requestId !== requestIdRef.current) {
            bitmap.close()
            return
          }

          const worker = workerRef.current
          if (!worker) {
            bitmap.close()
            return
          }

          const request: AnalyzeFromBitmapRequest = {
            type: "analyzeFromBitmap",
            requestId,
            bitmap,
            width: targetW,
            height: targetH,
            origWidth: origW,
            origHeight: origH,
            radius: radiusRef.current,
          }
          worker.postMessage(request, [bitmap as unknown as Transferable])
        } catch (err) {
          if (!cancelled && requestId === requestIdRef.current) {
            setState((prev) => ({
              ...prev,
              status: "error",
              step: null,
              error: err instanceof Error ? err.message : String(err),
            }))
          }
        }
      })()

      return () => {
        cancelled = true
      }
    } else {
      // ── Radius change path ──────────────────────────────────────────────
      setState((prev) => ({
        ...prev,
        status: "processing",
        step: "Reanalysing…",
        stepDone: 0,
        stepTotal: 4,
      }))

      const cachedData = cachedPixelDataRef.current

      debounceRef.current = setTimeout(() => {
        const requestId = ++requestIdRef.current
        const buffer = cachedData.buffer.slice(0) as ArrayBuffer
        const worker = workerRef.current
        if (!worker) return

        const request: AnalyzeRequest = {
          type: "analyze",
          requestId,
          buffer,
          width: cachedWidthRef.current,
          height: cachedHeightRef.current,
          radius: radiusRef.current,
        }
        worker.postMessage(request, [buffer])
      }, RADIUS_DEBOUNCE_MS)

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }
  }, [image, radius])

  return state
}

